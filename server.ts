// Load .env BEFORE anything else: pg.ts reads process.env.DATABASE_URL while
// this module's imports are evaluated, and dotenv never overrides variables
// already provided by the platform (Vercel/Render/Docker). No .env file → no-op.
import 'dotenv/config';

import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import crypto from 'crypto';
import { db, ALL_SCOPES, isKnownScope } from './src/server/db.ts';
import { databasePool, ensureSchema } from './src/server/pg.ts';
import { createAccount, verifyAccount, createSession, resolveSession, revokeSession, upsertOAuthUser, updateProfile, forgetAccount, getTwoFactorSecret, setTwoFactor, findUserById, invalidateResolveCache, rowToUser, usernameValidationError, isUsernameTaken, findPublicProfile, hashPassword, verifyPasswordFor, setPassword, listUserSessions, revokeUserSession, revokeOtherSessions, getTotpLastStep, setTotpLastStep, getTotpLockoutMs, registerTotpFailure, clearTotpFailures } from './src/server/authStore.ts';
import { generateTotpSecret, verifyTotp, verifyTotpStep, totpOtpauthUrl } from './src/server/totp.ts';
import {
  getProviderConfig,
  isOAuthProvider,
  listConfiguredProviders,
  signState,
  verifyState,
  newOAuthNonce,
  buildAuthorizeUrl,
  callbackUrl,
  appBaseUrl,
  exchangeCode,
  fetchProfile,
} from './src/server/oauth.ts';
import { processAiQuery, processAiQueryStream, diagnoseAndFixCode, performSemanticSearch, searchYouTubeVideos, getLastAiUpstream } from './src/server/aiService.ts';
import { remoteAnalyze, remoteReport, getAnalyticsServiceUrl } from './src/server/analyticsRemote.ts';
import { nativeAnalyze, nativeReport, nativeTimeseriesCsv, nativeEndpointsCsv, ANALYTICS_PERIODS, type AnalyticsPeriod, type UsageEvent } from './src/server/analyticsNative.ts';
import { authenticateApiKey, requireScope, rateWindowStatus, nextQuotaReset } from './src/server/apiKeyAuth.ts';
import { loadApiKeys, saveApiKey, flushAllUsage } from './src/server/apiKeyStore.ts';
import { saveGitHubToken, getGitHubToken, clearGitHubToken, listUserRepos, importRepoFiles, GITHUB_ERRORS } from './src/server/githubStore.ts';
import { createProject, getProject, listProjects, listPublicProjects, deleteProject, createSnippet, getSnippet, listSnippets, listPublicSnippets, deleteSnippet, purgePublishedData, projectDetail, snippetDetail, MAX_TITLE, MAX_DESCRIPTION, MAX_SNIPPET } from './src/server/publishStore.ts';
import {
  createOAuthApp,
  listOAuthApps,
  lookupOAuthApp,
  deleteOAuthApp,
  authenticateClient,
  createAuthorizationCode,
  consumeAuthorizationCode,
  createAccessToken,
  resolveAccessToken,
  revokeAccessToken,
  purgeOAuthAppData,
  listUserGrants,
  revokeUserGrants,
  revokeAllUserGrants,
  verifyPkce,
  isValidRedirectUri,
  isKnownOAuthScope,
  AUTH_CODE_TTL_MS,
  ACCESS_TOKEN_TTL_MS,
} from './src/server/oauthAppsStore.ts';
import type { OAuthApp } from './src/server/oauthAppsStore.ts';
import {
  listServerPlans,
  getServerPlan,
  createServerPlan,
  updateServerPlan,
  deleteServerPlan,
  createServerRequest,
  listServerRequests,
  getServerRequest,
  findServerRequestByTrackToken,
  updateServerRequest,
  isServerRequestStatus,
} from './src/server/serverOrdersStore.ts';
import { ClientSource, UserRole, PermissionScope, ProductSuggestion, ApiKey, User, AuditLog, VerificationType, AdminInvite, WebhookEndpoint, WebhookDeliveryLog, PublicUserComment, ProfileLink, SocialAccount, SocialConversation, DirectMessage, ServerRequest } from './src/types.ts';
import { getActorUser, requireAdmin, rateLimit, sanitizeText, sanitizeUrl, csvCell, parsePagination, secureToken, secureId, isValidScope } from './src/server/security.ts';

function mapSuggestion(row: Record<string, any>): ProductSuggestion {
  return {
    id: row.id,
    title: row.title,
    details: row.details,
    category: row.category,
    status: row.status,
    createdAt: row.created_at,
    authorName: row.author_name,
    code: row.code || undefined,
    adminNote: row.admin_note || undefined,
  };
}

async function createSuggestion(params: Omit<ProductSuggestion, 'id' | 'createdAt' | 'status'>): Promise<ProductSuggestion> {
  if (!databasePool) return db.createSuggestion(params);
  const result = await databasePool.query(
    `insert into public.product_suggestions (title, details, category, code, author_name)
     values ($1, $2, $3, $4, $5) returning *`,
    [params.title, params.details, params.category, params.code || null, params.authorName]
  );
  return mapSuggestion(result.rows[0]);
}

async function listSuggestions(): Promise<ProductSuggestion[]> {
  if (!databasePool) return db.productSuggestions;
  const result = await databasePool.query('select * from public.product_suggestions order by created_at desc');
  return result.rows.map(mapSuggestion);
}

async function updateSuggestion(id: string, status: ProductSuggestion['status'], adminNote?: string): Promise<ProductSuggestion | undefined> {
  if (!databasePool) return db.updateSuggestionStatus(id, status, adminNote);
  const result = await databasePool.query(
    `update public.product_suggestions set status = $2, admin_note = coalesce($3, admin_note) where id = $1 returning *`,
    [id, status, adminNote ?? null]
  );
  return result.rows[0] ? mapSuggestion(result.rows[0]) : undefined;
}

async function findSuggestion(id: string): Promise<ProductSuggestion | undefined> {
  if (!databasePool) return db.productSuggestions.find((item) => item.id === id);
  const result = await databasePool.query('select * from public.product_suggestions where id = $1', [id]);
  return result.rows[0] ? mapSuggestion(result.rows[0]) : undefined;
}

// ---------------------------------------------------------------------------
// Doc comments — REAL comments written by registered users under docs pages.
// PostgreSQL when DATABASE_URL is set, in-memory otherwise. NEVER seeded:
// a fresh install always starts with zero comments (no fake comments, ever).
// ---------------------------------------------------------------------------
export interface DocComment {
  id: string;
  docId: string;
  userId: string;
  authorName: string;
  authorAvatar: string;
  body: string;
  createdAt: string;
}

const memoryComments: DocComment[] = [];

function mapComment(row: Record<string, any>): DocComment {
  return {
    id: row.id,
    docId: row.doc_id,
    userId: row.user_id,
    authorName: row.author_name,
    authorAvatar: row.author_avatar || '',
    body: row.body,
    createdAt: row.created_at,
  };
}

async function listComments(docId: string): Promise<DocComment[]> {
  if (!databasePool) return memoryComments.filter((c) => c.docId === docId);
  await ensureSchema();
  const result = await databasePool.query(
    'select * from public.comments where doc_id = $1 order by created_at asc limit 500',
    [docId],
  );
  return result.rows.map(mapComment);
}

// Admin moderation: every comment across every docs page, newest first.
async function listAllComments(limit = 200): Promise<DocComment[]> {
  if (!databasePool) return [...memoryComments].reverse().slice(0, limit);
  await ensureSchema();
  const size = Math.min(Math.max(limit, 1), 500);
  const result = await databasePool.query(
    'select * from public.comments order by created_at desc limit $1',
    [size],
  );
  return result.rows.map(mapComment);
}

async function createComment(params: {
  docId: string;
  userId: string;
  authorName: string;
  authorAvatar: string;
  body: string;
}): Promise<DocComment> {
  const id = secureId('cmt');
  if (!databasePool) {
    const comment: DocComment = {
      id,
      docId: params.docId,
      userId: params.userId,
      authorName: params.authorName,
      authorAvatar: params.authorAvatar,
      body: params.body,
      createdAt: new Date().toISOString(),
    };
    memoryComments.push(comment);
    return comment;
  }
  await ensureSchema();
  const result = await databasePool.query(
    `insert into public.comments (id, doc_id, user_id, author_name, author_avatar, body)
     values ($1, $2, $3, $4, $5, $6) returning *`,
    [id, params.docId, params.userId, params.authorName, params.authorAvatar, params.body],
  );
  return mapComment(result.rows[0]);
}

async function deleteComment(id: string, actor: { id: string; role: UserRole }): Promise<'deleted' | 'forbidden' | 'not_found'> {
  if (!databasePool) {
    const idx = memoryComments.findIndex((c) => c.id === id);
    if (idx === -1) return 'not_found';
    if (memoryComments[idx].userId !== actor.id && actor.role !== 'ADMIN') return 'forbidden';
    memoryComments.splice(idx, 1);
    return 'deleted';
  }
  await ensureSchema();
  const existing = await databasePool.query('select user_id from public.comments where id = $1', [id]);
  if (!existing.rows[0]) return 'not_found';
  if (existing.rows[0].user_id !== actor.id && actor.role !== 'ADMIN') return 'forbidden';
  await databasePool.query('delete from public.comments where id = $1', [id]);
  return 'deleted';
}

// Public profile activity — REAL aggregates of this author's docs comments.
// Every comment is already readable by anyone on its docs page; a profile
// only groups them. The payload carries count + the 5 newest with slug,
// body and date only — never user ids or emails (see PublicUserComment).
async function publicCommentActivity(
  username: string,
): Promise<{ commentCount: number; recentComments: PublicUserComment[] }> {
  const u = username.trim().toLowerCase();
  if (!databasePool) {
    const user = db.users.find((x) => (x.username || '').toLowerCase() === u);
    const mine = user
      ? memoryComments
          .filter((c) => c.userId === user.id)
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      : [];
    return {
      commentCount: mine.length,
      recentComments: mine.slice(0, 5).map((c) => ({ docSlug: c.docId, body: c.body, createdAt: c.createdAt })),
    };
  }
  await ensureSchema();
  const [countR, recentR] = await Promise.all([
    databasePool.query(
      'select count(*)::int as count from public.comments c join public.users u on u.id = c.user_id where lower(u.username) = $1',
      [u],
    ),
    databasePool.query(
      `select c.doc_id, c.body, c.created_at
         from public.comments c
         join public.users u on u.id = c.user_id
        where lower(u.username) = $1
        order by c.created_at desc
        limit 5`,
      [u],
    ),
  ]);
  const iso = (v: any) => (v instanceof Date ? v.toISOString() : String(v));
  return {
    commentCount: countR.rows[0]?.count ?? 0,
    recentComments: recentR.rows.map((r) => ({ docSlug: r.doc_id, body: r.body, createdAt: iso(r.created_at) })),
  };
}

// ---------------------------------------------------------------------------
// AI chat history — the signed-in account's own conversation, persisted per
// user (PostgreSQL when DATABASE_URL is set, in-memory otherwise). Only ever
// contains messages that account actually exchanged; never seeded, and it is
// wiped when the account is deleted.
// ---------------------------------------------------------------------------
export interface AiChatHistoryMessage {
  id: string;
  userId: string;
  role: 'user' | 'ai';
  content: string;
  persona: string;
  createdAt: string;
}

const memoryAiChat: AiChatHistoryMessage[] = [];
const AI_HISTORY_PAGE = 100; // messages returned per fetch
const AI_HISTORY_RETAIN = 400; // max stored messages per user (memory mode)

function mapAiChatRow(row: Record<string, any>): AiChatHistoryMessage {
  return {
    id: row.id,
    userId: row.user_id,
    role: row.role,
    content: row.content,
    persona: row.persona || '',
    createdAt: row.created_at,
  };
}

async function listAiChatHistory(userId: string): Promise<AiChatHistoryMessage[]> {
  if (!databasePool) {
    return memoryAiChat.filter((m) => m.userId === userId).slice(-AI_HISTORY_PAGE);
  }
  await ensureSchema();
  const result = await databasePool.query(
    `select * from (
       select * from public.ai_chat_messages where user_id = $1
       order by created_at desc limit $2
     ) page order by created_at asc`,
    [userId, AI_HISTORY_PAGE],
  );
  return result.rows.map(mapAiChatRow);
}

async function appendAiChatMessage(params: {
  userId: string;
  role: 'user' | 'ai';
  content: string;
  persona?: string;
}): Promise<AiChatHistoryMessage | null> {
  const content = params.content.slice(0, 20000).trim();
  if (!content) return null;
  const id = secureId('aim');

  if (!databasePool) {
    const message: AiChatHistoryMessage = {
      id,
      userId: params.userId,
      role: params.role,
      content,
      persona: params.persona || '',
      createdAt: new Date().toISOString(),
    };
    memoryAiChat.push(message);
    const mine = memoryAiChat.filter((m) => m.userId === params.userId);
    if (mine.length > AI_HISTORY_RETAIN) {
      const excessIds = new Set(mine.slice(0, mine.length - AI_HISTORY_RETAIN).map((m) => m.id));
      for (let i = memoryAiChat.length - 1; i >= 0; i--) {
        if (excessIds.has(memoryAiChat[i].id)) memoryAiChat.splice(i, 1);
      }
    }
    return message;
  }

  await ensureSchema();
  const result = await databasePool.query(
    `insert into public.ai_chat_messages (id, user_id, role, content, persona)
     values ($1, $2, $3, $4, $5) returning *`,
    [id, params.userId, params.role, content, params.persona || ''],
  );
  return mapAiChatRow(result.rows[0]);
}

async function clearAiChatHistory(userId: string): Promise<number> {
  if (!databasePool) {
    let removed = 0;
    for (let i = memoryAiChat.length - 1; i >= 0; i--) {
      if (memoryAiChat[i].userId === userId) {
        memoryAiChat.splice(i, 1);
        removed++;
      }
    }
    return removed;
  }
  await ensureSchema();
  const result = await databasePool.query('delete from public.ai_chat_messages where user_id = $1', [userId]);
  return Number(result.rowCount || 0);
}

// ---------------------------------------------------------------------------
// Direct messages — REAL user-to-user messages between registered
// accounts. PostgreSQL (public.direct_messages) when DATABASE_URL is
// set, in-memory otherwise (process-local, resets on restart — exactly
// like the comment and AI-chat stores above). Only ever contains
// messages that were actually exchanged; NEVER seeded, so a fresh
// install always starts with an empty inbox and an empty directory.
// ---------------------------------------------------------------------------
interface MemoryDirectMessage {
  id: string;
  senderId: string;
  recipientId: string;
  content: string;
  createdAt: string;
  readAt: string | null;
}

const memoryMessages: MemoryDirectMessage[] = [];
const MEMORY_DM_RETAIN = 500; // newest messages kept per account (memory mode)

/** Public-facing account summary shared by search + conversation lists. */
function toAccountSummary(u: User): SocialAccount {
  return {
    username: u.username,
    name: u.name,
    avatarUrl: u.avatarUrl || '/images/avatar-default.svg',
    verification: u.verification || '',
    statusLine: u.statusLine || undefined,
  };
}

/** Resolve a claimable @username to its account. Accounts without a
 *  claimed username are not directory entries — search and messaging
 *  only ever address real, named accounts. */
function findMemoryUserByUsername(username: string): User | undefined {
  const u = username.trim().toLowerCase();
  return db.users.find((x) => x.username !== '' && (x.username || '').toLowerCase() === u);
}

/** Case-insensitive name/username directory search — the in-memory twin
 *  of the members/accounts SQL. Exact username matches rank first. */
function searchAccountsMemory(actorId: string, query: string): SocialAccount[] {
  const q = query.trim().toLowerCase();
  return db.users
    .filter((u) => u.id !== actorId && u.username !== '')
    .filter((u) => u.username.toLowerCase().includes(q) || u.name.toLowerCase().includes(q))
    .sort((a, b) => {
      const rank = (x: User) => (x.username.toLowerCase() === q ? 0 : 1);
      return rank(a) - rank(b) || a.username.toLowerCase().localeCompare(b.username.toLowerCase());
    })
    .slice(0, 20)
    .map(toAccountSummary);
}

/** Inbox: one row per peer with the newest exchange + unread count. */
function listConversationsMemory(actorId: string): SocialConversation[] {
  const byPeer = new Map<string, MemoryDirectMessage[]>();
  for (const m of memoryMessages) {
    if (m.senderId !== actorId && m.recipientId !== actorId) continue;
    const peerId = m.senderId === actorId ? m.recipientId : m.senderId;
    const list = byPeer.get(peerId);
    if (list) list.push(m);
    else byPeer.set(peerId, [m]);
  }
  const out: SocialConversation[] = [];
  for (const [peerId, msgs] of byPeer) {
    const peer = db.users.find((u) => u.id === peerId);
    // Deleted or username-less accounts are not directory entries.
    if (!peer || peer.username === '') continue;
    msgs.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    const last = msgs[0];
    out.push({
      ...toAccountSummary(peer),
      lastMessage: last.content,
      lastMessageAt: last.createdAt,
      unreadCount: msgs.filter((m) => m.senderId === peerId && m.recipientId === actorId && m.readAt === null).length,
    });
  }
  out.sort((a, b) => (a.lastMessageAt < b.lastMessageAt ? 1 : -1));
  return out.slice(0, 100);
}

/** Keep the newest MEMORY_DM_RETAIN messages involving an account so the
 *  memory store cannot grow without bound (same policy as AI chat). */
function retainMemoryMessages(userId: string): void {
  const mine = memoryMessages.filter((m) => m.senderId === userId || m.recipientId === userId);
  if (mine.length <= MEMORY_DM_RETAIN) return;
  const excess = new Set(mine.slice(0, mine.length - MEMORY_DM_RETAIN).map((m) => m.id));
  for (let i = memoryMessages.length - 1; i >= 0; i--) {
    if (excess.has(memoryMessages[i].id)) memoryMessages.splice(i, 1);
  }
}

/** Account deletion sweeps every message the account sent or received. */
function purgeMemoryMessages(userId: string): void {
  for (let i = memoryMessages.length - 1; i >= 0; i--) {
    const m = memoryMessages[i];
    if (m.senderId === userId || m.recipientId === userId) memoryMessages.splice(i, 1);
  }
}

export async function buildApp() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  // Trust X-Forwarded-For ONLY when we are actually behind a proxy (Vercel's
  // platform, or an operator opt-in via TRUST_PROXY). On a direct-bind server
  // the header is client-controlled: believing it would let an attacker mint
  // a fresh rate-limit bucket on every request just by rotating the value.
  if (process.env.VERCEL || process.env.TRUST_PROXY === 'true' || process.env.TRUST_PROXY === '1') {
    app.set('trust proxy', 1);
  } else {
    app.set('trust proxy', false);
  }
  app.disable('x-powered-by');
  app.use(express.json({ limit: '256kb' }));
  app.use(express.urlencoded({ extended: true, limit: '256kb' }));

  // Idempotent schema upgrades also run at boot, so columns introduced by
  // hardening rounds (users.totp_last_step, admin_invites.token_hash, …)
  // exist before the first request that needs them. Per-route
  // ensureSchema() calls remain as the lazy fallback.
  //
  // API keys are hydrated AFTER the migration resolves: without this, every
  // restart silently emptied db.apiKeys and invalidated every key you had
  // issued. Deliberately not awaited — a slow migration must not delay boot,
  // and requests that arrive first simply see an empty list for a moment.
  if (databasePool) {
    ensureSchema()
      .then(() => loadApiKeys())
      .catch((err: Error) => console.error('[schema] boot migrate failed:', err.message));
  }

  // Best-effort drain of pending API-key usage counters on graceful shutdown
  // (SIGINT/SIGTERM in Docker/PM2). Serverless instances have no such hook, so
  // they can lose at most the last minute of usage — never a key.
  if (databasePool) {
    let flushed = false;
    const drain = () => {
      if (flushed) return;
      flushed = true;
      void flushAllUsage();
    };
    process.once('SIGINT', drain);
    process.once('SIGTERM', drain);
  }

  // Express 4 does NOT catch rejected promises from async handlers: a
  // storage hiccup would become an unhandled rejection (hanging request, or
  // a dead process on Node's default policy). wrap() turns any rejection
  // into a logged 500 instead.
  function wrap(fn: (req: Request, res: Response) => Promise<unknown>) {
    return (req: Request, res: Response) => {
      Promise.resolve(fn(req, res)).catch((err: unknown) => {
        console.error('[route] handler failed:', err instanceof Error ? err.message : String(err));
        if (!res.headersSent) res.status(500).json({ error: 'Internal server error' });
      });
    };
  }

  // ---- API key durability (see src/server/apiKeyStore.ts) -------------------
  // db.apiKeys is the runtime list authenticateApiKey reads; PostgreSQL is what
  // survives a restart. A mutation may only be reported as successful when both
  // agree — otherwise we would hand out a secret that no longer authenticates
  // after the next deploy.
  async function persistOrRollbackKey(key: ApiKey, res: Response): Promise<boolean> {
    try {
      await saveApiKey(key);
      return true;
    } catch {
      db.apiKeys = db.apiKeys.filter((k) => k.id !== key.id);
      db.systemStats.activeApiKeys = db.apiKeys.filter((k) => k.status === 'active').length;
      if (!res.headersSent) {
        res.status(500).json({ error: 'Could not persist the API key — nothing was created' });
      }
      return false;
    }
  }

  async function persistKeyOr500(key: ApiKey, res: Response): Promise<boolean> {
    try {
      await saveApiKey(key);
      return true;
    } catch {
      if (!res.headersSent) {
        res.status(500).json({ error: 'The change was applied in memory but could not be saved — please retry' });
      }
      return false;
    }
  }

  // PUBLIC SERVER-ORDER SURFACE — the embeddable widget and third-party
  // integrations call the catalog / submission / tracking endpoints from
  // OTHER origins, so this family answers with '*' (registered before the
  // hardened same-origin CORS below, so no allowlist echo can overwrite
  // the wildcard). Safe because nothing here is cookie-authenticated: submission is
  // anonymous + rate-limited, tracking is a bearer token in the URL, and
  // the admin routes keep session auth — a foreign page still cannot read
  // anyone's session or forge a bearer header it never receives.
  const publicServersCors = (req: Request, res: Response, next: NextFunction) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      res.setHeader('Access-Control-Max-Age', '86400');
      return res.status(204).end();
    }
    next();
  };
  app.use('/api/v1/servers/', publicServersCors);

  // Hardened CORS — same-origin by default, allowlist via FRONTEND_URL.
  // '*' is deliberately NOT treated as "reflect any origin": that would let
  // every website on the internet call this API from a visitor's browser.
  app.use((req, res, next) => {
    const allowed = (process.env.FRONTEND_URL || '')
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s && s !== '*');
    const origin = req.headers.origin as string | undefined;
    if (origin && (allowed.includes(origin) || allowed.includes('*'))) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization,X-Request-Id,X-Api-Key');
    // Browser clients must be able to read the throttling headers we send back.
    res.setHeader('Access-Control-Expose-Headers', 'X-RateLimit-Limit,X-RateLimit-Remaining,X-RateLimit-Reset,Retry-After');
    if (req.method === 'OPTIONS') return res.status(204).end();
    next();
  });

  // Global abuse protection. /api/v1/public/* is the machine-to-machine
  // surface (one key can legitimately burst), so it gets a wider per-IP
  // backstop; per-key limits are enforced by authenticateApiKey itself.
  //
  // The DEFAULT limiter is deliberately per-IP (not per-path): /api/ contains
  // many dynamic routes (`/profiles/:username`, `/invites/:token`,
  // `/comments/:docId`, `/admin/users/:id/role`, …) and a path-keyed bucket
  // would mint a fresh 300/min budget for every distinct value — i.e. no
  // ceiling at all for anyone willing to vary the URL. A backstop must be a
  // per-IP ceiling. The per-route limiters below then add the finer-grained,
  // static-path budgets on top.
  const defaultLimiter = rateLimit({ windowMs: 60_000, max: 300, perIpOnly: true });
  const publicLimiter = rateLimit({ windowMs: 60_000, max: 1200 });
  app.use('/api/', (req, res, next) =>
    (req.originalUrl || req.url).startsWith('/api/v1/public/')
      ? publicLimiter(req, res, next)
      : defaultLimiter(req, res, next),
  );
  app.use('/api/v1/auth/', rateLimit({ windowMs: 60_000, max: 60 }));
  // Anonymous token-burning + upstream fan-out surfaces: a per-IP ceiling
  // tight enough to make sustained abuse uneconomic, loose enough for the UI.
  app.use('/api/v1/ai/', rateLimit({ windowMs: 60_000, max: 30 }));
  app.use('/api/v1/bot/', rateLimit({ windowMs: 60_000, max: 120 }));
  // Comments are path-parameterised (/comments/:docId and /comments/:id), so a
  // path-keyed bucket would reset on every distinct doc id — per IP only.
  app.use('/api/v1/comments/', rateLimit({ windowMs: 60_000, max: 30, perIpOnly: true }));
  app.use('/api/v1/members/', rateLimit({ windowMs: 60_000, max: 60, perIpOnly: true }));
  // GitHub fan-out: every repo listing / import costs real upstream
  // requests against the user's own token — a tighter per-IP ceiling
  // keeps a spraying client from burning that quota.
  app.use('/api/v1/github/', rateLimit({ windowMs: 60_000, max: 30 }));
  app.use('/api/v1/publish/', rateLimit({ windowMs: 60_000, max: 60, perIpOnly: true }));
  // Analysis reads ship the whole usage window to Python on every call, so a
  // tighter ceiling keeps a refresh-happy dashboard from flooding the service.
  app.use('/api/v1/analytics/', rateLimit({ windowMs: 60_000, max: 60 }));
  // OAuth provider surface. The authorize-validation + consent
  // decision endpoints are path-parameter-free but hit by
  // browsers; the token endpoint exchanges credentials, so it
  // gets a tighter per-IP budget against spraying. userinfo is
  // machine-to-machine (one egress IP per third-party backend),
  // so the shared surface gets a wider 120/min ceiling.
  app.use('/api/v1/oauth/', rateLimit({ windowMs: 60_000, max: 120, perIpOnly: true }));
  app.use('/api/v1/oauth/token', rateLimit({ windowMs: 60_000, max: 30, perIpOnly: true }));
  // Server-order surface: a general 120/min per-IP ceiling for catalog
  // reads and the admin queue, a tighter shared bucket for the request
  // path itself (submission + status tracking + admin list), and the
  // anonymous submission POST gets its own small budget at the route.
  app.use('/api/v1/servers/', rateLimit({ windowMs: 60_000, max: 120, perIpOnly: true }));
  app.use('/api/v1/servers/requests', rateLimit({ windowMs: 60_000, max: 40, perIpOnly: true }));
  app.use('/api/v1/youtube/', rateLimit({ windowMs: 60_000, max: 60 }));
  app.use('/api/v1/search/', rateLimit({ windowMs: 60_000, max: 60 }));
  app.use('/api/v1/semantic-search', rateLimit({ windowMs: 60_000, max: 60 }));
  // Value-keyed PUBLIC routes (invite link, profile lookup): bucket purely
  // per IP so spraying distinct /invites/<token> URLs can't mint unlimited
  // buckets inside the path-keyed default limiter.
  const invitePreviewLimiter = rateLimit({ windowMs: 60_000, max: 60, perIpOnly: true });
  const publicProfileLimiter = rateLimit({ windowMs: 60_000, max: 60, perIpOnly: true });

  // Real login sessions: resolve Bearer token → authenticated actor.
  // getActorUser() then reads (req as any).actor synchronously in routes.
  app.use('/api/', async (req, _res, next) => {
    try {
      const auth = req.headers.authorization || '';
      const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
      const adminToken = process.env.ADMIN_API_TOKEN;
      // sk_* tokens are API keys (external integrations), never sessions.
      if (token && !token.startsWith('sk_') && !(adminToken && token === adminToken)) {
        const user = await resolveSession(token);
        if (user) (req as any).actor = user;
      }
    } catch (err) {
      console.error('[auth] session resolve failed:', (err as Error).message);
    }
    next();
  });

  // Security Headers Middleware (always on, stricter in production)
  app.use((_req, res, next) => {
    res.setHeader('X-DNS-Prefetch-Control', 'off');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    if (process.env.NODE_ENV === 'production') {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
      res.setHeader(
        'Content-Security-Policy',
        "default-src 'self'; img-src 'self' https: data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'"
      );
    }
    next();
  });

  // Request id (for audit correlation, never trust client value blindly)
  app.use((req, _res, next) => {
    const incoming = sanitizeText(req.headers['x-request-id'] as string, 64);
    (req as any).requestId = incoming || crypto.randomUUID();
    next();
  });

  // Source Detection Helper
  function detectSource(req: Request): ClientSource {
    const headerSource = req.headers['x-client-source'] as string;
    if (headerSource) {
      const s = headerSource.toUpperCase();
      if (['WEB', 'BOT', 'MOBILE', 'DESKTOP', 'APPLICATION'].includes(s)) {
        return s as ClientSource;
      }
    }
    const ua = (req.headers['user-agent'] || '').toLowerCase();
    if (ua.includes('discord') || ua.includes('bot') || ua.includes('axios') || ua.includes('curl')) return 'BOT';
    if (ua.includes('mobile') || ua.includes('iphone') || ua.includes('android')) return 'MOBILE';
    if (ua.includes('electron') || ua.includes('desktop')) return 'DESKTOP';
    return 'WEB';
  }

  // Request logger & Metrics tracker
  app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
      const latency = Date.now() - start;
      if (req.path.startsWith('/api/')) {
        db.incrementRequestCount(req.path, res.statusCode, latency);
      }
    });
    next();
  });

  // Auth is centralized in src/server/security.ts (getActorUser / requireAdmin).
  // x-user-role / x-user-id headers are NEVER trusted in production.
  // Admin actions require ADMIN_API_TOKEN (Bearer) or ADMIN role.

  // ----------------------------------------------------
  // API ROUTES (/api/v1/...)
  // ----------------------------------------------------

  // Health & Ready (ready actually probes Postgres)
  app.get('/api/v1/health', (_req, res) => {
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      uptime: process.uptime(),
      service: 'Vanitas Central Gateway',
    });
  });

  app.get('/api/v1/ready', async (_req, res) => {
    let database: string = databasePool ? 'connected' : 'in-memory-fallback';
    if (databasePool) {
      try {
        await databasePool.query('select 1');
      } catch {
        database = 'unreachable';
      }
    }
    res.json({
      ready: database !== 'unreachable',
      database,
      auth: 'ready',
      ai: process.env.AI_PROVIDER === 'ollama'
        ? 'ollama_configured'
        : process.env.AI_PROVIDER === 'pollinations'
          ? 'pollinations_free'
          : process.env.GEMINI_API_KEY ? 'gemini_enabled' : 'pollinations_free',
      // Why the last live AI attempt degraded (null when healthy) — honest,
      // machine-readable diagnostics for ops and smoke tests.
      aiUpstream: getLastAiUpstream(),
      // Where the AI/ML domain is executed: the Python microservice when
      // AI_SERVICE_URL is set (with automatic fallback), else the built-in
      // TypeScript chain. See services/ai-service/README.md.
      aiService: process.env.AI_SERVICE_URL
        ? `python_remote:${process.env.AI_SERVICE_URL.replace(/\/+$/, '')}`
        : 'typescript_native',
      // Where the servers/Go domain runs: the Go shared bucket when
      // RATELIMIT_SERVICE_URL is set (automatic fallback), else the built-in
      // in-memory limiter. See services/ratelimit/README.md.
      rateLimitService: process.env.RATELIMIT_SERVICE_URL
        ? `go_remote:${process.env.RATELIMIT_SERVICE_URL.replace(/\/+$/, '')}`
        : 'typescript_native',
      // Data-analysis domain (services/analytics) — same fallback contract.
      analyticsService: process.env.ANALYTICS_SERVICE_URL
        ? `python_remote:${process.env.ANALYTICS_SERVICE_URL.replace(/\/+$/, '')}`
        : 'typescript_native',
      mode: process.env.DEMO_MODE === 'true' && process.env.NODE_ENV !== 'production' ? 'demo' : 'authenticated',
    });
  });

  // Status Summary
  // Public platform status. EVERY number below is counted live: request
  // totals / hourly traffic / p95 / error rate come from the real request
  // logger, uptime is this process, and each component row carries observable
  // evidence (probe result or activity count) instead of a painted green dot.
  app.get('/api/v1/status', async (_req, res) => {
    const stats = db.systemStats;

    // Real data-store probe — same contract as /api/v1/public/status.
    let database: 'connected' | 'unreachable' | 'in-memory-fallback';
    if (databasePool) {
      try {
        await databasePool.query('select 1');
        database = 'connected';
      } catch {
        database = 'unreachable';
      }
    } else {
      database = 'in-memory-fallback';
    }

    const dayAgo = Date.now() - 24 * 3600_000;
    const logins24h = db.auditLogs.filter(
      (l) => l.action === 'LOGIN_SUCCESS' && Date.parse(l.timestamp) >= dayAgo,
    ).length;
    const failedLogins24h = db.auditLogs.filter(
      (l) => l.action === 'LOGIN_FAILURE' && Date.parse(l.timestamp) >= dayAgo,
    ).length;

    const hourlyTraffic = db.getHourlyTraffic24h();
    const requests24h = hourlyTraffic.reduce((sum, b) => sum + b.requests, 0);
    const errors24h = hourlyTraffic.reduce((sum, b) => sum + b.errors, 0);
    const activeApiKeys = db.apiKeys.filter((k) => k.status === 'active').length;
    const botsOnline = db.bots.filter((b) => b.status === 'online').length;

    res.json({
      platform: 'Vanitas',
      status: stats.services,
      database,
      stats: {
        totalRequestsToday: stats.apiRequestsToday,
        requests24h,
        errors24h,
        p95LatencyMs: stats.p95LatencyMs,
        errorRate: stats.errorRate,
        activeApiKeys,
        logins24h,
        failedLogins24h,
      },
      hourlyTraffic,
      components: [
        {
          id: 'api',
          // Serving this very request IS the evidence the gateway is up.
          status: 'operational',
          detail: `${requests24h.toLocaleString('en-US')} requests · last 24h`,
        },
        {
          id: 'database',
          status: database === 'unreachable' ? 'outage' : 'operational',
          detail:
            database === 'connected'
              ? 'PostgreSQL · SELECT 1 OK'
              : database === 'in-memory-fallback'
                ? 'In-process store (memory mode)'
                : 'PostgreSQL unreachable',
        },
        {
          id: 'auth',
          status: 'operational',
          detail: `${logins24h} sign-ins / ${failedLogins24h} failed · 24h`,
        },
        {
          id: 'ai',
          status: 'operational',
          detail: 'Streaming copilot · site-aware · AR + EN',
        },
        {
          id: 'bot',
          status: 'operational',
          detail: `${botsOnline} online / ${db.bots.length} configured`,
        },
        {
          id: 'webhooks',
          status: 'operational',
          detail: `${db.webhooks.length} endpoints · ${db.webhookLogs.length} deliveries logged`,
        },
      ],
      uptimeSeconds: Math.round(process.uptime()),
      serverTime: new Date().toISOString(),
    });
  });

  function permissionsFor(actor: { role: UserRole }): string[] {
    return actor.role === 'ADMIN' ? ALL_SCOPES.map((s) => s.scope) : ['api.read', 'keys.read', 'keys.create', 'bot.execute'];
  }

  // ---- 2FA brute-force protection (shared by /auth/login and /2fa/complete) ----
  // Rejects BEFORE any code comparison while the account is cooling down, and
  // counts every wrong code. A correct code clears the counter.
  async function twoFactorLockoutGuard(userId: string): Promise<number> {
    const lockedMs = await getTotpLockoutMs(userId);
    return lockedMs > 0 ? Math.ceil(lockedMs / 1000) : 0;
  }

  function sendLockout(res: Response, seconds: number): void {
    res.setHeader('Retry-After', String(seconds));
    res
      .status(429)
      .json({
        twoFactorRequired: true,
        error: `Too many incorrect codes. Try again in ${formatWait(seconds)}.`,
        retryAfterSec: seconds,
      });
  }

  function formatWait(seconds: number): string {
    if (seconds < 60) return `${seconds} seconds`;
    const minutes = Math.ceil(seconds / 60);
    return `${minutes} minute${minutes === 1 ? '' : 's'}`;
  }

  /** Count a wrong 2FA code and answer with 429 (locked) or 401 (retry). */
  async function rejectTwoFactorCode(res: Response, userId: string): Promise<void> {
    const { lockedUntilMs } = await registerTotpFailure(userId);
    if (lockedUntilMs > 0) return sendLockout(res, Math.ceil(lockedUntilMs / 1000));
    res.status(401).json({ twoFactorRequired: true, error: 'Enter the 6-digit code from your authenticator app' });
  }

  // Auth Current User — REAL sessions only. No token → 401 (never a fake persona).
  app.get('/api/v1/auth/me', (req, res) => {
    const actor = getActorUser(req);
    if (!actor) return res.status(401).json({ error: 'Authentication required' });
    res.json({
      user: actor,
      permissions: permissionsFor(actor),
    });
  });

  // Profile update — persists identity edits to the real account record:
  // display name + avatar (as before), plus the claimable @username and bio.
  // Avatar accepts an https URL (<=500 chars) or an uploaded image data URL (<=300KB).
  app.patch('/api/v1/auth/profile', async (req, res) => {
    const actor = getActorUser(req);
    if (!actor) return res.status(401).json({ error: 'Authentication required' });

    const name = typeof req.body?.name === 'string' ? sanitizeText(req.body.name, 80) : '';
    const avatarUrl = typeof req.body?.avatarUrl === 'string' ? req.body.avatarUrl : '';
    if (!name || name.length < 2) {
      return res.status(400).json({ error: 'Display name must be between 2 and 80 characters' });
    }
    const isHttpsUrl = avatarUrl === '' || /^https:\/\/[^\s]{5,500}$/.test(avatarUrl);
    const isUploadedImage =
      avatarUrl.length <= 300_000 && /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/]+={0,2}$/.test(avatarUrl);
    // Bundled same-origin art is a legitimate avatar (the default
    // /images/avatar-default.svg ships with every account). Strict shape:
    // exactly /images/<name>.<ext> — no protocol-relative (//host) or
    // traversal tricks, and never a javascript: URL.
    const isBundledAsset = /^\/images\/[A-Za-z0-9_\-/]+\.(svg|png|jpe?g|webp|gif)$/.test(avatarUrl);
    if (!isHttpsUrl && !isUploadedImage && !isBundledAsset) {
      return res
        .status(400)
        .json({ error: 'Avatar must be an https URL, a bundled /images/ asset, or an uploaded image up to 300KB' });
    }

    // Optional @username — only validated when actually being changed, so
    // re-saving an older over-long username stays a harmless no-op.
    let username: string | undefined;
    if (typeof req.body?.username === 'string') {
      const candidate = req.body.username.trim().toLowerCase();
      if (candidate !== (actor.username || '').toLowerCase()) {
        const uerr = usernameValidationError(candidate);
        if (uerr) return res.status(400).json({ error: uerr });
        try {
          if (await isUsernameTaken(candidate, actor.id)) {
            return res.status(409).json({ error: 'That username is already taken' });
          }
        } catch (err) {
          console.error('[auth/profile/username]', (err as Error).message);
          return res.status(500).json({ error: 'Username check failed' });
        }
        username = candidate;
      }
    }

    // Optional bio (≤500 chars, may be empty to clear). Markdown syntax is
    // allowed and rendered by the XSS-safe client renderer — control
    // characters are stripped here while newlines/tabs are kept (code blocks
    // and lists need them).
    let bio: string | undefined;
    if (typeof req.body?.bio === 'string') {
      const value = sanitizeText(req.body.bio, 4000);
      if (value.length > 500) {
        return res.status(400).json({ error: 'Bio must be 500 characters or fewer' });
      }
      bio = value;
    }

    // Optional profile accent colour — #RRGGBB only; an empty string resets to
    // the default gradient. Validated here so nothing but a well-formed hex
    // value can reach the stored record or the inline CSS it drives in the UI.
    let accentColor: string | undefined;
    if (typeof req.body?.accentColor === 'string') {
      const value = req.body.accentColor.trim();
      if (value !== '' && !/^#[0-9a-fA-F]{6}$/.test(value)) {
        return res.status(400).json({ error: 'Accent color must be a #RRGGBB hex value (or empty to reset)' });
      }
      accentColor = value;
    }

    // Optional one-line status ("Now building …") — collapsed to a single
    // line and capped at 80 chars server-side; '' clears it.
    let statusLine: string | undefined;
    if (typeof req.body?.statusLine === 'string') {
      const value = sanitizeText(req.body.statusLine, 400).replace(/\s+/g, ' ').trim();
      if (value.length > 80) {
        return res.status(400).json({ error: 'Status line must be 80 characters or fewer' });
      }
      statusLine = value;
    }

    // Optional published links — up to 5, each a short label plus a https://
    // URL. Nothing but a validated https value can reach the stored record or
    // the <a href> it renders as on the public page (no javascript:, no
    // protocol-relative //host). [] clears the list.
    let profileLinks: ProfileLink[] | undefined;
    if (req.body?.links !== undefined) {
      const raw = req.body.links;
      if (!Array.isArray(raw)) return res.status(400).json({ error: 'Links must be an array' });
      if (raw.length > 5) return res.status(400).json({ error: 'Up to 5 profile links are allowed' });
      const links: ProfileLink[] = [];
      for (const item of raw) {
        const label = typeof item?.label === 'string' ? sanitizeText(item.label, 40).trim() : '';
        const url = typeof item?.url === 'string' ? item.url.trim() : '';
        if (!label) return res.status(400).json({ error: 'Every link needs a label' });
        if (!/^https:\/\/[^\s]{5,500}$/.test(url)) {
          return res.status(400).json({ error: `Link "${label}" must be an https:// URL` });
        }
        links.push({ label, url });
      }
      profileLinks = links;
    }

    // Optional location — collapsed to a single line and capped at 60 chars.
    // Rendered as plain text on /u/<username>, never as markup. '' clears it.
    let location: string | undefined;
    if (typeof req.body?.location === 'string') {
      const value = sanitizeText(req.body.location, 200).replace(/\s+/g, ' ').trim();
      if (value.length > 60) {
        return res.status(400).json({ error: 'Location must be 60 characters or fewer' });
      }
      location = value;
    }

    // Optional tech tags — up to 8, each a short plain-text label. Stripped of
    // control characters and collapsed to one line so nothing but the text a
    // user typed reaches the chips rendered on the public profile.
    let techTags: string[] | undefined;
    if (req.body?.techTags !== undefined) {
      const raw = req.body.techTags;
      if (!Array.isArray(raw)) return res.status(400).json({ error: 'Tech tags must be an array' });
      if (raw.length > 8) return res.status(400).json({ error: 'Up to 8 tech tags are allowed' });
      const tags: string[] = [];
      for (const item of raw) {
        const tag = typeof item === 'string' ? sanitizeText(item, 60).replace(/\s+/g, ' ').trim() : '';
        if (!tag) continue; // ignore blanks rather than failing the whole save
        if (tag.length > 24) {
          return res.status(400).json({ error: `Tech tag "${tag}" must be 24 characters or fewer` });
        }
        tags.push(tag);
      }
      techTags = tags;
    }

    try {
      const updated = await updateProfile(actor.id, {
        name, avatarUrl, username, bio, accentColor, statusLine, profileLinks, location, techTags,
      });
      if (!updated) return res.status(404).json({ error: 'Account not found' });
      if (username) {
        persistAuditLog({
          actorId: actor.id,
          actorName: updated.name,
          actorEmail: updated.email,
          action: 'USERNAME_CHANGED',
          category: 'AUTH',
          target: `${actor.username || 'none'} -> ${username}`,
          source: detectSource(req),
          status: 'SUCCESS',
          ipAddress: req.ip || 'unknown',
          metadata: { username },
        });
      }
      res.json({ user: updated, permissions: permissionsFor(updated) });
    } catch (err) {
      console.error('[auth/profile]', (err as Error).message);
      res.status(500).json({ error: 'Profile update failed' });
    }
  });

  // Live availability for the profile's @username field (authenticated).
  app.get('/api/v1/auth/username-available', async (req, res) => {
    const actor = getActorUser(req);
    if (!actor) return res.status(401).json({ error: 'Authentication required' });
    const username = sanitizeText(req.query?.username, 40).trim().toLowerCase();
    if (username === (actor.username || '').toLowerCase()) {
      return res.json({ available: true, current: true });
    }
    const uerr = usernameValidationError(username);
    if (uerr) return res.json({ available: false, reason: uerr });
    try {
      const taken = await isUsernameTaken(username, actor.id);
      res.json(taken ? { available: false, reason: 'That username is already taken' } : { available: true });
    } catch (err) {
      console.error('[username-available]', (err as Error).message);
      res.status(500).json({ error: 'Availability check failed' });
    }
  });

  // ----------------------------------------------------
  // REAL AUTH: register / login / logout
  // Passwords: scrypt. Sessions: random bearer token (sha256-hashed at rest).
  // Storage: PostgreSQL when DATABASE_URL is set, in-memory otherwise.
  // ----------------------------------------------------
  app.post('/api/v1/auth/register', async (req, res) => {
    const email = sanitizeText(req.body?.email, 120).toLowerCase();
    const name = sanitizeText(req.body?.name, 80);
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    const inviteToken = sanitizeText(req.body?.invite || '', 128);

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'A valid email address is required' });
    }
    if (!name) {
      return res.status(400).json({ error: 'Display name is required' });
    }
    if (password.length < 8 || password.length > 128) {
      return res.status(400).json({ error: 'Password must be between 8 and 128 characters' });
    }

    try {
      // Validate the invite BEFORE creating the account — a dead link must
      // fail loudly instead of silently dropping the promised role/badge.
      let invite: AdminInvite | null = null;
      if (inviteToken) {
        invite = await findInviteByToken(inviteToken);
        if (!invite || !inviteUsable(invite)) {
          return res
            .status(400)
            .json({ error: 'This invite link is no longer valid (expired, already used, or revoked)' });
        }
      }

      const outcome = await createAccount({ email, password, name });
      if (outcome.ok === false) return res.status(outcome.status).json({ error: outcome.error });

      // Redeem: claim one use atomically (a racing signup loses gracefully),
      // then apply the promised role + badge to the fresh account.
      if (invite && (await claimInvite(invite.id))) {
        // Bootstrap rule wins: an invite can never strip the only ADMIN.
        const grantRole =
          outcome.user.role === 'ADMIN' && invite.role === 'USER' ? 'ADMIN' : invite.role;
        outcome.user.role = grantRole as UserRole;
        outcome.user.verification = invite.verification;
        if (databasePool) {
          await databasePool.query(
            'update public.users set role = $2, verification = $3 where id = $1',
            [outcome.user.id, grantRole, invite.verification],
          );
        }
        invalidateResolveCache(outcome.user.id);
        persistAuditLog({
          actorId: outcome.user.id,
          actorName: outcome.user.name,
          actorEmail: outcome.user.email,
          action: 'INVITE_USED',
          category: 'ADMIN',
          target: `${invite.id} by ${invite.createdByName}`,
          source: detectSource(req),
          status: 'SUCCESS',
          ipAddress: req.ip || 'unknown',
          metadata: { role: grantRole, verification: invite.verification },
        });
      }

      const token = await createSession(outcome.user, { ip: req.ip, userAgent: String(req.headers['user-agent'] || '') });
      persistAuditLog({
        actorId: outcome.user.id,
        actorName: outcome.user.name,
        actorEmail: outcome.user.email,
        action: 'ACCOUNT_REGISTERED',
        category: 'AUTH',
        target: `User Account: ${outcome.user.id}`,
        source: detectSource(req),
        status: 'SUCCESS',
        ipAddress: req.ip || 'unknown',
        metadata: { role: outcome.user.role },
      });
      return res.status(201).json({ token, user: outcome.user, permissions: permissionsFor(outcome.user) });
    } catch (err) {
      console.error('[auth] register failed:', (err as Error).message);
      const msg = (err as Error).message || '';
      if (msg.includes('db:migrate')) {
        return res.status(503).json({ error: 'Auth storage unavailable — run npm run db:migrate first' });
      }
      return res.status(500).json({ error: 'Registration failed' });
    }
  });

  app.post('/api/v1/auth/login', async (req, res) => {
    const email = sanitizeText(req.body?.email, 120).toLowerCase();
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    try {
      const outcome = await verifyAccount(email, password);
      if (outcome.ok === false) {
        // Failed logins are security events. Only the attempted address and
        // a generic reason are recorded — never the password itself.
        persistAuditLog({
          actorId: '',
          actorName: 'unknown',
          actorEmail: email,
          action: 'LOGIN_FAILURE',
          category: 'AUTH',
          target: `Failed login: ${email}`,
          source: detectSource(req),
          status: 'FAILURE',
          ipAddress: req.ip || 'unknown',
          metadata: { reason: 'invalid_credentials' },
        });
        return res.status(outcome.status).json({ error: outcome.error });
      }

      // Real 2FA (RFC 6238): once TOTP is enabled the password alone is no
      // longer enough — a valid 6-digit authenticator code is required too.
      if (outcome.user.twoFactorEnabled) {
        // Lockout first: while an account is cooling down we must not even
        // attempt a comparison (the counter only moves on a real guess).
        const lockedSeconds = await twoFactorLockoutGuard(outcome.user.id);
        if (lockedSeconds > 0) return sendLockout(res, lockedSeconds);

        const secret = await getTwoFactorSecret(outcome.user.id);
        const code = sanitizeText(req.body?.code, 16);
        const step = secret ? verifyTotpStep(secret, code) : null;
        if (step === null) {
          return rejectTwoFactorCode(res, outcome.user.id);
        }
        // Replay protection: one code buys exactly one session. A code that
        // was already spent (or an older step still inside the ±1 drift
        // window) is rejected even though it cryptographically verifies.
        const lastStep = await getTotpLastStep(outcome.user.id);
        if (step <= lastStep) {
          console.warn('[auth] TOTP replay rejected for user', outcome.user.id);
          return res
            .status(401)
            .json({ twoFactorRequired: true, error: 'That code was already used — wait for the next one' });
        }
        // Burn the step BEFORE creating the session (fail closed: a session
        // error costs the user one refresh cycle, a race costs a second login).
        await setTotpLastStep(outcome.user.id, step);
        await clearTotpFailures(outcome.user.id);
      }

      const token = await createSession(outcome.user, { ip: req.ip, userAgent: String(req.headers['user-agent'] || '') });
      persistAuditLog({
        actorId: outcome.user.id,
        actorName: outcome.user.name,
        actorEmail: outcome.user.email,
        action: 'LOGIN_SUCCESS',
        category: 'AUTH',
        target: `User Account: ${outcome.user.id}`,
        source: detectSource(req),
        status: 'SUCCESS',
        ipAddress: req.ip || 'unknown',
        metadata: { role: outcome.user.role },
      });
      dispatchWebhooks('user.login', { userId: outcome.user.id, email: outcome.user.email });
      return res.json({ token, user: outcome.user, permissions: permissionsFor(outcome.user) });
    } catch (err) {
      console.error('[auth] login failed:', (err as Error).message);
      const msg = (err as Error).message || '';
      if (msg.includes('db:migrate')) {
        return res.status(503).json({ error: 'Auth storage unavailable — run npm run db:migrate first' });
      }
      return res.status(500).json({ error: 'Login failed' });
    }
  });

  app.post('/api/v1/auth/logout', async (req, res) => {
    try {
      const auth = req.headers.authorization || '';
      const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
      if (token) await revokeSession(token);
    } catch (err) {
      console.error('[auth] logout failed:', err);
    }
    res.json({ success: true });
  });

  // Delete the caller's OWN account — sessions, API keys, OAuth links, and
  // comments go with it. The last admin can only delete themselves when no
  // other accounts remain (so the system is never left adminless).
  app.delete('/api/v1/auth/account', async (req, res) => {
    const actor = getActorUser(req);
    if (!actor) return res.status(401).json({ error: 'Authentication required' });

    if (actor.role === 'ADMIN') {
      let otherUsers = 0;
      let otherAdmins = 0;
      if (databasePool) {
        const counts = await databasePool.query(
          `select (select count(*) from public.users where id <> $1) as other_users,
                  (select count(*) from public.users where role = 'ADMIN' and id <> $1) as other_admins`,
          [actor.id],
        );
        otherUsers = Number(counts.rows[0].other_users);
        otherAdmins = Number(counts.rows[0].other_admins);
      } else {
        const others = db.users.filter((u) => u.id !== actor.id);
        otherUsers = others.length;
        otherAdmins = others.filter((u) => u.role === 'ADMIN').length;
      }
      if (otherUsers > 0 && otherAdmins === 0) {
        return res.status(403).json({ error: 'Promote another admin before deleting the last admin account' });
      }
    }

    try {
      await forgetAccount(actor.id);
      if (!databasePool) {
        for (let i = memoryComments.length - 1; i >= 0; i--) {
          if (memoryComments[i].userId === actor.id) memoryComments.splice(i, 1);
        }
        for (let i = memoryAiChat.length - 1; i >= 0; i--) {
          if (memoryAiChat[i].userId === actor.id) memoryAiChat.splice(i, 1);
        }
        // Private messages go with the account in both storage modes
        // (PG cascades via FK; memory mode sweeps explicitly).
        purgeMemoryMessages(actor.id);
        // Published projects, snippets and the GitHub grant follow
        // the account (PG: FK cascade; memory: explicit sweeps).
        purgePublishedData(actor.id);
        await clearGitHubToken(actor.id);
        // Third-party OAuth apps, codes and tokens too.
        purgeOAuthAppData(actor.id);
      }
      res.json({ success: true });
    } catch (err) {
      console.error('[auth/account] delete failed:', (err as Error).message);
      res.status(500).json({ error: 'Account deletion failed' });
    }
  });

  // ----------------------------------------------------
  // REAL two-factor authentication (RFC 6238 TOTP).
  // setup → store a fresh secret (not enabled yet); enable/disable → prove
  // possession of the authenticator app with a live 6-digit code; complete →
  // finish an OAuth login that still needs the code.
  // ----------------------------------------------------

  // Stateless HMAC-signed challenge for the OAuth + 2FA path. Signed with a
  // key derived from DATABASE_URL so any serverless instance can verify it.
  // With neither secret configured (pure local dev, single process), fall
  // back to a random per-process key: challenges are short-lived anyway,
  // whereas a hardcoded constant would let anyone forge them.
  const twoFactorStateKey = crypto
    .createHash('sha256')
    .update(process.env.DATABASE_URL || process.env.ADMIN_API_TOKEN || `local-${crypto.randomBytes(32).toString('hex')}`)
    .digest();

  /** sha256 of the caller's bearer SESSION token (undefined for admin/API
   * tokens) — lets a hardening action keep the caller's own session alive
   * while revoking every other one. */
  function currentSessionHash(req: Request): string | undefined {
    const auth = req.headers.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
    if (!token.startsWith('vnt_sess_')) return undefined;
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  function makeTwoFactorState(userId: string): string {
    const payload = Buffer.from(`${userId}.${Date.now() + 10 * 60_000}`).toString('base64url');
    const sig = crypto.createHmac('sha256', twoFactorStateKey).update(payload).digest('base64url');
    return `${payload}.${sig}`;
  }

  function readTwoFactorState(state: string): string | null {
    const [payload, sig] = state.split('.');
    if (!payload || !sig) return null;
    const expect = crypto.createHmac('sha256', twoFactorStateKey).update(payload).digest('base64url');
    const a = Buffer.from(sig);
    const b = Buffer.from(expect);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    const [userId, expStr] = Buffer.from(payload, 'base64url').toString().split('.');
    if (!userId || !expStr || Number(expStr) < Date.now()) return null;
    return userId;
  }

  app.post('/api/v1/auth/2fa/setup', async (req, res) => {
    const actor = getActorUser(req);
    if (!actor) return res.status(401).json({ error: 'Authentication required' });
    if (actor.twoFactorEnabled) return res.status(409).json({ error: 'Two-factor authentication is already enabled' });
    try {
      await ensureSchema(); // legacy databases need the two_factor_secret column
      const secret = generateTotpSecret();
      await setTwoFactor(actor.id, secret, false); // stored, not enabled until verified
      res.json({ secret, otpauthUrl: totpOtpauthUrl(actor.email, secret) });
    } catch (err) {
      console.error('[2fa/setup]', (err as Error).message);
      res.status(500).json({ error: 'Could not start two-factor setup' });
    }
  });

  app.post('/api/v1/auth/2fa/enable', async (req, res) => {
    const actor = getActorUser(req);
    if (!actor) return res.status(401).json({ error: 'Authentication required' });
    if (actor.twoFactorEnabled) return res.status(409).json({ error: 'Two-factor authentication is already enabled' });
    const code = sanitizeText(req.body?.code, 16);
    try {
      const secret = await getTwoFactorSecret(actor.id);
      if (!secret) return res.status(400).json({ error: 'Run two-factor setup first' });
      if (!verifyTotp(secret, code)) return res.status(400).json({ error: 'Invalid 6-digit code' });
      await setTwoFactor(actor.id, secret, true);
      // Hardening flush: turning 2FA ON revokes every OTHER session of this
      // account — a session planted before the account was protected must
      // not survive the moment protection starts.
      const keep = currentSessionHash(req);
      const sessionsRevoked = await revokeOtherSessions(actor.id, keep);
      persistAuditLog({
        actorId: actor.id,
        actorName: actor.name,
        actorEmail: actor.email,
        action: 'TWO_FACTOR_ENABLED',
        category: 'AUTH',
        target: `User Account: ${actor.id}`,
        source: detectSource(req),
        status: 'SUCCESS',
        ipAddress: req.ip || 'unknown',
        metadata: { sessionsRevoked },
      });
      res.json({ success: true, sessionsRevoked });
    } catch (err) {
      console.error('[2fa/enable]', (err as Error).message);
      res.status(500).json({ error: 'Could not enable two-factor authentication' });
    }
  });

  app.post('/api/v1/auth/2fa/disable', async (req, res) => {
    const actor = getActorUser(req);
    if (!actor) return res.status(401).json({ error: 'Authentication required' });
    if (!actor.twoFactorEnabled) return res.status(409).json({ error: 'Two-factor authentication is not enabled' });
    const code = sanitizeText(req.body?.code, 16);
    try {
      const secret = await getTwoFactorSecret(actor.id);
      if (!secret || !verifyTotp(secret, code)) {
        return res.status(400).json({ error: 'Invalid 6-digit code' });
      }
      await setTwoFactor(actor.id, '', false);
      persistAuditLog({
        actorId: actor.id,
        actorName: actor.name,
        actorEmail: actor.email,
        action: 'TWO_FACTOR_DISABLED',
        category: 'AUTH',
        target: `User Account: ${actor.id}`,
        source: detectSource(req),
        status: 'WARNING',
        ipAddress: req.ip || 'unknown',
      });
      res.json({ success: true });
    } catch (err) {
      console.error('[2fa/disable]', (err as Error).message);
      res.status(500).json({ error: 'Could not disable two-factor authentication' });
    }
  });

  // Finish an OAuth login that was paused for the TOTP code (#vnt_2fa=state).
  app.post('/api/v1/auth/2fa/complete', async (req, res) => {
    const state = sanitizeText(req.body?.state, 400);
    const code = sanitizeText(req.body?.code, 16);
    const userId = readTwoFactorState(state);
    if (!userId) return res.status(401).json({ error: 'Two-factor challenge expired — sign in again' });
    try {
      const result = await findUserById(userId);
      if (!result) return res.status(401).json({ error: 'Two-factor challenge expired — sign in again' });
      if (!result.twoFactorEnabled) return res.status(400).json({ error: 'Two-factor authentication is not enabled' });

      // Same brute-force lockout as /auth/login: this endpoint is reachable
      // without a session, so an unbounded retry loop here would also defeat 2FA.
      const lockedSeconds = await twoFactorLockoutGuard(result.id);
      if (lockedSeconds > 0) return sendLockout(res, lockedSeconds);

      const secret = await getTwoFactorSecret(result.id);
      const step = secret ? verifyTotpStep(secret, code) : null;
      if (step === null) return rejectTwoFactorCode(res, result.id);
      // Replay protection: this challenge consumes one code, exactly once.
      const lastStep = await getTotpLastStep(result.id);
      if (step <= lastStep) {
        return res.status(401).json({ error: 'That code was already used — wait for the next one' });
      }
      await setTotpLastStep(result.id, step);
      await clearTotpFailures(result.id);
      const token = await createSession(result, { ip: req.ip, userAgent: String(req.headers['user-agent'] || '') });
      persistAuditLog({
        actorId: result.id,
        actorName: result.name,
        actorEmail: result.email,
        action: 'LOGIN_SUCCESS',
        category: 'AUTH',
        target: `User Account: ${result.id}`,
        source: detectSource(req),
        status: 'SUCCESS',
        ipAddress: req.ip || 'unknown',
        metadata: { via: 'oauth_totp' },
      });
      res.json({ token, user: result, permissions: permissionsFor(result) });
    } catch (err) {
      console.error('[2fa/complete]', (err as Error).message);
      res.status(500).json({ error: 'Two-factor verification failed' });
    }
  });

  // ----------------------------------------------------
  // DOC COMMENTS — real, DB-backed, written by registered users only.
  // Reading is public; posting requires a real session; only the author
  // (or an ADMIN) can delete. NO fake/seeded comments exist anywhere.
  // ----------------------------------------------------
  const DOC_ID_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;

  app.get('/api/v1/comments/:docId', async (req, res) => {
    const docId = sanitizeText(req.params.docId, 64).toLowerCase();
    if (!DOC_ID_RE.test(docId)) return res.status(400).json({ error: 'Invalid doc id' });
    try {
      const comments = await listComments(docId);
      res.json({ comments, total: comments.length });
    } catch (err) {
      console.error('[comments/list]', (err as Error).message);
      res.status(500).json({ error: 'Failed to load comments' });
    }
  });

  app.post('/api/v1/comments/:docId', async (req, res) => {
    const actor = getActorUser(req);
    if (!actor) return res.status(401).json({ error: 'Sign in to post a comment' });
    const docId = sanitizeText(req.params.docId, 64).toLowerCase();
    if (!DOC_ID_RE.test(docId)) return res.status(400).json({ error: 'Invalid doc id' });
    const rawBody = typeof req.body?.body === 'string' ? req.body.body : '';
    if (rawBody.length > 2000) return res.status(400).json({ error: 'Comment must be between 2 and 2000 characters' });
    const body = sanitizeText(rawBody, 2000).trim();
    if (body.length < 2) return res.status(400).json({ error: 'Comment must be between 2 and 2000 characters' });
    try {
      // Never bloat the comments table with a 300KB avatar data-URL — the UI
      // falls back to a letter avatar when authorAvatar is empty.
      const avatar = (actor.avatarUrl || '').slice(0, 2000);
      const comment = await createComment({
        docId,
        userId: actor.id,
        authorName: actor.name,
        authorAvatar: avatar.startsWith('data:') ? '' : avatar,
        body,
      });
      res.status(201).json({ comment });
    } catch (err) {
      console.error('[comments/create]', (err as Error).message);
      res.status(500).json({ error: 'Failed to post comment' });
    }
  });

  app.delete('/api/v1/comments/:id', async (req, res) => {
    const actor = getActorUser(req);
    if (!actor) return res.status(401).json({ error: 'Authentication required' });
    const id = sanitizeText(req.params.id, 64);
    if (!id) return res.status(400).json({ error: 'Comment id is required' });
    try {
      const outcome = await deleteComment(id, actor);
      if (outcome === 'deleted') return res.json({ success: true });
      if (outcome === 'forbidden') return res.status(403).json({ error: 'You can only delete your own comments' });
      res.status(404).json({ error: 'Comment not found' });
    } catch (err) {
      console.error('[comments/delete]', (err as Error).message);
      res.status(500).json({ error: 'Failed to delete comment' });
    }
  });

  // ----------------------------------------------------
  // REAL SOCIAL LOGIN: Discord / Google / GitHub (OAuth 2.0)
  // Activated by adding <PROVIDER>_CLIENT_ID + <PROVIDER>_CLIENT_SECRET env.
  // ----------------------------------------------------

  // Which providers are configured — lets the UI enable/disable buttons.
  app.get('/api/v1/auth/providers', (_req, res) => {
    res.json({ providers: listConfiguredProviders() });
  });

  // ---- OAuth state cookie: binds the provider round-trip to ONE browser ----
  // Without it, a signed state is transferable — see src/server/oauth.ts.
  const OAUTH_STATE_COOKIE = 'vnt_oauth_state';

  function isHttpsRequest(req: Request): boolean {
    if (req.secure) return true;
    const proto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
    return proto === 'https' || !!process.env.VERCEL;
  }

  function readCookie(req: Request, name: string): string {
    const header = String(req.headers.cookie || '');
    for (const part of header.split(';')) {
      const i = part.indexOf('=');
      if (i < 0 || part.slice(0, i).trim() !== name) continue;
      try {
        return decodeURIComponent(part.slice(i + 1).trim());
      } catch {
        return '';
      }
    }
    return '';
  }

  function oauthStateCookie(req: Request, nonce: string): string {
    const secure = isHttpsRequest(req) ? '; Secure' : '';
    // SameSite=Lax: the provider returns via a top-level GET navigation, which
    // still carries Lax cookies — but a cross-site POST/iframe would not.
    return `${OAUTH_STATE_COOKIE}=${encodeURIComponent(nonce)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=600${secure}`;
  }

  function clearOAuthStateCookie(req: Request): string {
    const secure = isHttpsRequest(req) ? '; Secure' : '';
    return `${OAUTH_STATE_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
  }

  // Step 1: send the browser to the provider's consent screen.
  // (Path kept OUT of /auth/oauth on purpose: Vercel's edge intercepts
  // "/oauth/<seg>" GETs before the lambda — see comment in oauth.ts.)
  app.get('/api/v1/social/:provider', (req, res) => {
    const base = appBaseUrl(req);
    const provider = sanitizeText(req.params.provider, 20).toLowerCase();
    if (!isOAuthProvider(provider)) return res.redirect(`${base}/login#vnt_error=unknown_provider`);
    const cfg = getProviderConfig(provider);
    if (!cfg) return res.redirect(`${base}/login#vnt_error=not_configured`);
    const nonce = newOAuthNonce();
    const state = signState(provider, cfg.clientSecret, nonce);
    res.setHeader('Set-Cookie', oauthStateCookie(req, nonce));
    return res.redirect(buildAuthorizeUrl(cfg, state, callbackUrl(req, provider)));
  });

  // Step 2: provider redirects back with ?code&state → session → SPA.
  app.get('/api/v1/social/:provider/callback', async (req, res) => {
    const base = appBaseUrl(req);
    const provider = sanitizeText(req.params.provider, 20).toLowerCase();
    if (!isOAuthProvider(provider)) return res.redirect(`${base}/login#vnt_error=unknown_provider`);
    const cfg = getProviderConfig(provider);
    if (!cfg) return res.redirect(`${base}/login#vnt_error=not_configured`);

    const code = typeof req.query.code === 'string' ? req.query.code : '';
    const state = typeof req.query.state === 'string' ? req.query.state : '';
    if (typeof req.query.error === 'string' && req.query.error) {
      res.setHeader('Set-Cookie', clearOAuthStateCookie(req));
      return res.redirect(`${base}/login#vnt_error=provider_denied`);
    }
    // Consumed exactly once: signature + freshness + the nonce cookie of the
    // browser that started this flow. A missing cookie (blocked by the
    // browser, or a state captured from someone else) fails verification.
    const nonce = readCookie(req, OAUTH_STATE_COOKIE);
    res.setHeader('Set-Cookie', clearOAuthStateCookie(req));
    if (!code || !verifyState(provider, cfg.clientSecret, state, nonce)) {
      return res.redirect(`${base}/login#vnt_error=invalid_state`);
    }

    try {
      const accessToken = await exchangeCode(cfg, code, callbackUrl(req, provider));
      const profile = await fetchProfile(cfg, accessToken);
      const user = await upsertOAuthUser({
        provider,
        providerId: profile.providerId,
        email: profile.email,
        emailVerified: profile.emailVerified,
        name: profile.name,
        avatarUrl: profile.avatarUrl,
      });
      // Persist the GitHub grant so the publishing system can read
      // the user's repositories. The token is encrypted at rest and
      // never returned to any client. A storage hiccup must not
      // fail the login itself.
      if (provider === 'github') {
        try {
          await saveGitHubToken(user.id, accessToken);
        } catch (err) {
          console.error('[auth] github token store failed:', (err as Error).message);
        }
      }
      // Real 2FA: an OAuth sign-in must still prove the authenticator code.
      // Issue a short-lived signed challenge instead of a session token; the
      // SPA collects the code and finishes via POST /auth/2fa/complete.
      if (user.twoFactorEnabled) {
        return res.redirect(`${base}/login#vnt_2fa=${makeTwoFactorState(user.id)}`);
      }

      const token = await createSession(user, { ip: req.ip, userAgent: String(req.headers['user-agent'] || '') });
      persistAuditLog({
        actorId: user.id,
        actorName: user.name,
        actorEmail: user.email,
        action: `OAUTH_LOGIN_${provider.toUpperCase()}`,
        category: 'AUTH',
        target: `User Account: ${user.id}`,
        source: detectSource(req),
        status: 'SUCCESS',
        ipAddress: req.ip || 'unknown',
        metadata: { provider },
      });
      // Token travels in the fragment (never sent to the server in requests).
      return res.redirect(`${base}/login#vnt_oauth=${token}`);
    } catch (err) {
      console.error(`[auth] oauth ${provider} failed:`, err);
      const msg = (err as Error).message || '';
      if (msg.includes('db:migrate')) return res.redirect(`${base}/login#vnt_error=storage`);
      return res.redirect(`${base}/login#vnt_error=provider_failed`);
    }
  });

  // ---- Active sessions: REAL rows from auth_sessions ------------------------
  // A session row's only identity is its (irreversible) token hash, which is
  // what the client sends back to revoke. We know when a session was created
  // but do not track per-request activity — lastActiveAt therefore mirrors
  // createdAt rather than inventing an activity time.
  function sessionFacts(ua: string) {
    const l = ua.toLowerCase();
    const browser = /edg\//.test(l) ? 'Edge'
      : /opr\//.test(l) ? 'Opera'
      : /chrome\//.test(l) ? 'Chrome'
      : /firefox\//.test(l) ? 'Firefox'
      : /safari\//.test(l) ? 'Safari'
      : ua ? 'Other' : 'Unknown';
    const os = /windows/.test(l) ? 'Windows'
      : /android/.test(l) ? 'Android'
      : /iphone|ipad|ipod/.test(l) ? 'iOS'
      : /mac os|macintosh/.test(l) ? 'macOS'
      : /linux/.test(l) ? 'Linux'
      : 'Unknown';
    const device = /android|iphone|ipad|ipod|mobile/.test(l) ? 'Mobile' : ua ? 'Desktop' : 'Unknown';
    const source: ClientSource = /bot|crawl|spider|curl|axios|discord|wget/.test(l) ? 'BOT'
      : /android|iphone|ipad|ipod|mobile/.test(l) ? 'MOBILE'
      : /electron/.test(l) ? 'DESKTOP'
      : 'WEB';
    return { browser, os, device, source };
  }

  app.get('/api/v1/auth/sessions', async (req, res) => {
    const actor = getActorUser(req);
    if (!actor) return res.status(401).json({ error: 'Authentication required' });
    try {
      const current = currentSessionHash(req);
      const rows = await listUserSessions(actor.id);
      const sessions = rows.map((row) => {
        const facts = sessionFacts(row.userAgent);
        return {
          id: row.id,
          browser: facts.browser,
          os: facts.os,
          device: facts.device,
          ip: row.ip,
          source: facts.source,
          isCurrent: !!current && row.id === current,
          createdAt: row.createdAt,
          lastActiveAt: row.createdAt,
        };
      });
      res.json({ sessions });
    } catch (err) {
      console.error('[sessions/list]', (err as Error).message);
      res.status(500).json({ error: 'Could not list sessions' });
    }
  });

  app.delete('/api/v1/auth/sessions/:id', async (req, res) => {
    const id = sanitizeText(req.params.id, 128);
    const actor = getActorUser(req);
    if (!actor) return res.status(401).json({ error: 'Authentication required' });
    try {
      // Ownership is enforced inside revokeUserSession (user_id predicate) —
      // one account can never terminate another account's session.
      const removed = await revokeUserSession(actor.id, id);
      if (!removed) return res.status(404).json({ error: 'Session not found' });
      persistAuditLog({
        actorId: actor.id,
        actorName: actor.name,
        actorEmail: actor.email,
        action: 'SESSION_REVOKED',
        category: 'AUTH',
        target: `Session: ${id.slice(0, 12)}…`,
        source: detectSource(req),
        status: 'SUCCESS',
        ipAddress: req.ip || 'unknown',
        metadata: { sessionHashPrefix: id.slice(0, 12), self: id === currentSessionHash(req) },
      });
      return res.json({ success: true, message: 'Session terminated' });
    } catch (err) {
      console.error('[sessions/revoke]', (err as Error).message);
      res.status(500).json({ error: 'Could not revoke session' });
    }
  });

  // ---- Password rotation ----------------------------------------------------
  // Proof = existing session + current password. After the change every OTHER
  // session is revoked: a stolen session must not survive a credential change.
  app.post('/api/v1/auth/password', async (req, res) => {
    const actor = getActorUser(req);
    if (!actor) return res.status(401).json({ error: 'Authentication required' });
    const current = typeof req.body?.currentPassword === 'string' ? req.body.currentPassword : '';
    const next = typeof req.body?.newPassword === 'string' ? req.body.newPassword : '';
    if (next.length < 8 || next.length > 128) {
      return res.status(400).json({ error: 'Password must be between 8 and 128 characters' });
    }
    if (current === next) {
      return res.status(400).json({ error: 'New password must be different from the current one' });
    }
    try {
      const ok = await verifyPasswordFor(actor.id, current);
      if (!ok) {
        persistAuditLog({
          actorId: actor.id,
          actorName: actor.name,
          actorEmail: actor.email,
          action: 'PASSWORD_CHANGE_FAILED',
          category: 'AUTH',
          target: `User Account: ${actor.id}`,
          source: detectSource(req),
          status: 'FAILURE',
          ipAddress: req.ip || 'unknown',
          metadata: { reason: 'wrong_current_password' },
        });
        return res.status(401).json({ error: 'Current password is incorrect' });
      }
      await setPassword(actor.id, await hashPassword(next));
      const keep = currentSessionHash(req);
      const sessionsRevoked = await revokeOtherSessions(actor.id, keep);
      persistAuditLog({
        actorId: actor.id,
        actorName: actor.name,
        actorEmail: actor.email,
        action: 'PASSWORD_CHANGED',
        category: 'AUTH',
        target: `User Account: ${actor.id}`,
        source: detectSource(req),
        status: 'SUCCESS',
        ipAddress: req.ip || 'unknown',
        metadata: { sessionsRevoked },
      });
      res.json({ success: true, sessionsRevoked });
    } catch (err) {
      console.error('[auth/password] change failed:', (err as Error).message);
      res.status(500).json({ error: 'Password change failed' });
    }
  });

  // API Keys List
  app.get('/api/v1/api-keys', (req, res) => {
    const actor = getActorUser(req);
    if (!actor) return res.status(401).json({ error: 'Authentication required' });
    // If admin, can see all or own, else own
    if (actor.role === 'ADMIN') {
      return res.json({ keys: db.apiKeys, allScopes: ALL_SCOPES });
    }
    const userKeys = db.apiKeys.filter((k) => k.ownerId === actor.id);
    res.json({ keys: userKeys, allScopes: ALL_SCOPES.filter((s) => !s.adminOnly) });
  });

  // API Keys Usage Analytics (Time-series volume, latency, status codes for recharts visualization)
  app.get('/api/v1/api-keys/usage-analytics', (req, res) => {
    const actor = getActorUser(req);
    if (!actor) return res.status(401).json({ error: 'Authentication required' });
    const period = (req.query.period as '24h' | '7d' | '30d') || '24h';
    // Admins see the fleet-wide picture; a signed-in user only ever sees the
    // analytics of keys they own (null ownerId = no restriction).
    const data = db.getKeyUsageAnalytics(period, actor.role === 'ADMIN' ? null : actor.id);
    res.json(data);
  });

  // Deep usage analysis — the data-analysis domain lives in Python/R
  // (`services/analytics`). The gateway forwards the raw usage window and
  // falls back to the native TypeScript analysis whenever the service is
  // unconfigured, unreachable or answers with an unexpected shape.
  const analyticsPeriod = (raw: unknown): AnalyticsPeriod =>
    (ANALYTICS_PERIODS as string[]).includes(String(raw)) ? (raw as AnalyticsPeriod) : '24h';

  const analyticsEventsFor = (actor: { id: string; role: string }): UsageEvent[] => {
    // Admins analyse the fleet; a signed-in user only their own keys' events.
    const ownerId = actor.role === 'ADMIN' ? null : actor.id;
    const events = db.apiKeyUsageEvents;
    return ownerId ? events.filter((event) => event.ownerId === ownerId) : [...events];
  };

  const analyticsUpstream = (): string => {
    const url = getAnalyticsServiceUrl();
    return url ? `python_remote:${url}` : 'typescript_native';
  };

  // GET /api/v1/analytics/insights?period=24h|7d|30d
  app.get('/api/v1/analytics/insights', async (req, res) => {
    try {
      const actor = getActorUser(req);
      if (!actor) return res.status(401).json({ error: 'Authentication required' });
      const period = analyticsPeriod(req.query.period);
      const events = analyticsEventsFor(actor);
      const remote = await remoteAnalyze(events, period);
      if (remote) return res.json({ ...remote, upstream: analyticsUpstream() });
      return res.json({ ...nativeAnalyze(events, period), upstream: 'typescript_native' });
    } catch (error) {
      console.error('analytics insights failed:', error);
      res.status(500).json({ error: 'Analysis failed' });
    }
  });

  // GET /api/v1/analytics/report?period=24h|7d|30d — Markdown + CSV exports.
  app.get('/api/v1/analytics/report', async (req, res) => {
    try {
      const actor = getActorUser(req);
      if (!actor) return res.status(401).json({ error: 'Authentication required' });
      const period = analyticsPeriod(req.query.period);
      const events = analyticsEventsFor(actor);
      const remote = await remoteReport(events, period);
      if (remote) return res.json({ ...remote, upstream: analyticsUpstream() });
      const analysis = nativeAnalyze(events, period);
      return res.json({
        markdown: nativeReport(analysis),
        timeseriesCsv: nativeTimeseriesCsv(analysis),
        endpointsCsv: nativeEndpointsCsv(analysis),
        analysis,
        upstream: 'typescript_native',
      });
    } catch (error) {
      console.error('analytics report failed:', error);
      res.status(500).json({ error: 'Report failed' });
    }
  });

  // API Key Create (with assertGrantableScopes + strict validation)
  app.post('/api/v1/api-keys', async (req, res) => {
    try {
      const actor = getActorUser(req);
      if (!actor) return res.status(401).json({ error: 'Authentication required' });
      const name = sanitizeText(req.body?.name, 80);
      const scopes = req.body?.scopes;
      const environment = req.body?.environment === 'test' ? 'test' : 'live';
      const rateLimitPerMin = Math.min(Math.max(Number(req.body?.rateLimitPerMin) || 600, 10), 10000);

      if (!name || name.length < 3 || !scopes || !Array.isArray(scopes) || scopes.length === 0 || scopes.length > 30) {
        return res.status(400).json({ error: 'Invalid parameters. "name" (3-80 chars) and "scopes" array (1-30) are required.' });
      }
      if (!scopes.every((s: unknown) => isValidScope(s) && isKnownScope(s))) {
        return res.status(400).json({ error: 'Invalid or unknown scope.' });
      }

      const result = db.createApiKey({
        name,
        ownerId: actor.id,
        ownerName: actor.name,
        requesterRole: actor.role,
        scopes: scopes as PermissionScope[],
        environment,
        rateLimitPerMin,
        expiresAt: typeof req.body?.expiresAt === 'string' ? req.body.expiresAt.slice(0, 64) : null,
      });

      // Durable before we answer 201. A key that exists only in this process
      // would evaporate on the next deploy and we would have handed out a
      // secret that no longer authenticates — so on failure we undo the
      // in-memory create and say so.
      if (!(await persistOrRollbackKey(result.key, res))) return;

      res.status(201).json({
        key: result.key,
        rawSecret: result.rawSecret,
        revealNote: 'This secret is revealed only once. Store it in a secure vault.',
      });
    } catch (err: any) {
      res.status(403).json({ error: 'Request denied' });
    }
  });

  // API Key Rotate (Safe Rotation)
  app.post('/api/v1/api-keys/:id/rotate', async (req, res) => {
    try {
      const actor = getActorUser(req);
      if (!actor) return res.status(401).json({ error: 'Authentication required' });
      const id = sanitizeText(req.params.id, 128);
      const result = db.rotateApiKey(id, actor);
      // Persist BEFORE revealing the new secret: if the write fails, the old
      // secret must not be left invalidated on disk.
      if (!(await persistKeyOr500(result.key, res))) return;
      dispatchWebhooks('key.rotated', { keyId: result.key.id, keyName: result.key.name, ownerId: result.key.ownerId, keyPrefix: result.key.keyPrefix });
      res.json({
        key: result.key,
        rawSecret: result.rawSecret,
        revealNote: 'Previous secret has been permanently invalidated. Store this new secret securely.',
      });
    } catch (err: any) {
      res.status(400).json({ error: 'Rotation failed' });
    }
  });

  // API Key Revoke (Safe Revoke)
  app.delete('/api/v1/api-keys/:id', async (req, res) => {
    try {
      const actor = getActorUser(req);
      if (!actor) return res.status(401).json({ error: 'Authentication required' });
      const id = sanitizeText(req.params.id, 128);
      const reason = sanitizeText(req.body?.reason, 200);
      const key = db.revokeApiKey(id, actor, reason || undefined);
      // Revocation is a security control: never 2xx it unless it is durable.
      if (!(await persistKeyOr500(key, res))) return;
      dispatchWebhooks('key.revoked', { keyId: key.id, keyName: key.name, ownerId: key.ownerId, reason: reason || 'revoked' });
      res.json({ success: true, key });
    } catch (err: any) {
      res.status(400).json({ error: 'Revocation failed' });
    }
  });

  // API Key Update Scopes
  app.patch('/api/v1/api-keys/:id/scopes', async (req, res) => {
    try {
      const actor = getActorUser(req);
      if (!actor) return res.status(401).json({ error: 'Authentication required' });
      const id = sanitizeText(req.params.id, 128);
      const { scopes } = req.body;
      if (!scopes || !Array.isArray(scopes) || scopes.length > 30 || !scopes.every((s: unknown) => isValidScope(s) && isKnownScope(s))) {
        return res.status(400).json({ error: 'Valid scopes array required (max 30)' });
      }
      const key = db.updateApiKeyScopes(id, scopes, actor);
      if (!(await persistKeyOr500(key, res))) return;
      res.json({ success: true, key });
    } catch (err: any) {
      res.status(403).json({ error: 'Scope update denied' });
    }
  });

  // API Key Update Rate Limit & Resource Policy
  app.patch('/api/v1/api-keys/:id/rate-limit', async (req, res) => {
    try {
      const actor = getActorUser(req);
      if (!actor) return res.status(401).json({ error: 'Authentication required' });
      const id = sanitizeText(req.params.id, 128);
      const { rateLimitPerMin, burstLimit, rateLimitAlgorithm, actionOnExceed, monthlyQuota } = req.body;
      const rpm = Number(rateLimitPerMin);
      if (!rpm || !Number.isFinite(rpm) || rpm < 10 || rpm > 10000) {
        return res.status(400).json({ error: 'rateLimitPerMin must be 10-10000' });
      }
      if (rateLimitAlgorithm && !['sliding_window', 'token_bucket', 'fixed_window'].includes(rateLimitAlgorithm)) {
        return res.status(400).json({ error: 'Invalid rate limit algorithm' });
      }
      if (actionOnExceed && !['reject_429', 'throttle_delay', 'alert_only'].includes(actionOnExceed)) {
        return res.status(400).json({ error: 'Invalid actionOnExceed' });
      }
      const key = db.updateApiKeyRateLimit(
        id,
        {
          rateLimitPerMin: Math.floor(rpm),
          burstLimit: burstLimit !== undefined ? Math.min(Math.max(Number(burstLimit) || 0, 0), 1000) : undefined,
          rateLimitAlgorithm,
          actionOnExceed,
          monthlyQuota: monthlyQuota !== undefined ? Math.min(Math.max(Number(monthlyQuota) || 0, 0), 100_000_000) : undefined,
        },
        actor
      );
      if (!(await persistKeyOr500(key, res))) return;
      res.json({ success: true, key });
    } catch (err: any) {
      res.status(400).json({ error: 'Rate limit update failed' });
    }
  });

  // API Key Simulate / Test Rate Limit Ingress
  // NOTE: the old POST /api-keys/:id/simulate-traffic endpoint was removed on
  // purpose — it inflated usage counters and rate-limit headers without a
  // single real request. Usage is only ever moved by genuine traffic (see
  // authenticateApiKey's res.on('finish') recorder → usage-analytics).

  // ---------------------------------------------------------------------------
  // PUBLIC API — machine-to-machine surface for external integrations.
  // Authenticated with an API key created in the dashboard:
  //   x-api-key: sk_live_vanitas_...            (or)
  //   Authorization: Bearer sk_live_vanitas_...
  // Every response carries X-RateLimit-Limit/Remaining/Reset.
  // ---------------------------------------------------------------------------

  // Key liveness check (no scope required)
  app.get('/api/v1/public/ping', authenticateApiKey, (req, res) => {
    const key = (req as any).apiKey as ApiKey;
    res.json({
      ok: true,
      key: { id: key.id, name: key.name, environment: key.environment, status: key.status, scopes: key.scopes },
      serverTime: new Date().toISOString(),
    });
  });

  // Key + owner + limits (no scope required)
  app.get('/api/v1/public/me', authenticateApiKey, (req, res) => {
    const key = (req as any).apiKey as ApiKey;
    const quota = key.monthlyQuota || 0;
    const used = key.currentUsageThisMonth || 0;
    res.json({
      key: {
        id: key.id,
        name: key.name,
        keyPrefix: key.keyPrefix,
        maskedSecret: key.maskedSecret,
        scopes: key.scopes,
        status: key.status,
        environment: key.environment,
        createdAt: key.createdAt,
        expiresAt: key.expiresAt,
        lastUsedAt: key.lastUsedAt,
        usageCount: key.usageCount,
        usagePeriod: key.usagePeriod,
      },
      // Registered users live in the auth store (PG), not db.users — so the
      // owner is reported from the key record itself, never looked up.
      owner: { id: key.ownerId, name: key.ownerName },
      limits: {
        rateLimitPerMin: key.rateLimitPerMin,
        burstLimit: key.burstLimit,
        rateLimitAlgorithm: key.rateLimitAlgorithm || 'sliding_window',
        actionOnExceed: key.actionOnExceed || 'reject_429',
        monthlyQuota: quota,
        usedThisMonth: used,
        remainingQuota: quota > 0 ? Math.max(0, quota - used) : null,
        quotaResetsAt: nextQuotaReset(),
      },
    });
  });

  // Service status (requires the api.read scope)
  app.get('/api/v1/public/status', authenticateApiKey, requireScope('api.read'), async (_req, res) => {
    let database: 'connected' | 'unreachable' | 'in-memory-fallback';
    if (databasePool) {
      try {
        await databasePool.query('select 1');
        database = 'connected';
      } catch {
        database = 'unreachable';
      }
    } else {
      database = 'in-memory-fallback';
    }

    const stats = db.systemStats;
    // Count active keys LIVE — in PG mode the in-memory list is always empty.
    let activeApiKeys = db.apiKeys.filter((k) => k.status === 'active').length;
    if (databasePool && database === 'connected') {
      try {
        const keys = await databasePool.query("select count(*)::int as n from public.api_keys where status = 'active'");
        activeApiKeys = keys.rows[0].n;
      } catch {
        // keep in-memory fallback value
      }
    }
    res.json({
      status: database === 'unreachable' ? 'degraded' : 'operational',
      database,
      services: stats.services,
      stats: {
        apiRequestsToday: stats.apiRequestsToday,
        p95LatencyMs: stats.p95LatencyMs,
        errorRate: stats.errorRate,
        activeApiKeys,
      },
      uptimeSeconds: Math.round(process.uptime()),
      serverTime: new Date().toISOString(),
    });
  });

  // Own usage / quota (no scope required — callers may always see their own)
  app.get('/api/v1/public/quota', authenticateApiKey, (req, res) => {
    const key = (req as any).apiKey as ApiKey;
    const quota = key.monthlyQuota || 0;
    const used = key.currentUsageThisMonth || 0;
    res.json({
      key: { id: key.id, name: key.name },
      quota: {
        limit: quota,
        used,
        remaining: quota > 0 ? Math.max(0, quota - used) : null,
        period: key.usagePeriod,
        resetsAt: nextQuotaReset(),
      },
      rate: rateWindowStatus(key),
    });
  });

  // -------------------------------------------------------------------------
  // Audit trail: always recorded in the in-memory view AND durably in
  // PostgreSQL, so the admin log survives restarts and deploys.
  // -------------------------------------------------------------------------
  function persistAuditLog(entry: Parameters<typeof db.recordAuditLog>[0]): void {
    const log = db.recordAuditLog(entry);
    if (!databasePool) return;
    databasePool
      .query(
        `insert into public.audit_logs
           (id, timestamp, actor_id, actor_name, actor_email, action, category, target, source, status, request_id, ip_address, metadata)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
         on conflict (id) do nothing`,
        [
          log.id,
          log.timestamp,
          log.actorId,
          log.actorName,
          log.actorEmail,
          log.action,
          log.category,
          log.target,
          log.source,
          log.status,
          log.requestId,
          log.ipAddress,
          JSON.stringify(log.metadata || {}),
        ],
      )
      .catch((err) => console.error('[audit/persist]', (err as Error).message));
  }

  function mapAuditRow(row: Record<string, any>): AuditLog {
    const iso = (v: any) => (v instanceof Date ? v.toISOString() : v || '');
    let metadata: Record<string, unknown> = {};
    try {
      metadata = typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata || {};
    } catch {
      metadata = {};
    }
    return {
      id: row.id,
      timestamp: iso(row.timestamp),
      actorId: row.actor_id,
      actorName: row.actor_name,
      actorEmail: row.actor_email,
      action: row.action,
      category: row.category,
      target: row.target,
      source: row.source,
      status: row.status,
      requestId: row.request_id,
      ipAddress: row.ip_address,
      metadata,
    };
  }

  // Newest-first audit source: PostgreSQL when connected, memory otherwise.
  async function loadAuditSource(): Promise<AuditLog[]> {
    if (!databasePool) return [...db.auditLogs];
    try {
      const r = await databasePool.query(
        'select * from public.audit_logs order by timestamp desc limit 5000',
      );
      return r.rows.map(mapAuditRow);
    } catch (err) {
      console.error('[admin/logs]', (err as Error).message);
      return [...db.auditLogs];
    }
  }

  // -------------------------------------------------------------------------
  // Developer invite links — an admin hands a URL to someone who has NO
  // account yet; the promised role/badge lands when they register through it.
  // -------------------------------------------------------------------------
  const memoryInvites: AdminInvite[] = [];

  function mapInviteRow(row: Record<string, any>): AdminInvite {
    const iso = (v: any) => (v instanceof Date ? v.toISOString() : v || '');
    return {
      id: row.id,
      token: decryptInviteToken(row.token),
      createdBy: row.created_by,
      createdByName: row.created_by_name,
      role: row.role === 'USER' ? 'USER' : 'ADMIN',
      verification: ['USER', 'DEVELOPER', 'ADMIN'].includes(row.verification) ? row.verification : '',
      note: row.note || '',
      maxUses: Number(row.max_uses) || 1,
      uses: Number(row.uses) || 0,
      revoked: !!row.revoked,
      expiresAt: iso(row.expires_at),
      createdAt: iso(row.created_at),
    };
  }

  /** An invite can still be redeemed only if it is live: not revoked, uses left, not expired. */
  function inviteUsable(invite: AdminInvite): boolean {
    return !invite.revoked && invite.uses < invite.maxUses && Date.parse(invite.expiresAt) > Date.now();
  }

  // ---- invite tokens at rest -------------------------------------------------
  // An invite token IS a credential (some grant ADMIN), so in PostgreSQL mode
  // we never store it raw: lookup goes through sha256(token), display goes
  // through AES-256-GCM ciphertext in the token column (`enc:v1:…`). A database
  // dump alone can no longer be redeemed.
  //
  // The key prefers INVITE_ENC_KEY (independent, survives a password rotation).
  // Deriving it from DATABASE_URL was the old fallback — workable, but it meant
  // that anyone who read the connection string could decrypt every stored
  // invite, and rotating the DB password silently invalidated all of them.
  const inviteCryptoKey = databasePool
    ? process.env.INVITE_ENC_KEY && process.env.INVITE_ENC_KEY.length >= 32
      ? crypto.createHash('sha256').update(`vanitas.invite.v1|${process.env.INVITE_ENC_KEY}`).digest()
      : process.env.DATABASE_URL
        ? crypto.createHash('sha256').update(`vanitas.invite.v1|${process.env.DATABASE_URL}`).digest()
        : null
    : null;

  function sha256Hex(value: string): string {
    return crypto.createHash('sha256').update(value).digest('hex');
  }

  function encryptInviteToken(token: string): string {
    if (!inviteCryptoKey) return token;
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', inviteCryptoKey, iv);
    const ct = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
    return `enc:v1:${Buffer.concat([iv, cipher.getAuthTag(), ct]).toString('base64url')}`;
  }

  function decryptInviteToken(stored: string): string {
    if (!stored || !stored.startsWith('enc:v1:')) return stored || ''; // legacy plaintext row
    if (!inviteCryptoKey) return '';
    try {
      const raw = Buffer.from(stored.slice('enc:v1:'.length), 'base64url');
      const decipher = crypto.createDecipheriv('aes-256-gcm', inviteCryptoKey, raw.subarray(0, 12));
      decipher.setAuthTag(raw.subarray(12, 28));
      return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString('utf8');
    } catch {
      return ''; // key changed or row tampered with — unredeemable, not crashable
    }
  }

  async function findInviteByToken(token: string): Promise<AdminInvite | null> {
    if (!databasePool) return memoryInvites.find((i) => i.token === token) || null;
    await ensureSchema(); // token_hash column may not exist on a fresh boot
    try {
      const hash = sha256Hex(token);
      let r = await databasePool.query('select * from public.admin_invites where token_hash = $1', [hash]);
      if (r.rows[0]) return mapInviteRow(r.rows[0]);
      // Legacy row (created before tokens were hashed at rest): find it once
      // by raw value, migrate it in place, then serve it normally.
      r = await databasePool.query('select * from public.admin_invites where token = $1', [token]);
      const row = r.rows[0];
      if (!row) return null;
      await databasePool.query('update public.admin_invites set token_hash = $2, token = $3 where id = $1', [
        row.id,
        hash,
        encryptInviteToken(token),
      ]);
      return mapInviteRow({ ...row, token_hash: hash, token: encryptInviteToken(token) });
    } catch (err) {
      console.error('[invites/lookup]', (err as Error).message);
      return null;
    }
  }

  async function listInvites(): Promise<AdminInvite[]> {
    if (!databasePool) {
      return [...memoryInvites].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
    }
    try {
      const r = await databasePool.query(
        'select * from public.admin_invites order by created_at desc limit 100',
      );
      return r.rows.map(mapInviteRow);
    } catch (err) {
      console.error('[invites/list]', (err as Error).message);
      return [];
    }
  }

  async function createInvite(params: {
    createdBy: string;
    createdByName: string;
    role: 'USER' | 'ADMIN';
    verification: string;
    note: string;
    maxUses: number;
  }): Promise<AdminInvite> {
    const invite: AdminInvite = {
      id: secureId('inv'),
      token: secureToken('inv_'),
      createdBy: params.createdBy,
      createdByName: params.createdByName,
      role: params.role,
      verification: (params.verification || '') as VerificationType,
      note: params.note,
      maxUses: params.maxUses,
      uses: 0,
      revoked: false,
      expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
      createdAt: new Date().toISOString(),
    };
    if (!databasePool) {
      memoryInvites.unshift(invite);
      return invite;
    }
    await ensureSchema(); // token_hash column may not exist on a fresh boot
    const r = await databasePool.query(
      `insert into public.admin_invites
         (id, token, token_hash, created_by, created_by_name, role, verification, note, max_uses, uses, revoked, expires_at, created_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, 0, false, $10, $11) returning *`,
      [
        invite.id,
        encryptInviteToken(invite.token),
        sha256Hex(invite.token),
        invite.createdBy,
        invite.createdByName,
        invite.role,
        invite.verification,
        invite.note,
        invite.maxUses,
        invite.expiresAt,
        invite.createdAt,
      ],
    );
    return mapInviteRow(r.rows[0]);
  }

  async function revokeInvite(id: string): Promise<AdminInvite | null> {
    if (!databasePool) {
      const inv = memoryInvites.find((i) => i.id === id);
      if (!inv) return null;
      inv.revoked = true;
      return inv;
    }
    const r = await databasePool.query(
      'update public.admin_invites set revoked = true where id = $1 returning *',
      [id],
    );
    return r.rows[0] ? mapInviteRow(r.rows[0]) : null;
  }

  /** Atomically consume one use — two signups racing the same link can't both win. */
  async function claimInvite(id: string): Promise<boolean> {
    if (!databasePool) {
      const inv = memoryInvites.find((i) => i.id === id);
      if (!inv || !inviteUsable(inv)) return false;
      inv.uses += 1;
      return true;
    }
    try {
      const r = await databasePool.query(
        `update public.admin_invites
            set uses = uses + 1
          where id = $1 and not revoked and uses < max_uses and expires_at > now()
          returning id`,
        [id],
      );
      return (r.rowCount ?? 0) > 0;
    } catch (err) {
      console.error('[invites/claim]', (err as Error).message);
      return false;
    }
  }

  // Admin Users List — PostgreSQL when connected; the in-memory array alone
  // would hide every real production account from this view.
  app.get('/api/v1/admin/users', async (req, res) => {
    if (!requireAdmin(req, res)) return;
    if (databasePool) {
      try {
        const r = await databasePool.query(
          'select * from public.users order by created_at asc limit 500',
        );
        return res.json({ users: r.rows.map(rowToUser) });
      } catch (err) {
        console.error('[admin/users]', (err as Error).message);
        return res.status(500).json({ error: 'Failed to load users' });
      }
    }
    res.json({ users: db.users });
  });

  // Admin User Role Update (cannot demote last admin)
  app.patch('/api/v1/admin/users/:id/role', wrap(async (req, res) => {
    const actor = requireAdmin(req, res);
    if (!actor) return;

    const id = sanitizeText(req.params.id, 64);
    const role = sanitizeText(req.body?.role, 16);
    if (!['USER', 'ADMIN'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }

    let targetUser: User | null = null;
    if (databasePool) {
      const found = await databasePool.query('select * from public.users where id = $1', [id]);
      targetUser = found.rows[0] ? rowToUser(found.rows[0]) : null;
    } else {
      targetUser = db.users.find((u) => u.id === id) || null;
    }
    if (!targetUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (targetUser.id === actor.id && role !== 'ADMIN') {
      let adminCount: number;
      if (databasePool) {
        const c = await databasePool.query(
          `select count(*)::int as n from public.users where role = 'ADMIN'`,
        );
        adminCount = c.rows[0].n;
      } else {
        adminCount = db.users.filter((u) => u.role === 'ADMIN').length;
      }
      if (adminCount <= 1) return res.status(400).json({ error: 'Cannot demote the last administrator' });
    }

    const priorRole = targetUser.role;
    targetUser.role = role as UserRole;
    if (databasePool) {
      await databasePool.query('update public.users set role = $2 where id = $1', [id, role]);
    }
    // The target's live session must see the new role NOW — without this the
    // 60s resolve cache would keep serving the old role after a promotion.
    invalidateResolveCache(targetUser.id);

    persistAuditLog({
      actorId: actor.id,
      actorName: actor.name,
      actorEmail: actor.email,
      action: 'USER_ROLE_CHANGED',
      category: 'ADMIN',
      target: `${targetUser.id} (${targetUser.email}) -> ${role}`,
      source: detectSource(req),
      status: 'SUCCESS',
      ipAddress: req.ip || 'unknown',
      metadata: { priorRole, newRole: role },
    });

    res.json({ success: true, user: targetUser });
  }));

  // Admin: grant or revoke the verification badge shown next to a user's name.
  // Three kinds — USER (verified), DEVELOPER, ADMIN — only admins may grant.
  app.patch('/api/v1/admin/users/:id/verification', wrap(async (req, res) => {
    const actor = requireAdmin(req, res);
    if (!actor) return;

    const id = sanitizeText(req.params.id, 64);
    const raw = req.body?.verification;
    if (typeof raw !== 'string') {
      return res.status(400).json({ error: 'verification field is required' });
    }
    const value = sanitizeText(raw, 16);
    if (!['', 'USER', 'DEVELOPER', 'ADMIN'].includes(value)) {
      return res.status(400).json({ error: 'verification must be USER, DEVELOPER or ADMIN (empty string revokes)' });
    }

    let updated: User | null = null;
    if (databasePool) {
      const found = await databasePool.query(
        'update public.users set verification = $2 where id = $1 returning *',
        [id, value],
      );
      updated = found.rows[0] ? rowToUser(found.rows[0]) : null;
    } else {
      const u = db.users.find((x) => x.id === id);
      if (u) {
        u.verification = value as VerificationType;
        updated = u;
      }
    }
    if (!updated) return res.status(404).json({ error: 'User not found' });

    // The badge must appear on their live session immediately.
    invalidateResolveCache(id);

    persistAuditLog({
      actorId: actor.id,
      actorName: actor.name,
      actorEmail: actor.email,
      action: 'USER_VERIFICATION_CHANGED',
      category: 'ADMIN',
      target: `${updated.id} (${updated.email}) -> ${value || 'none'}`,
      source: detectSource(req),
      status: 'SUCCESS',
      ipAddress: req.ip || 'unknown',
      metadata: { verification: value || 'none' },
    });

    res.json({ success: true, user: updated });
  }));

  // Admin: developer invite links — generate a URL for someone who does not
  // have an account yet; registering through it grants the configured role
  // and badge. Links expire after 7 days and are revocable at any time.
  app.post('/api/v1/admin/invites', async (req, res) => {
    const actor = requireAdmin(req, res);
    if (!actor) return;

    const role = sanitizeText(req.body?.role || 'ADMIN', 8).toUpperCase();
    const verification = sanitizeText(req.body?.verification ?? '', 16);
    const note = sanitizeText(req.body?.note || '', 200);
    const maxUsesRaw = Number(req.body?.maxUses ?? 1);
    if (!['USER', 'ADMIN'].includes(role)) {
      return res.status(400).json({ error: 'role must be USER or ADMIN' });
    }
    if (!['', 'USER', 'DEVELOPER', 'ADMIN'].includes(verification)) {
      return res.status(400).json({ error: 'verification must be USER, DEVELOPER or ADMIN (or empty)' });
    }
    const maxUses = Number.isInteger(maxUsesRaw) && maxUsesRaw >= 1 && maxUsesRaw <= 20 ? maxUsesRaw : 1;

    try {
      const invite = await createInvite({
        createdBy: actor.id,
        createdByName: actor.name,
        role: role as 'USER' | 'ADMIN',
        verification,
        note,
        maxUses,
      });
      persistAuditLog({
        actorId: actor.id,
        actorName: actor.name,
        actorEmail: actor.email,
        action: 'INVITE_CREATED',
        category: 'ADMIN',
        target: `${invite.id} -> ${role}${verification ? ` +${verification}` : ''}`,
        source: detectSource(req),
        status: 'SUCCESS',
        ipAddress: req.ip || 'unknown',
        metadata: { role, verification, maxUses },
      });
      res.status(201).json({ invite });
    } catch (err) {
      console.error('[invites] create failed:', (err as Error).message);
      res.status(500).json({ error: 'Failed to create invite' });
    }
  });

  app.get('/api/v1/admin/invites', async (req, res) => {
    if (!requireAdmin(req, res)) return;
    res.json({ invites: await listInvites() });
  });

  app.delete('/api/v1/admin/invites/:id', async (req, res) => {
    const actor = requireAdmin(req, res);
    if (!actor) return;
    const id = sanitizeText(req.params.id, 64);
    try {
      const invite = await revokeInvite(id);
      if (!invite) return res.status(404).json({ error: 'Invite not found' });
      persistAuditLog({
        actorId: actor.id,
        actorName: actor.name,
        actorEmail: actor.email,
        action: 'INVITE_REVOKED',
        category: 'ADMIN',
        target: invite.id,
        source: detectSource(req),
        status: 'SUCCESS',
        ipAddress: req.ip || 'unknown',
        metadata: { role: invite.role },
      });
      res.json({ success: true, invite });
    } catch (err) {
      console.error('[invites] revoke failed:', (err as Error).message);
      res.status(500).json({ error: 'Failed to revoke invite' });
    }
  });

  // Public invite preview — what this link grants. Only display-safe fields:
  // no emails, no user ids, no token of anything else. Per-IP bucket: the
  // path contains the token, so a path-keyed limiter would be worthless here.
  app.get('/api/v1/invites/:token', invitePreviewLimiter, async (req, res) => {
    const token = sanitizeText(req.params.token, 128);
    const invalid = (reason: string) => res.json({ valid: false, reason });
    const invite = token ? await findInviteByToken(token) : null;
    if (!invite) return invalid('not_found');
    if (invite.revoked) return invalid('revoked');
    if (invite.uses >= invite.maxUses) return invalid('used');
    if (Date.parse(invite.expiresAt) <= Date.now()) return invalid('expired');
    res.json({
      valid: true,
      role: invite.role,
      verification: invite.verification,
      creatorName: invite.createdByName,
      note: invite.note,
      expiresAt: invite.expiresAt,
    });
  });

  // Public profile by @username — deliberately minimal for sharing: no email,
  // no internal ids, nothing the visitor could not already see on a profile.
  // Per-IP bucket: username sits in the path, so bucketing per path would let
  // username-spraying run unlimited.
  app.get('/api/v1/profiles/:username', publicProfileLimiter, async (req, res) => {
    const username = sanitizeText(req.params.username, 40).trim().toLowerCase();
    try {
      const profile = await findPublicProfile(username);
      if (!profile) return res.status(404).json({ error: 'Profile not found' });
      // Real public activity alongside the identity: comment total + newest few.
      const activity = await publicCommentActivity(username);
      res.json({ profile: { ...profile, ...activity } });
    } catch (err) {
      console.error('[profiles]', (err as Error).message);
      res.status(500).json({ error: 'Profile lookup failed' });
    }
  });

  // ----------------------------------------------------
  // ACCOUNT SEARCH + DIRECT MESSAGING — real, DB-backed, written
  // by registered accounts only. Every route requires a real
  // session; a message is only ever readable by its two
  // participants. No fake directory entries, no seeded
  // conversations, ever — a fresh install starts empty.
  // ----------------------------------------------------
  app.get('/api/v1/members/accounts', async (req, res) => {
    const actor = getActorUser(req);
    if (!actor) return res.status(401).json({ error: 'Authentication required' });
    const query = sanitizeText(req.query.q, 80).trim();
    if (query.length < 2) return res.json({ accounts: [] });
    try {
      if (databasePool) {
        await ensureSchema();
        const result = await databasePool.query(
          `select username, name, avatar_url, verification, status_line
             from public.users
            where username <> '' and id <> $1
              and (username ilike $2 escape '\\' or name ilike $2 escape '\\')
            order by case when lower(username) = lower($3) then 0 else 1 end, lower(username)
            limit 20`,
          [actor.id, `%${query.replace(/[\\%_]/g, '\\$&')}%`, query],
        );
        return res.json({ accounts: result.rows.map((row) => ({
          username: row.username, name: row.name, avatarUrl: row.avatar_url || '/images/avatar-default.svg',
          verification: row.verification || '', statusLine: row.status_line || undefined,
        })) });
      }
      res.json({ accounts: searchAccountsMemory(actor.id, query) });
    } catch (err) {
      console.error('[social/accounts]', (err as Error).message);
      res.status(500).json({ error: 'Account search failed' });
    }
  });

  app.get('/api/v1/members/conversations', async (req, res) => {
    const actor = getActorUser(req);
    if (!actor) return res.status(401).json({ error: 'Authentication required' });
    try {
      if (databasePool) {
        await ensureSchema();
        const result = await databasePool.query(
          `with latest as (
             select distinct on (peer_id) peer_id, content, created_at,
               (select count(*)::int from public.direct_messages unread
                 where unread.sender_id = dm.peer_id and unread.recipient_id = $1 and unread.read_at is null) as unread_count
             from (
               select *, case when sender_id = $1 then recipient_id else sender_id end as peer_id
               from public.direct_messages where sender_id = $1 or recipient_id = $1
             ) dm order by peer_id, created_at desc
           )
           select u.username, u.name, u.avatar_url, u.verification, u.status_line,
                  latest.content, latest.created_at, latest.unread_count
             from latest join public.users u on u.id = latest.peer_id
            where u.username <> '' order by latest.created_at desc limit 100`, [actor.id],
        );
        return res.json({ conversations: result.rows.map((row) => ({
          username: row.username, name: row.name, avatarUrl: row.avatar_url || '/images/avatar-default.svg',
          verification: row.verification || '', statusLine: row.status_line || undefined,
          lastMessage: row.content, lastMessageAt: row.created_at, unreadCount: row.unread_count,
        })) });
      }
      res.json({ conversations: listConversationsMemory(actor.id) });
    } catch (err) {
      console.error('[social/conversations]', (err as Error).message);
      res.status(500).json({ error: 'Could not load conversations' });
    }
  });

  app.get('/api/v1/members/conversations/:username', async (req, res) => {
    const actor = getActorUser(req);
    if (!actor) return res.status(401).json({ error: 'Authentication required' });
    const username = sanitizeText(req.params.username, 24).trim().toLowerCase();
    try {
      if (databasePool) {
        await ensureSchema();
        const peer = await databasePool.query('select id, username from public.users where lower(username) = $1 and username <> \'\'', [username]);
        if (!peer.rows[0]) return res.status(404).json({ error: 'Account not found' });
        const peerId = peer.rows[0].id;
        if (peerId === actor.id) return res.status(400).json({ error: 'You cannot message yourself' });
        await databasePool.query(
          `update public.direct_messages set read_at = now()
            where sender_id = $1 and recipient_id = $2 and read_at is null`, [peerId, actor.id],
        );
        const result = await databasePool.query(
          `select m.id, s.username as sender_username, r.username as recipient_username,
                  m.content, m.created_at, m.read_at
             from public.direct_messages m
             join public.users s on s.id = m.sender_id join public.users r on r.id = m.recipient_id
            where (m.sender_id = $1 and m.recipient_id = $2) or (m.sender_id = $2 and m.recipient_id = $1)
            order by m.created_at desc limit 100`, [actor.id, peerId],
        );
        return res.json({ messages: result.rows.reverse().map((row) => ({
          id: row.id, senderUsername: row.sender_username, recipientUsername: row.recipient_username,
          content: row.content, createdAt: row.created_at, readAt: row.read_at,
        })) });
      }
      const peer = findMemoryUserByUsername(username);
      if (!peer) return res.status(404).json({ error: 'Account not found' });
      if (peer.id === actor.id) return res.status(400).json({ error: 'You cannot message yourself' });
      // Opening the thread marks every peer→me message as read.
      const now = new Date().toISOString();
      for (const m of memoryMessages) {
        if (m.senderId === peer.id && m.recipientId === actor.id && m.readAt === null) m.readAt = now;
      }
      const usernameOf = (id: string) => db.users.find((u) => u.id === id)?.username || '';
      const messages: DirectMessage[] = memoryMessages
        .filter((m) =>
          (m.senderId === actor.id && m.recipientId === peer.id) ||
          (m.senderId === peer.id && m.recipientId === actor.id))
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
        .slice(0, 100)
        .reverse()
        .map((m) => ({
          id: m.id,
          senderUsername: usernameOf(m.senderId),
          recipientUsername: usernameOf(m.recipientId),
          content: m.content,
          createdAt: m.createdAt,
          readAt: m.readAt,
        }));
      res.json({ messages });
    } catch (err) {
      console.error('[social/conversation]', (err as Error).message);
      res.status(500).json({ error: 'Could not load messages' });
    }
  });

  app.post('/api/v1/members/messages', async (req, res) => {
    const actor = getActorUser(req);
    if (!actor) return res.status(401).json({ error: 'Authentication required' });
    const username = sanitizeText(req.body?.username, 24).trim().toLowerCase();
    const content = typeof req.body?.content === 'string' ? req.body.content.trim() : '';
    if (!/^[a-z0-9_]{3,24}$/.test(username)) return res.status(400).json({ error: 'Enter a valid account username' });
    if (!content || content.length > 4000) return res.status(400).json({ error: 'Message must be between 1 and 4000 characters' });
    try {
      if (databasePool) {
        await ensureSchema();
        const peer = await databasePool.query('select id, username from public.users where lower(username) = $1 and username <> \'\'', [username]);
        if (!peer.rows[0]) return res.status(404).json({ error: 'Account not found' });
        if (peer.rows[0].id === actor.id) return res.status(400).json({ error: 'You cannot message yourself' });
        const inserted = await databasePool.query(
          `insert into public.direct_messages (id, sender_id, recipient_id, content)
           values ($1, $2, $3, $4) returning id, content, created_at, read_at`,
          [secureId('msg'), actor.id, peer.rows[0].id, content],
        );
        const row = inserted.rows[0];
        return res.status(201).json({ message: {
          id: row.id, senderUsername: actor.username, recipientUsername: peer.rows[0].username,
          content: row.content, createdAt: row.created_at, readAt: row.read_at,
        } });
      }
      const peer = findMemoryUserByUsername(username);
      if (!peer) return res.status(404).json({ error: 'Account not found' });
      if (peer.id === actor.id) return res.status(400).json({ error: 'You cannot message yourself' });
      const message: MemoryDirectMessage = {
        id: secureId('msg'),
        senderId: actor.id,
        recipientId: peer.id,
        content,
        createdAt: new Date().toISOString(),
        readAt: null,
      };
      memoryMessages.push(message);
      retainMemoryMessages(actor.id);
      res.status(201).json({ message: {
        id: message.id, senderUsername: actor.username, recipientUsername: peer.username,
        content: message.content, createdAt: message.createdAt, readAt: message.readAt,
      } });
    } catch (err) {
      console.error('[social/message]', (err as Error).message);
      res.status(500).json({ error: 'Message could not be saved' });
    }
  });

  // ----------------------------------------------------
  // GITHUB PUBLISHING + SANDBOX — import the user's own
  // GitHub repositories (only after their real OAuth
  // consent, token stored encrypted server-side) and
  // publish individual code files. Every route needs a
  // real session; when the account has 2FA enabled, the
  // login itself already demanded the authenticator
  // code. No fake projects, no seeded gallery.
  // ----------------------------------------------------

  /** Map GitHub API sentinel errors to precise HTTP statuses. */
  function githubError(res: Response, err: unknown): void {
    const msg = (err as Error).message || '';
    if (msg === GITHUB_ERRORS.TOKEN_EXPIRED) {
      res.status(401).json({ error: 'GitHub access expired — reconnect your account', code: 'token_expired' });
    } else if (msg === GITHUB_ERRORS.RATE_LIMITED) {
      res.status(429).json({ error: 'GitHub API rate limit reached — retry later', code: 'rate_limited' });
    } else if (msg === GITHUB_ERRORS.NOT_FOUND) {
      res.status(404).json({ error: 'Repository not found or not accessible with your grant', code: 'not_found' });
    } else {
      console.error('[github]', msg);
      res.status(502).json({ error: 'GitHub API request failed' });
    }
  }

  /** Render user HTML inside a sandboxed iframe: opaque origin,
   *  no same-origin access to this platform, no forms, no
   *  popups, no top-level navigation. The srcdoc attribute
   *  value is escaped so the wrapper page itself stays inert.
   *
   *  The wrapper doubles as a CONSOLE:
   *    - a bridge script (/embed/sandbox-bridge.js) is injected
   *      into the previewed document so console output, crashes
   *      and page events stream up to the wrapper;
   *    - the SANDBOX TERMINAL at the bottom evaluates JavaScript
   *      against the running page (plus refresh / phone-width
   *      controls) — everything a developer needs to poke at the
   *      preview without leaving the sandbox.
   *  Both wrapper scripts are EXTERNAL files: this platform serves
   *  a strict CSP (script-src 'self'), which blocks inline script. */
  function serveSandboxPreview(res: Response, title: string, rawHtml: string): void {
    const esc = (s: string) =>
      s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

    // Inject the bridge ABOVE the page's own code so it wraps console
    // before anything runs: top of <head> → after <body>/<html>/doctype
    // → before </head> → prepended (bare fragments).
    const BRIDGE_TAG = '<script src="/embed/sandbox-bridge.js"></script>';
    const injectBridge = (source: string): string => {
      const head = /<head[^>]*>/i.exec(source);
      if (head) {
        const at = head.index + head[0].length;
        return source.slice(0, at) + BRIDGE_TAG + source.slice(at);
      }
      for (const re of [/<body[^>]*>/i, /<html[^>]*>/i, /<!doctype[^>]*>/i]) {
        const m = re.exec(source);
        if (m) {
          const at = m.index + m[0].length;
          return source.slice(0, at) + BRIDGE_TAG + source.slice(at);
        }
      }
      const closeHead = /<\/head\s*>/i.exec(source);
      if (closeHead) return source.slice(0, closeHead.index) + BRIDGE_TAG + source.slice(closeHead.index);
      return BRIDGE_TAG + source;
    };

    // srcdoc needs & and " escaped (attribute context); the
    // browser then parses the decoded value as the frame document.
    const srcdoc = injectBridge(rawHtml).replace(/&/g, '&amp;').replace(/"/g, '&quot;');

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.send(`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} — Sandbox Preview</title>
<style>
*{box-sizing:border-box}
html,body{margin:0;height:100%;background:#0b1120;font:12px/1.4 system-ui,-apple-system,sans-serif;color:#94a3b8}
body{display:flex;flex-direction:column;overflow:hidden}
.bar{display:flex;align-items:center;gap:.5rem;padding:.45rem .7rem;background:#0d1526;border-bottom:1px solid #1e293b;flex:none}
.dot{width:8px;height:8px;border-radius:50%;background:#f59e0b;box-shadow:0 0 8px rgba(245,158,11,.55);flex:none}
.label{color:#cbd5e1;font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:42vw}
.label strong{color:#fbbf24;letter-spacing:.09em;font-size:10px}
.badges{display:flex;gap:.35rem}
.badge{font:600 10px/1 ui-monospace,SFMono-Regular,Menlo,monospace;padding:3px 6px;border-radius:6px;background:#1e293b;color:#94a3b8}
.badge[hidden]{display:none}
.badge.err{background:#881337;color:#fda4af}
.grow{flex:1}
.bar button{font:600 11px system-ui,sans-serif;color:#94a3b8;background:#111c33;border:1px solid #24334d;border-radius:8px;padding:.35rem .6rem;cursor:pointer}
.bar button:hover{color:#e2e8f0;border-color:#3b5478}
.bar button.on{background:#0e3a52;border-color:#22d3ee;color:#67e8f9}
.stage{position:relative;flex:1;min-height:0;display:flex;justify-content:center}
.stage iframe{flex:1;width:100%;height:100%;border:0;display:block;background:#fff}
body.phone .stage iframe{max-width:390px;box-shadow:0 0 0 1px #1e293b,0 18px 60px -24px #000}
.loader{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font:600 11px ui-monospace,monospace;letter-spacing:.16em;color:#38bdf8;background:#0b1120;z-index:2}
.loader[hidden]{display:none}
.term{flex:none;height:38vh;min-height:170px;display:flex;flex-direction:column;background:#070d1a;border-top:1px solid #1e293b}
.term[hidden]{display:none}
.term-head{display:flex;align-items:center;gap:.6rem;padding:.4rem .7rem;border-bottom:1px solid #16203a}
.term-title{font:700 10px ui-monospace,monospace;letter-spacing:.16em;color:#34d399;flex:none}
.term-hint{flex:1;font-size:10px;color:#64748b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.term-hint code{color:#94a3b8;background:#111c33;border-radius:4px;padding:1px 4px}
.term-head button{font:600 10px system-ui;color:#94a3b8;background:#111c33;border:1px solid #24334d;border-radius:6px;padding:.25rem .55rem;cursor:pointer}
.term-head button:hover{color:#e2e8f0;border-color:#3b5478}
.term-out{flex:1;overflow-y:auto;padding:.5rem .7rem;font:11px/1.55 ui-monospace,SFMono-Regular,Menlo,monospace;white-space:pre-wrap;word-break:break-word}
.term-out .t{color:#334155;margin-right:.5rem}
.term-out .l{color:#cbd5e1}
.term-out .l-warn{color:#fbbf24}
.term-out .l-error{color:#fb7185}
.term-out .l-sys{color:#38bdf8}
.term-out .l-cmd{color:#a78bfa}
.term-out .l-result{color:#34d399}
.term-cmd{display:flex;align-items:center;gap:.5rem;padding:.45rem .7rem;border-top:1px solid #16203a;background:#0a1222}
.term-cmd .ps{font:700 11px ui-monospace,monospace;color:#22d3ee;flex:none}
.term-cmd input{flex:1;background:transparent;border:0;outline:none;color:#e2e8f0;font:12px ui-monospace,SFMono-Regular,Menlo,monospace}
</style>
</head>
<body>
<header class="bar">
  <span class="dot"></span>
  <span class="label"><strong>SANDBOXED</strong>&nbsp; ${esc(title)}</span>
  <span class="badges">
    <span id="badge-err" class="badge err" hidden>0</span>
    <span id="badge-log" class="badge" hidden>0</span>
  </span>
  <span class="grow"></span>
  <button id="btn-width" type="button" title="Phone-width viewport">Phone</button>
  <button id="btn-refresh" type="button" title="Reload the sandboxed page">Refresh</button>
  <button id="btn-console" type="button" title="Open the sandbox terminal">Terminal</button>
  <button id="btn-back" type="button" title="Back to the dashboard">Back</button>
</header>
<main class="stage" id="stage">
  <div class="loader" id="loader">LOADING SANDBOX…</div>
  <iframe id="frame" title="sandbox" sandbox="allow-scripts" referrerpolicy="no-referrer" srcdoc="${srcdoc}"></iframe>
</main>
<section class="term" id="term" hidden aria-label="Sandbox terminal">
  <div class="term-head">
    <span class="term-title">SANDBOX TERMINAL</span>
    <span class="term-hint">JS runs against the previewed page — try <code>help</code> or <code>document.title</code></span>
    <button id="term-clear" type="button">Clear</button>
    <button id="term-close" type="button" aria-label="Close terminal">✕</button>
  </div>
  <div class="term-out" id="term-out" role="log" aria-live="polite"></div>
  <form class="term-cmd" id="term-form" autocomplete="off">
    <span class="ps">vnt ▸</span>
    <input id="term-input" type="text" placeholder="eval code inside the sandbox…" spellcheck="false" aria-label="Terminal input">
  </form>
</section>
<script src="/embed/sandbox-console.js"></script>
</body>
</html>`);
  }

  // Is this account connected to GitHub? (never returns the token)
  app.get('/api/v1/github/status', async (req, res) => {
    const actor = getActorUser(req);
    if (!actor) return res.status(401).json({ error: 'Authentication required' });
    try {
      const token = await getGitHubToken(actor.id);
      res.json({ connected: !!token, provider: 'github' });
    } catch (err) {
      console.error('[github/status]', (err as Error).message);
      res.status(500).json({ error: 'Could not read connection state' });
    }
  });

  // The signed-in user's own repositories — fetched with THEIR
  // token, straight from the GitHub API.
  app.get('/api/v1/github/repos', async (req, res) => {
    const actor = getActorUser(req);
    if (!actor) return res.status(401).json({ error: 'Authentication required' });
    try {
      const token = await getGitHubToken(actor.id);
      if (!token) return res.status(409).json({ error: 'Connect your GitHub account first', code: 'not_connected' });
      const repos = await listUserRepos(token);
      res.json({ repos });
    } catch (err) {
      githubError(res, err);
    }
  });

  // Import one GitHub repository as a published project.
  app.post('/api/v1/github/import', async (req, res) => {
    const actor = getActorUser(req);
    if (!actor) return res.status(401).json({ error: 'Authentication required' });
    const fullName = sanitizeText(req.body?.repo, 200).trim();
    if (!/^[\w.-]+\/[\w.-]+$/.test(fullName)) {
      return res.status(400).json({ error: 'Enter a repository as owner/name' });
    }
    const [owner, repo] = fullName.split('/');
    try {
      const token = await getGitHubToken(actor.id);
      if (!token) return res.status(409).json({ error: 'Connect your GitHub account first', code: 'not_connected' });
      const imported = await importRepoFiles(token, owner, repo);
      if (imported.files.length === 0) {
        return res.status(422).json({ error: 'No readable text files found in that repository' });
      }
      const row = await createProject({
        ownerId: actor.id,
        source: 'github',
        title: imported.title,
        description: imported.description.slice(0, MAX_DESCRIPTION),
        repoUrl: imported.repoUrl,
        language: imported.language,
        isWeb: imported.isWeb,
        files: imported.files,
      });
      persistAuditLog({
        actorId: actor.id,
        actorName: actor.name,
        actorEmail: actor.email,
        action: 'PROJECT_IMPORTED',
        category: 'API',
        target: `${imported.title} from ${fullName}`,
        source: detectSource(req),
        status: 'SUCCESS',
        ipAddress: req.ip || 'unknown',
        metadata: { files: imported.files.length, repoUrl: imported.repoUrl },
      });
      res.status(201).json({ project: await projectDetail(row) });
    } catch (err) {
      githubError(res, err);
    }
  });

  // My published projects.
  app.get('/api/v1/publish/projects', async (req, res) => {
    const actor = getActorUser(req);
    if (!actor) return res.status(401).json({ error: 'Authentication required' });
    try {
      res.json({ projects: await listProjects(actor.id) });
    } catch (err) {
      console.error('[publish/projects]', (err as Error).message);
      res.status(500).json({ error: 'Could not load your projects' });
    }
  });

  // Public gallery — every real published project, newest first.
  app.get('/api/v1/publish/projects/public', async (_req, res) => {
    try {
      res.json({ projects: await listPublicProjects() });
    } catch (err) {
      console.error('[publish/gallery]', (err as Error).message);
      res.status(500).json({ error: 'Could not load the gallery' });
    }
  });

  // One project with its full file list (published = readable by anyone).
  app.get('/api/v1/publish/projects/:id', async (req, res) => {
    const id = sanitizeText(req.params.id, 64);
    try {
      const row = await getProject(id);
      if (!row) return res.status(404).json({ error: 'Project not found' });
      res.json({ project: await projectDetail(row) });
    } catch (err) {
      console.error('[publish/project]', (err as Error).message);
      res.status(500).json({ error: 'Could not load the project' });
    }
  });

  // Delete — owner or admin only.
  app.delete('/api/v1/publish/projects/:id', async (req, res) => {
    const actor = getActorUser(req);
    if (!actor) return res.status(401).json({ error: 'Authentication required' });
    const id = sanitizeText(req.params.id, 64);
    try {
      const outcome = await deleteProject(id, { id: actor.id, role: actor.role });
      if (outcome === 'deleted') return res.json({ success: true });
      if (outcome === 'forbidden') return res.status(403).json({ error: 'You can only delete your own projects' });
      res.status(404).json({ error: 'Project not found' });
    } catch (err) {
      console.error('[publish/project/delete]', (err as Error).message);
      res.status(500).json({ error: 'Could not delete the project' });
    }
  });

  // Sandbox preview of a project's index.html.
  app.get('/api/v1/publish/projects/:id/preview', async (req, res) => {
    const id = sanitizeText(req.params.id, 64);
    try {
      const row = await getProject(id);
      if (!row) return res.status(404).send('Project not found');
      const index = row.files.find((f) => /^(?:[^/]+\/)?index\.html$/.test(f.path));
      if (!index) return res.status(404).send('This project has no index.html to preview');
      serveSandboxPreview(res, row.title, index.content);
    } catch (err) {
      console.error('[publish/project/preview]', (err as Error).message);
      res.status(500).send('Preview unavailable');
    }
  });

  // Publish an individual code file.
  app.post('/api/v1/publish/snippets', async (req, res) => {
    const actor = getActorUser(req);
    if (!actor) return res.status(401).json({ error: 'Authentication required' });
    const title = sanitizeText(req.body?.title, MAX_TITLE).trim();
    const language = sanitizeText(req.body?.language, 40).trim().toLowerCase() || 'text';
    const content = typeof req.body?.content === 'string' ? req.body.content : '';
    if (!title) return res.status(400).json({ error: 'A title is required' });
    if (!content || content.length > MAX_SNIPPET) {
      return res.status(400).json({ error: `Code must be between 1 and ${MAX_SNIPPET} characters` });
    }
    try {
      const row = await createSnippet({ ownerId: actor.id, title, language, content });
      persistAuditLog({
        actorId: actor.id,
        actorName: actor.name,
        actorEmail: actor.email,
        action: 'SNIPPET_PUBLISHED',
        category: 'API',
        target: `${title} (${language})`,
        source: detectSource(req),
        status: 'SUCCESS',
        ipAddress: req.ip || 'unknown',
        metadata: { language, bytes: Buffer.byteLength(content) },
      });
      res.status(201).json({ snippet: await snippetDetail(row) });
    } catch (err) {
      console.error('[publish/snippet]', (err as Error).message);
      res.status(500).json({ error: 'Could not publish the code' });
    }
  });

  // My published snippets.
  app.get('/api/v1/publish/snippets', async (req, res) => {
    const actor = getActorUser(req);
    if (!actor) return res.status(401).json({ error: 'Authentication required' });
    try {
      res.json({ snippets: await listSnippets(actor.id) });
    } catch (err) {
      console.error('[publish/snippets]', (err as Error).message);
      res.status(500).json({ error: 'Could not load your snippets' });
    }
  });

  // Public snippet gallery.
  app.get('/api/v1/publish/snippets/public', async (_req, res) => {
    try {
      res.json({ snippets: await listPublicSnippets() });
    } catch (err) {
      console.error('[publish/snippets/public]', (err as Error).message);
      res.status(500).json({ error: 'Could not load the snippet gallery' });
    }
  });

  // One snippet (published = readable by anyone).
  app.get('/api/v1/publish/snippets/:id', async (req, res) => {
    const id = sanitizeText(req.params.id, 64);
    try {
      const row = await getSnippet(id);
      if (!row) return res.status(404).json({ error: 'Snippet not found' });
      res.json({ snippet: await snippetDetail(row) });
    } catch (err) {
      console.error('[publish/snippet]', (err as Error).message);
      res.status(500).json({ error: 'Could not load the snippet' });
    }
  });

  // Delete — owner or admin only.
  app.delete('/api/v1/publish/snippets/:id', async (req, res) => {
    const actor = getActorUser(req);
    if (!actor) return res.status(401).json({ error: 'Authentication required' });
    const id = sanitizeText(req.params.id, 64);
    try {
      const outcome = await deleteSnippet(id, { id: actor.id, role: actor.role });
      if (outcome === 'deleted') return res.json({ success: true });
      if (outcome === 'forbidden') return res.status(403).json({ error: 'You can only delete your own snippets' });
      res.status(404).json({ error: 'Snippet not found' });
    } catch (err) {
      console.error('[publish/snippet/delete]', (err as Error).message);
      res.status(500).json({ error: 'Could not delete the snippet' });
    }
  });

  // Sandbox preview — HTML snippets only.
  app.get('/api/v1/publish/snippets/:id/preview', async (req, res) => {
    const id = sanitizeText(req.params.id, 64);
    try {
      const row = await getSnippet(id);
      if (!row) return res.status(404).send('Snippet not found');
      if (row.language.toLowerCase() !== 'html') {
        return res.status(404).send('Only HTML snippets have a sandbox preview');
      }
      serveSandboxPreview(res, row.title, row.content);
    } catch (err) {
      console.error('[publish/snippet/preview]', (err as Error).message);
      res.status(500).send('Preview unavailable');
    }
  });

  // ---------------------------------------------------------------------------
  // OAUTH PROVIDER — Vanitas doubles as an OAuth 2.0 authorization
  // server. A user registers a third-party application in the
  // dashboard (OAuth Apps), and that app sends its users through
  // the standard authorization-code flow (PKCE supported) to
  // sign in with their Vanitas account.
  //
  // Browser flow: the app points its users at the SPA page
  // /oauth/consent (so the request carries the caller's real
  // session). That page validates the request server-side, shows
  // the consent screen, and only then is a single-use code
  // issued. The token endpoint is pure machine-to-machine API.
  //
  // Paths live under /api/v1/oauth/ — Vercel's edge hijacks bare
  // "/oauth/<seg>" GETs to index.html before the lambda runs
  // (observed in production, see src/server/oauth.ts).
  // ---------------------------------------------------------------------------

  // Consent ticket: binds a validated authorize request to the
  // signed-in user so the decision POST cannot be tampered with.
  // HMAC-SHA256, domain-separated key, 10-minute TTL.
  const oauthProviderKey = crypto
    .createHash('sha256')
    .update(
      process.env.DATABASE_URL ||
        process.env.ADMIN_API_TOKEN ||
        `local-${crypto.randomBytes(32).toString('hex')}`,
    )
    .digest();

  interface ConsentTicket {
    appId: string;
    clientId: string;
    redirectUri: string;
    scopes: string[];
    state: string;
    codeChallenge: string | null;
    codeChallengeMethod: 'plain' | 's256';
    userId: string;
    exp: number;
  }

  function makeConsentTicket(t: Omit<ConsentTicket, 'exp'>): string {
    const payload = Buffer.from(
      JSON.stringify({ ...t, exp: Date.now() + AUTH_CODE_TTL_MS }),
    ).toString('base64url');
    const sig = crypto.createHmac('sha256', oauthProviderKey).update(payload).digest('base64url');
    return `${payload}.${sig}`;
  }

  function readConsentTicket(ticket: string): ConsentTicket | null {
    if (typeof ticket !== 'string' || ticket.length > 4096) return null;
    const [p64, sig] = ticket.split('.');
    if (!p64 || !sig) return null;
    const expected = crypto.createHmac('sha256', oauthProviderKey).update(p64).digest('base64url');
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || a.length === 0 || !crypto.timingSafeEqual(a, b)) return null;
    let parsed: any;
    try {
      parsed = JSON.parse(Buffer.from(p64, 'base64url').toString('utf8'));
    } catch {
      return null;
    }
    if (!parsed || typeof parsed !== 'object') return null;
    if (!Number.isFinite(parsed.exp) || parsed.exp <= Date.now()) return null;
    if (typeof parsed.appId !== 'string' || typeof parsed.clientId !== 'string') return null;
    if (typeof parsed.redirectUri !== 'string' || typeof parsed.userId !== 'string') return null;
    if (!Array.isArray(parsed.scopes) || !parsed.scopes.every((s: unknown) => typeof s === 'string')) {
      return null;
    }
    if (parsed.codeChallenge != null && typeof parsed.codeChallenge !== 'string') return null;
    if (parsed.codeChallengeMethod !== 'plain' && parsed.codeChallengeMethod !== 's256') return null;
    return parsed as ConsentTicket;
  }

  // Validate every part of an authorize request (RFC 6749 §4.1.1):
  // response type, known client, EXACT redirect-uri match, scopes
  // the app was actually granted, and well-formed PKCE params.
  async function validateAuthorizeRequest(query: any): Promise<
    | {
        ok: true;
        app: OAuthApp;
        redirectUri: string;
        scopes: string[];
        state: string;
        codeChallenge: string | null;
        codeChallengeMethod: 'plain' | 's256';
      }
    | { ok: false; error: string }
  > {
    const clientId = sanitizeText(query?.client_id, 128);
    const redirectUri = sanitizeText(query?.redirect_uri, 2048);
    const responseType = sanitizeText(query?.response_type, 32);
    const state = typeof query?.state === 'string' ? query.state.slice(0, 512) : '';
    const scopeParam = sanitizeText(query?.scope, 200);
    const challenge = typeof query?.code_challenge === 'string' ? query.code_challenge.slice(0, 256) : '';
    const methodRaw = sanitizeText(query?.code_challenge_method, 16);

    if (responseType !== 'code') return { ok: false, error: 'response_type must be "code"' };
    if (!clientId) return { ok: false, error: 'client_id is required' };
    if (!redirectUri) return { ok: false, error: 'redirect_uri is required' };

    const app = await lookupOAuthApp(clientId);
    if (!app) return { ok: false, error: 'Unknown client_id' };
    if (!app.redirectUris.includes(redirectUri)) {
      return { ok: false, error: 'redirect_uri does not match any URI registered for this app' };
    }

    const requested = scopeParam ? scopeParam.split(/\s+/).filter(Boolean) : app.scopes;
    if (requested.length === 0 || requested.length > 10) {
      return { ok: false, error: 'Invalid scope list' };
    }
    for (const s of requested) {
      if (!isKnownOAuthScope(s)) return { ok: false, error: `Unknown scope "${s}"` };
      if (!app.scopes.includes(s)) {
        return { ok: false, error: `Scope "${s}" was not granted to this app` };
      }
    }

    // PKCE (RFC 7636): challenge and method must come together.
    if (methodRaw && methodRaw !== 'plain' && methodRaw !== 's256') {
      return { ok: false, error: 'code_challenge_method must be "plain" or "s256"' };
    }
    if (methodRaw && !challenge) {
      return { ok: false, error: 'code_challenge is required when code_challenge_method is set' };
    }
    if (!methodRaw && challenge) {
      return { ok: false, error: 'code_challenge_method is required when code_challenge is set' };
    }
    // A public client holds no secret — possession of the PKCE verifier
    // is the ONLY thing standing between an intercepted code and an
    // attacker, so the flow may not start without a challenge.
    if (app.isPublic && !challenge) {
      return { ok: false, error: 'PKCE (code_challenge) is required for public clients' };
    }

    return {
      ok: true,
      app,
      redirectUri,
      scopes: requested,
      state,
      codeChallenge: challenge || null,
      codeChallengeMethod: (methodRaw || 'plain') as 'plain' | 's256',
    };
  }

  function appendQuery(uri: string, params: Record<string, string>): string {
    const u = new URL(uri);
    for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
    return u.toString();
  }

  // ---- Developer API: register / list / revoke third-party apps ----
  app.get('/api/v1/oauth/apps', async (req, res) => {
    const actor = getActorUser(req);
    if (!actor) return res.status(401).json({ error: 'Authentication required' });
    try {
      res.json({ apps: await listOAuthApps(actor.id), availableScopes: ['profile', 'email'] });
    } catch (err) {
      console.error('[oauth/apps]', (err as Error).message);
      res.status(500).json({ error: 'Could not load your apps' });
    }
  });

  app.post('/api/v1/oauth/apps', async (req, res) => {
    const actor = getActorUser(req);
    if (!actor) return res.status(401).json({ error: 'Authentication required' });
    const name = sanitizeText(req.body?.name, 80).trim();
    // App type: 'confidential' (server-side, holds a secret) or 'public'
    // (SPA/mobile — ships in the open, so no secret is ever minted and
    // the authorize request MUST carry PKCE).
    const typeRaw = sanitizeText(req.body?.type, 16);
    if (typeRaw && typeRaw !== 'confidential' && typeRaw !== 'public') {
      return res.status(400).json({ error: 'type must be "confidential" or "public"' });
    }
    const isPublic = typeRaw === 'public';
    const redirectUris = (Array.isArray(req.body?.redirectUris) ? req.body.redirectUris : [])
      .map((u: unknown) => sanitizeText(u, 2048).trim())
      .filter(Boolean);
    const scopes = (Array.isArray(req.body?.scopes) ? req.body.scopes : ['profile'])
      .map((s: unknown) => sanitizeText(s, 32))
      .filter(Boolean);

    if (name.length < 3) return res.status(400).json({ error: 'App name must be at least 3 characters' });
    if (redirectUris.length === 0 || redirectUris.length > 20) {
      return res.status(400).json({ error: 'Register between 1 and 20 redirect URIs' });
    }
    for (const u of redirectUris) {
      if (!isValidRedirectUri(u)) {
        return res.status(400).json({ error: `Invalid redirect URI: ${u.slice(0, 80)} — https required (loopback http allowed)` });
      }
    }
    if (scopes.length === 0 || scopes.length > 5) {
      return res.status(400).json({ error: 'Pick between 1 and 5 scopes' });
    }
    for (const s of scopes) {
      if (!isKnownOAuthScope(s)) return res.status(400).json({ error: `Unknown scope "${s}"` });
    }

    try {
      const { app, clientSecret } = await createOAuthApp({ ownerId: actor.id, name, redirectUris, scopes, isPublic });
      persistAuditLog({
        actorId: actor.id,
        actorName: actor.name,
        actorEmail: actor.email,
        action: 'OAUTH_APP_CREATED',
        category: 'SECURITY',
        target: `${name} (${app.clientId})`,
        source: detectSource(req),
        status: 'SUCCESS',
        ipAddress: req.ip || 'unknown',
        metadata: { redirectUris, scopes, type: isPublic ? 'public' : 'confidential' },
      });
      res.status(201).json({
        app,
        clientSecret,
        revealNote: clientSecret
          ? 'The client secret is shown exactly once — store it in a secure vault.'
          : 'Public client: no secret exists. PKCE (code_challenge) is mandatory on every authorize request.',
      });
    } catch (err) {
      console.error('[oauth/apps/create]', (err as Error).message);
      res.status(500).json({ error: 'Could not register the app' });
    }
  });

  app.delete('/api/v1/oauth/apps/:id', async (req, res) => {
    const actor = getActorUser(req);
    if (!actor) return res.status(401).json({ error: 'Authentication required' });
    const id = sanitizeText(req.params.id, 64);
    try {
      // Resolve first so the audit trail names the app, not just its id.
      const owned = (await listOAuthApps(actor.id)).find((a) => a.id === id);
      if (!owned) return res.status(404).json({ error: 'App not found' });
      const deleted = await deleteOAuthApp(id, actor.id);
      if (!deleted) return res.status(404).json({ error: 'App not found' });
      persistAuditLog({
        actorId: actor.id,
        actorName: actor.name,
        actorEmail: actor.email,
        action: 'OAUTH_APP_REVOKED',
        category: 'SECURITY',
        target: `${owned.name} (${owned.clientId})`,
        source: detectSource(req),
        status: 'WARNING',
        ipAddress: req.ip || 'unknown',
        metadata: {},
      });
      res.json({ success: true });
    } catch (err) {
      console.error('[oauth/apps/delete]', (err as Error).message);
      res.status(500).json({ error: 'Could not delete the app' });
    }
  });

  // ---- User-facing grants: review & withdraw every authorized app ----
  // A user must always be able to see what they granted and take it back
  // without hunting for the third-party app that received it.
  app.get('/api/v1/oauth/grants', async (req, res) => {
    const actor = getActorUser(req);
    if (!actor) return res.status(401).json({ error: 'Authentication required' });
    try {
      res.json({ grants: await listUserGrants(actor.id) });
    } catch (err) {
      console.error('[oauth/grants]', (err as Error).message);
      res.status(500).json({ error: 'Could not load your authorized apps' });
    }
  });

  // Revoke every live token this user granted to one app.
  app.delete('/api/v1/oauth/grants/:appId', async (req, res) => {
    const actor = getActorUser(req);
    if (!actor) return res.status(401).json({ error: 'Authentication required' });
    const appId = sanitizeText(req.params.appId, 64);
    try {
      const revoked = await revokeUserGrants(actor.id, appId);
      if (revoked > 0) {
        persistAuditLog({
          actorId: actor.id,
          actorName: actor.name,
          actorEmail: actor.email,
          action: 'OAUTH_GRANT_REVOKED',
          category: 'AUTH',
          target: `OAuth App: ${appId}`,
          source: detectSource(req),
          status: 'WARNING',
          ipAddress: req.ip || 'unknown',
          metadata: { revoked },
        });
      }
      res.json({ success: true, revoked });
    } catch (err) {
      console.error('[oauth/grants/delete]', (err as Error).message);
      res.status(500).json({ error: 'Could not revoke the grant' });
    }
  });

  // Withdraw EVERY grant at once — the OAuth twin of "Sign Out of All".
  app.delete('/api/v1/oauth/grants', async (req, res) => {
    const actor = getActorUser(req);
    if (!actor) return res.status(401).json({ error: 'Authentication required' });
    try {
      const revoked = await revokeAllUserGrants(actor.id);
      persistAuditLog({
        actorId: actor.id,
        actorName: actor.name,
        actorEmail: actor.email,
        action: 'OAUTH_GRANTS_REVOKED_ALL',
        category: 'AUTH',
        target: 'All connected apps',
        source: detectSource(req),
        status: 'WARNING',
        ipAddress: req.ip || 'unknown',
        metadata: { revoked },
      });
      res.json({ success: true, revoked });
    } catch (err) {
      console.error('[oauth/grants/revoke-all]', (err as Error).message);
      res.status(500).json({ error: 'Could not revoke grants' });
    }
  });

  // ---- Authorization endpoint (session-authenticated) ----
  // The SPA consent page calls this with the user's own session
  // to validate the request and receive a signed consent ticket.
  app.get('/api/v1/oauth/authorize', async (req, res) => {
    const actor = getActorUser(req);
    if (!actor) return res.status(401).json({ error: 'Authentication required' });
    try {
      const outcome = await validateAuthorizeRequest(req.query);
      // (=== false, not !ok: without strictNullChecks the
      // negated discriminant does not narrow the union.)
      if (outcome.ok === false) return res.status(400).json({ error: outcome.error });
      const ticket = makeConsentTicket({
        appId: outcome.app.id,
        clientId: outcome.app.clientId,
        redirectUri: outcome.redirectUri,
        scopes: outcome.scopes,
        state: outcome.state,
        codeChallenge: outcome.codeChallenge,
        codeChallengeMethod: outcome.codeChallengeMethod,
        userId: actor.id,
      });
      res.json({
        ticket,
        app: { name: outcome.app.name, clientId: outcome.app.clientId, scopes: outcome.scopes },
        redirectUri: outcome.redirectUri,
        state: outcome.state,
      });
    } catch (err) {
      console.error('[oauth/authorize]', (err as Error).message);
      res.status(500).json({ error: 'Could not validate the authorize request' });
    }
  });

  // The user's decision. Only the session that validated the
  // request may answer its ticket — a CSRF'd or forged decision
  // cannot issue a code for someone else's consent.
  app.post('/api/v1/oauth/authorize/decision', async (req, res) => {
    const actor = getActorUser(req);
    if (!actor) return res.status(401).json({ error: 'Authentication required' });
    const ticket = readConsentTicket(sanitizeText(req.body?.ticket, 4096));
    const decision = sanitizeText(req.body?.decision, 16);
    if (!ticket) return res.status(400).json({ error: 'Consent request is invalid or expired' });
    if (ticket.userId !== actor.id) {
      return res.status(403).json({ error: 'The signed-in account does not match this consent request' });
    }
    if (decision !== 'allow' && decision !== 'deny') {
      return res.status(400).json({ error: 'Decision must be "allow" or "deny"' });
    }

    const log = (status: 'SUCCESS' | 'WARNING') =>
      persistAuditLog({
        actorId: actor.id,
        actorName: actor.name,
        actorEmail: actor.email,
        action: decision === 'allow' ? 'OAUTH_CONSENT_GRANTED' : 'OAUTH_CONSENT_DENIED',
        category: 'AUTH',
        target: `App ${ticket.clientId}`,
        source: detectSource(req),
        status,
        ipAddress: req.ip || 'unknown',
        metadata: { scopes: ticket.scopes },
      });

    if (decision === 'deny') {
      log('WARNING');
      return res.json({
        redirectUrl: appendQuery(ticket.redirectUri, {
          ...(ticket.state ? { state: ticket.state } : {}),
          error: 'access_denied',
        }),
      });
    }

    try {
      const code = await createAuthorizationCode({
        appId: ticket.appId,
        userId: ticket.userId,
        redirectUri: ticket.redirectUri,
        scopes: ticket.scopes,
        codeChallenge: ticket.codeChallenge,
        codeChallengeMethod: ticket.codeChallengeMethod,
      });
      log('SUCCESS');
      res.json({
        redirectUrl: appendQuery(ticket.redirectUri, {
          code,
          ...(ticket.state ? { state: ticket.state } : {}),
        }),
      });
    } catch (err) {
      console.error('[oauth/authorize/decision]', (err as Error).message);
      res.status(500).json({ error: 'Could not issue the authorization code' });
    }
  });

  // ---- Token endpoint (RFC 6749 §4.1.3) — machine-to-machine ----
  app.post('/api/v1/oauth/token', async (req, res) => {
    const grantType = sanitizeText(req.body?.grant_type, 64);
    if (grantType !== 'authorization_code') {
      return res.status(400).json({
        error: 'unsupported_grant_type',
        error_description: 'Only authorization_code is supported',
      });
    }
    const clientId = sanitizeText(req.body?.client_id, 128);
    const clientSecret = typeof req.body?.client_secret === 'string' ? req.body.client_secret : '';
    const rawCode = typeof req.body?.code === 'string' ? req.body.code : '';
    const redirectUri = sanitizeText(req.body?.redirect_uri, 2048);
    const verifier = typeof req.body?.code_verifier === 'string' ? req.body.code_verifier.slice(0, 256) : null;

    if (!clientId) return res.status(401).json({ error: 'invalid_client' });
    const app = await lookupOAuthApp(clientId);
    if (!app) return res.status(401).json({ error: 'invalid_client' });
    if (app.isPublic) {
      // Public client (SPA/mobile): no secret exists. Authentication is
      // client_id + the PKCE verifier — the code always carries a
      // challenge because authorize enforces it for public clients.
      // (A secret sent here is ignored; the app is public by design.)
    } else if (!clientSecret) {
      return res.status(401).json({ error: 'invalid_client' });
    } else if (!(await authenticateClient(clientId, clientSecret))) {
      return res.status(401).json({ error: 'invalid_client' });
    }
    if (!rawCode) {
      return res.status(400).json({ error: 'invalid_request', error_description: 'code is required' });
    }
    if (!redirectUri) {
      return res.status(400).json({ error: 'invalid_request', error_description: 'redirect_uri is required' });
    }

    // Atomic single-use consumption: two racing exchanges can
    // never both turn the same code into a token.
    const record = await consumeAuthorizationCode(rawCode);
    if (!record || record.appId !== app.id || record.redirectUri !== redirectUri) {
      return res.status(400).json({
        error: 'invalid_grant',
        error_description: 'The authorization code is invalid, expired or already used',
      });
    }
    // Defense in depth: a public app's code must ALWAYS carry a challenge
    // (enforced at authorize), so the verifier is never optional here.
    if (app.isPublic && !record.codeChallenge) {
      return res.status(400).json({
        error: 'invalid_grant',
        error_description: 'This code was issued without PKCE and cannot serve a public client',
      });
    }
    if (!verifyPkce(verifier, record.codeChallenge, record.codeChallengeMethod)) {
      return res.status(400).json({
        error: 'invalid_grant',
        error_description: 'PKCE verification failed',
      });
    }

    const token = await createAccessToken({ appId: app.id, userId: record.userId, scopes: record.scopes });
    // Name the consenting user in the audit trail (blank actor rows are
    // useless when reviewing "who granted this app access").
    const grantor = await findUserById(record.userId).catch(() => null);
    persistAuditLog({
      actorId: record.userId,
      actorName: grantor?.name || 'deleted user',
      actorEmail: grantor?.email || '',
      action: 'OAUTH_TOKEN_ISSUED',
      category: 'AUTH',
      target: `App ${app.clientId} (${app.name})`,
      source: detectSource(req),
      status: 'SUCCESS',
      ipAddress: req.ip || 'unknown',
      metadata: { scopes: record.scopes },
    });
    res.json({
      access_token: token,
      token_type: 'Bearer',
      expires_in: Math.round(ACCESS_TOKEN_TTL_MS / 1000),
      scope: record.scopes.join(' '),
    });
  });

  // ---- Userinfo (OIDC-style) — the app's window into the profile ----
  app.get('/api/v1/oauth/userinfo', async (req, res) => {
    const auth = req.headers.authorization || '';
    const rawToken = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
    const record = rawToken ? await resolveAccessToken(rawToken) : null;
    if (!record) {
      // RFC 6750: a 401 must carry the challenge so the client knows
      // WHICH scheme failed and why, without guessing.
      res.setHeader(
        'WWW-Authenticate',
        'Bearer error="invalid_token", error_description="The access token is invalid or expired"',
      );
      return res.status(401).json({
        error: 'invalid_token',
        error_description: 'The access token is invalid or expired',
      });
    }
    try {
      const result = await findUserById(record.userId);
      if (!result) {
        res.setHeader(
          'WWW-Authenticate',
          'Bearer error="invalid_token", error_description="The account no longer exists"',
        );
        return res.status(401).json({
          error: 'invalid_token',
          error_description: 'The account no longer exists',
        });
      }
      const profile: Record<string, unknown> = {
        sub: result.id,
        name: result.name,
        preferred_username: result.username || '',
        picture: result.avatarUrl || '',
      };
      if (record.scopes.includes('email')) {
        profile.email = result.email;
        // Honest by design: true only when a social provider proved the
        // address (see authStore). Password signups are reported false —
        // third-party apps must never treat an unproven email as verified.
        profile.email_verified = result.emailVerified === true;
      }
      res.json(profile);
    } catch (err) {
      console.error('[oauth/userinfo]', (err as Error).message);
      res.status(500).json({ error: 'Could not load the profile' });
    }
  });

  // ---- Revocation (RFC 7009) — idempotent, always 200 ----
  app.post('/api/v1/oauth/revoke', async (req, res) => {
    const rawToken = typeof req.body?.token === 'string' ? req.body.token : '';
    if (rawToken) {
      try {
        await revokeAccessToken(rawToken);
      } catch (err) {
        console.error('[oauth/revoke]', (err as Error).message);
      }
    }
    res.json({ success: true });
  });

  // ---------------------------------------------------------------------------
  // SERVER REQUEST ORDERS — "طلب سيرفرات"
  //
  // Two doors into ONE queue:
  //   1. PUBLIC — the embeddable widget on any website (or a raw curl)
  //      reads the plan catalog, submits a request, and later follows its
  //      status with the one-time track token. CORS '*' because it runs on
  //      foreign origins; anonymous, validated, rate-limited.
  //   2. ADMIN — the signed-in ADMIN reviews the queue in the dashboard:
  //      approve / reject with a note, then mark a delivery with the real
  //      connection details. Only the track-token holder can read those.
  // ---------------------------------------------------------------------------

  const REQUEST_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  const serverRequestAdminView = (row: ServerRequest) => ({
    id: row.id,
    planId: row.planId,
    planName: row.planName,
    requesterName: row.requesterName,
    requesterEmail: row.requesterEmail,
    note: row.note,
    status: row.status,
    reviewNote: row.reviewNote,
    host: row.host,
    sshPort: row.sshPort,
    sshUser: row.sshUser,
    credentialsNote: row.credentialsNote,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });

  // What the track-token holder sees: identity of the request + status,
  // delivery block only after the admin marks it delivered. The token
  // hash and the requester's email never leave the server here.
  const serverRequestTrackView = (row: ServerRequest) => ({
    id: row.id,
    planName: row.planName,
    requesterName: row.requesterName,
    status: row.status,
    reviewNote: row.reviewNote,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    delivery:
      row.status === 'delivered'
        ? { host: row.host, sshPort: row.sshPort, sshUser: row.sshUser, credentialsNote: row.credentialsNote }
        : null,
  });

  // ---- Public: the active plan catalog the widget/API renders ----
  app.get('/api/v1/servers/plans', async (req, res) => {
    // `?all=1` includes inactive plans — that view is admin-only.
    if (typeof req.query.all === 'string' && req.query.all) {
      const actor = requireAdmin(req, res);
      if (!actor) return;
    }
    try {
      const plans = await listServerPlans({
        includeInactive: typeof req.query.all === 'string' && !!req.query.all,
      });
      res.json({ plans });
    } catch (err) {
      console.error('[servers/plans]', (err as Error).message);
      res.status(500).json({ error: 'Could not load the plan catalog' });
    }
  });

  // ---- Public: anonymous submission (embed widget / third-party API) ----
  app.post(
    '/api/v1/servers/requests',
    rateLimit({ windowMs: 60_000, max: 15, perIpOnly: true }),
    async (req, res) => {
      try {
        // Honeypot: the `website` field is invisible to humans — a bot
        // that fills every input gets rejected without touching storage.
        if (typeof req.body?.website === 'string' && req.body.website.trim()) {
          return res.status(400).json({ error: 'Submission rejected' });
        }
        const planId = sanitizeText(req.body?.planId, 64).trim();
        const name = sanitizeText(req.body?.name, 80).trim();
        const email = sanitizeText(req.body?.email, 160).trim().toLowerCase();
        const note = sanitizeText(req.body?.note, 1000).trim();

        if (!name || name.length < 2) {
          return res.status(400).json({ error: 'Your name is required (at least 2 characters)' });
        }
        if (!email || email.length > 160 || !REQUEST_EMAIL_RE.test(email)) {
          return res.status(400).json({ error: 'A valid email address is required' });
        }
        if (!planId) return res.status(400).json({ error: 'Pick a plan first' });
        const plan = await getServerPlan(planId);
        if (!plan || !plan.active) {
          return res.status(400).json({ error: 'That plan is not accepting requests right now' });
        }

        const { request, trackToken } = await createServerRequest({
          planId: plan.id,
          planName: plan.name,
          requesterName: name,
          requesterEmail: email,
          note,
        });
        res.status(201).json({
          id: request.id,
          status: request.status,
          planName: request.planName,
          // Shown exactly once — only its sha256 is ever stored.
          trackToken,
          trackPath: `/embed/track.html?token=${encodeURIComponent(trackToken)}`,
        });
      } catch (err) {
        console.error('[servers/requests/create]', (err as Error).message);
        res.status(500).json({ error: 'Could not submit the request' });
      }
    },
  );

  // ---- Public: status lookup with the bearer track token (no account) ----
  app.get('/api/v1/servers/requests/track/:token', async (req, res) => {
    try {
      const token = sanitizeText(req.params.token, 128);
      const row = token ? await findServerRequestByTrackToken(token) : null;
      if (!row) return res.status(404).json({ error: 'No request matches this tracking token' });
      res.json({ request: serverRequestTrackView(row) });
    } catch (err) {
      console.error('[servers/requests/track]', (err as Error).message);
      res.status(500).json({ error: 'Could not load the request' });
    }
  });

  // ---- Admin: the intake queue ----
  app.get('/api/v1/servers/requests', async (req, res) => {
    const actor = requireAdmin(req, res);
    if (!actor) return;
    try {
      const statusParam = typeof req.query.status === 'string' ? req.query.status : '';
      if (statusParam && !isServerRequestStatus(statusParam)) {
        return res.status(400).json({ error: 'Unknown status filter' });
      }
      // Explicit narrowing: '' (no filter) and unknown values are excluded above.
      const statusFilter = isServerRequestStatus(statusParam) ? statusParam : undefined;
      const rows = await listServerRequests(statusFilter);
      res.json({ requests: rows.map(serverRequestAdminView) });
    } catch (err) {
      console.error('[servers/requests/list]', (err as Error).message);
      res.status(500).json({ error: 'Could not load the request queue' });
    }
  });

  // ---- Admin: move a request through the queue ----
  app.patch('/api/v1/servers/requests/:id', async (req, res) => {
    const actor = requireAdmin(req, res);
    if (!actor) return;
    const id = sanitizeText(req.params.id, 64);
    try {
      const current = await getServerRequest(id);
      if (!current) return res.status(404).json({ error: 'Request not found' });

      const patch: {
        status?: ServerRequest['status'];
        reviewNote?: string;
        host?: string;
        sshPort?: number;
        sshUser?: string;
        credentialsNote?: string;
      } = {};
      if (req.body?.status !== undefined) {
        if (!isServerRequestStatus(req.body.status)) {
          return res.status(400).json({ error: 'status must be pending, approved, delivered or rejected' });
        }
        patch.status = req.body.status;
      }
      if (req.body?.reviewNote !== undefined) patch.reviewNote = sanitizeText(req.body.reviewNote, 500);
      if (req.body?.host !== undefined) patch.host = sanitizeText(req.body.host, 200).trim();
      if (req.body?.sshUser !== undefined) patch.sshUser = sanitizeText(req.body.sshUser, 60).trim();
      if (req.body?.credentialsNote !== undefined) patch.credentialsNote = sanitizeText(req.body.credentialsNote, 1000);
      if (req.body?.sshPort !== undefined) {
        const port = Number(req.body.sshPort);
        if (!Number.isInteger(port) || port < 1 || port > 65535) {
          return res.status(400).json({ error: 'sshPort must be an integer between 1 and 65535' });
        }
        patch.sshPort = port;
      }
      if (Object.keys(patch).length === 0) {
        return res.status(400).json({ error: 'Nothing to update' });
      }
      // A delivery without a host would strand the requester.
      const nextHost = patch.host !== undefined ? patch.host : current.host;
      if ((patch.status ?? current.status) === 'delivered' && !nextHost) {
        return res.status(400).json({ error: 'Add the server host before marking this request delivered' });
      }

      const updated = await updateServerRequest(id, patch);
      if (!updated) return res.status(404).json({ error: 'Request not found' });

      persistAuditLog({
        actorId: actor.id,
        actorName: actor.name,
        actorEmail: actor.email,
        action: patch.status && patch.status !== current.status ? 'SERVER_REQUEST_STATUS' : 'SERVER_REQUEST_UPDATED',
        category: 'ADMIN',
        target: `${current.requesterEmail} (${current.planName})`,
        source: detectSource(req),
        status: patch.status === 'rejected' ? 'WARNING' : 'SUCCESS',
        ipAddress: req.ip || 'unknown',
        metadata: { from: current.status, to: updated.status },
      });
      res.json({ request: serverRequestAdminView(updated) });
    } catch (err) {
      console.error('[servers/requests/update]', (err as Error).message);
      res.status(500).json({ error: 'Could not update the request' });
    }
  });

  // ---- Admin: plan catalog CRUD ----
  app.post('/api/v1/servers/plans', async (req, res) => {
    const actor = requireAdmin(req, res);
    if (!actor) return;
    try {
      const name = sanitizeText(req.body?.name, 80).trim();
      const specs = sanitizeText(req.body?.specs, 300).trim();
      const price = sanitizeText(req.body?.price, 120).trim();
      const description = sanitizeText(req.body?.description, 1000).trim();
      if (name.length < 3) return res.status(400).json({ error: 'Plan name must be at least 3 characters' });

      const plan = await createServerPlan({
        name,
        specs,
        price,
        description,
        active: req.body?.active !== false,
      });
      persistAuditLog({
        actorId: actor.id,
        actorName: actor.name,
        actorEmail: actor.email,
        action: 'SERVER_PLAN_CREATED',
        category: 'ADMIN',
        target: plan.name,
        source: detectSource(req),
        status: 'SUCCESS',
        ipAddress: req.ip || 'unknown',
        metadata: { planId: plan.id },
      });
      res.status(201).json({ plan });
    } catch (err) {
      console.error('[servers/plans/create]', (err as Error).message);
      res.status(500).json({ error: 'Could not create the plan' });
    }
  });

  app.patch('/api/v1/servers/plans/:id', async (req, res) => {
    const actor = requireAdmin(req, res);
    if (!actor) return;
    const id = sanitizeText(req.params.id, 64);
    try {
      const patch: {
        name?: string;
        specs?: string;
        price?: string;
        description?: string;
        active?: boolean;
      } = {};
      if (req.body?.name !== undefined) {
        const name = sanitizeText(req.body.name, 80).trim();
        if (name.length < 3) return res.status(400).json({ error: 'Plan name must be at least 3 characters' });
        patch.name = name;
      }
      if (req.body?.specs !== undefined) patch.specs = sanitizeText(req.body.specs, 300).trim();
      if (req.body?.price !== undefined) patch.price = sanitizeText(req.body.price, 120).trim();
      if (req.body?.description !== undefined) patch.description = sanitizeText(req.body.description, 1000).trim();
      if (req.body?.active !== undefined) patch.active = req.body.active === true;
      if (Object.keys(patch).length === 0) return res.status(400).json({ error: 'Nothing to update' });

      const plan = await updateServerPlan(id, patch);
      if (!plan) return res.status(404).json({ error: 'Plan not found' });
      persistAuditLog({
        actorId: actor.id,
        actorName: actor.name,
        actorEmail: actor.email,
        action: 'SERVER_PLAN_UPDATED',
        category: 'ADMIN',
        target: plan.name,
        source: detectSource(req),
        status: 'SUCCESS',
        ipAddress: req.ip || 'unknown',
        metadata: { planId: plan.id },
      });
      res.json({ plan });
    } catch (err) {
      console.error('[servers/plans/update]', (err as Error).message);
      res.status(500).json({ error: 'Could not update the plan' });
    }
  });

  app.delete('/api/v1/servers/plans/:id', async (req, res) => {
    const actor = requireAdmin(req, res);
    if (!actor) return;
    const id = sanitizeText(req.params.id, 64);
    try {
      // Resolve first so the audit trail names the plan, not just its id.
      const existing = await getServerPlan(id);
      if (!existing) return res.status(404).json({ error: 'Plan not found' });
      const deleted = await deleteServerPlan(id);
      if (!deleted) return res.status(404).json({ error: 'Plan not found' });
      persistAuditLog({
        actorId: actor.id,
        actorName: actor.name,
        actorEmail: actor.email,
        action: 'SERVER_PLAN_DELETED',
        category: 'ADMIN',
        target: existing.name,
        source: detectSource(req),
        status: 'WARNING',
        ipAddress: req.ip || 'unknown',
        metadata: { planId: id },
      });
      res.json({ success: true });
    } catch (err) {
      console.error('[servers/plans/delete]', (err as Error).message);
      res.status(500).json({ error: 'Could not delete the plan' });
    }
  });

  // Admin: permanently delete an account. Your own account is off-limits and
  // the last remaining ADMIN can never be removed — one admin always survives.
  app.delete('/api/v1/admin/users/:id', async (req, res) => {
    const actor = requireAdmin(req, res);
    if (!actor) return;

    const id = sanitizeText(req.params.id, 64);
    if (!/^usr_[A-Za-z0-9_]+$/.test(id)) return res.status(400).json({ error: 'Invalid user id' });
    if (id === actor.id) return res.status(400).json({ error: 'You cannot delete your own account' });

    let target: { id: string; name: string; email: string; role: UserRole } | null = null;
    if (databasePool) {
      const found = await databasePool.query('select id, name, email, role from public.users where id = $1', [id]);
      target = found.rows[0] || null;
    } else {
      const u = db.users.find((x) => x.id === id);
      target = u ? { id: u.id, name: u.name, email: u.email, role: u.role } : null;
    }
    if (!target) return res.status(404).json({ error: 'User not found' });

    if (target.role === 'ADMIN') {
      let otherAdmins: number;
      if (databasePool) {
        const cnt = await databasePool.query(
          `select count(*)::int as n from public.users where role = 'ADMIN' and id <> $1`,
          [id],
        );
        otherAdmins = cnt.rows[0].n;
      } else {
        otherAdmins = db.users.filter((u) => u.role === 'ADMIN' && u.id !== id).length;
      }
      if (otherAdmins === 0) return res.status(400).json({ error: 'Cannot delete the last administrator' });
    }

    try {
      // Full cleanup: comments, chat history, API keys, sessions and identity
      // links (FK cascade in PG / explicit sweeps in memory mode).
      if (databasePool) {
        await databasePool.query('delete from public.comments where user_id = $1', [id]);
      } else {
        for (let i = memoryComments.length - 1; i >= 0; i--) {
          if (memoryComments[i].userId === id) memoryComments.splice(i, 1);
        }
        // Direct messages cascade with the account (PG: FK; memory: sweep).
        purgeMemoryMessages(id);
        // Published work and the GitHub grant go with it too.
        purgePublishedData(id);
        await clearGitHubToken(id);
        // Third-party OAuth apps, their codes and tokens
        // (PG: FK cascade; memory: explicit sweep).
        purgeOAuthAppData(id);
      }
      await clearAiChatHistory(id);
      await forgetAccount(id);

      persistAuditLog({
        actorId: actor.id,
        actorName: actor.name,
        actorEmail: actor.email,
        action: 'USER_DELETED',
        category: 'ADMIN',
        target: `${target.name} (${target.email})`,
        source: detectSource(req),
        status: 'WARNING',
        ipAddress: req.ip || 'unknown',
        metadata: { userId: id, role: target.role },
      });

      res.json({ success: true, user: { id: target.id, name: target.name } });
    } catch (err) {
      console.error('[admin/users] delete failed:', (err as Error).message);
      res.status(500).json({ error: 'Account deletion failed' });
    }
  });

  // Admin moderation: every comment across every docs page, newest first.
  app.get('/api/v1/admin/comments', async (req, res) => {
    if (!requireAdmin(req, res)) return;
    try {
      const comments = await listAllComments();
      res.json({ comments, total: comments.length });
    } catch (err) {
      console.error('[admin/comments]', (err as Error).message);
      res.status(500).json({ error: 'Failed to load comments' });
    }
  });

  // Admin Audit Logs (capped pagination, allowlisted filters)
  app.get('/api/v1/admin/logs', wrap(async (req, res) => {
    if (!requireAdmin(req, res)) return;

    const { limit, offset } = parsePagination(req.query);
    const from = sanitizeText(req.query.from as string, 32);
    const category = sanitizeText((req.query.category as string) || 'ALL', 16).toUpperCase();
    const search = sanitizeText((req.query.search as string) || '', 100).toLowerCase();

    let logs = await loadAuditSource();

    // Time filter
    if (from) {
      let sinceMs = 0;
      if (from === '24h') sinceMs = Date.now() - 24 * 3600 * 1000;
      else if (from === '7d') sinceMs = Date.now() - 7 * 24 * 3600 * 1000;
      else if (from === '30d') sinceMs = Date.now() - 30 * 24 * 3600 * 1000;
      else if (!isNaN(Date.parse(from))) sinceMs = new Date(from).getTime();

      if (sinceMs > 0) {
        logs = logs.filter((l) => new Date(l.timestamp).getTime() >= sinceMs);
      }
    }

    // Category filter (allowlist)
    const allowedCats = ['ALL', 'ADMIN', 'API', 'SECURITY', 'AUTH', 'KEYS', 'BOT', 'DATABASE'];
    if (category && category !== 'ALL') {
      if (!allowedCats.includes(category)) return res.status(400).json({ error: 'Invalid category' });
      logs = logs.filter((l) => l.category === category);
    }

    // Search filter
    if (search) {
      logs = logs.filter(
        (l) =>
          l.action.toLowerCase().includes(search) ||
          l.actorName.toLowerCase().includes(search) ||
          l.target.toLowerCase().includes(search) ||
          l.requestId.toLowerCase().includes(search)
      );
    }

    const total = logs.length;
    const paged = logs.slice(offset, offset + limit);

    res.json({
      total,
      limit,
      offset,
      logs: paged,
    });
  }));

  // Admin Logs CSV Export (formula-injection hardened)
  app.get('/api/v1/admin/logs/export', async (req, res) => {
    if (!requireAdmin(req, res)) return res.status(403).send('Forbidden');

    const headers = ['Timestamp', 'Actor', 'Action', 'Category', 'Target', 'Source', 'Status', 'Request ID', 'IP Address', 'Metadata'];
    const rows = (await loadAuditSource()).slice(0, 5000).map((l) => [
      csvCell(l.timestamp),
      csvCell(`${l.actorName} (${l.actorEmail})`),
      csvCell(l.action),
      csvCell(l.category),
      csvCell(l.target),
      csvCell(l.source),
      csvCell(l.status),
      csvCell(l.requestId),
      csvCell(l.ipAddress),
      csvCell(JSON.stringify(l.metadata || {})),
    ]);

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="vanitas_audit_logs_${Date.now()}.csv"`);
    res.send(csvContent);
  });

  // Admin System Statistics — account numbers are counted LIVE from the DB
  // (never fabricated).
  app.get('/api/v1/admin/statistics', async (req, res) => {
    if (!requireAdmin(req, res)) return;
    const stats: typeof db.systemStats = { ...db.systemStats };
    if (databasePool) {
      try {
        const result = await databasePool.query(`select
          (select count(*) from public.users) as total_users,
          (select count(distinct user_id) from public.auth_sessions
             where created_at > now() - interval '7 days') as active_users,
          (select count(*) from public.api_keys where status = 'active') as active_keys`);
        const row = result.rows[0];
        stats.totalUsers = Number(row.total_users);
        stats.activeUsers = Number(row.active_users);
        stats.activeApiKeys = Number(row.active_keys);
      } catch (err) {
        console.error('[admin/statistics]', (err as Error).message);
      }
    } else {
      stats.totalUsers = db.users.length;
      stats.activeUsers = db.users.length;
      stats.activeApiKeys = db.apiKeys.filter((k) => k.status === 'active').length;
    }
    // Honest error rate: derived from today's real request metrics — never a
    // static "healthy" placeholder number.
    const breakdown = stats.requestBreakdown || [];
    const totalReqs = breakdown.reduce((sum, p) => sum + Number(p.count || 0), 0);
    const totalErrs = breakdown.reduce((sum, p) => sum + Number(p.errorCount || 0), 0);
    stats.errorRate = totalReqs > 0 ? totalErrs / totalReqs : 0;
    res.json({ stats, threats: db.securityThreats });
  });

  // Admin Emergency Controls (explicit allowlist)
  app.post('/api/v1/admin/emergency', (req, res) => {
    const actor = requireAdmin(req, res);
    if (!actor) return;

    const action = sanitizeText(req.body?.action, 64);
    const source = detectSource(req);

    if (action === 'TOGGLE_MAINTENANCE') {
      const flag = db.featureFlags.find((f) => f.key === 'SYSTEM_MAINTENANCE_MODE');
      if (flag) {
        flag.enabled = !flag.enabled;
        persistAuditLog({
          actorId: actor.id,
          actorName: actor.name,
          actorEmail: actor.email,
          action: flag.enabled ? 'EMERGENCY_MAINTENANCE_ENABLED' : 'EMERGENCY_MAINTENANCE_DISABLED',
          category: 'ADMIN',
          target: 'Platform Core Services',
          source,
          status: 'WARNING',
          ipAddress: req.ip || 'unknown',
        });
        return res.json({ success: true, maintenanceMode: flag.enabled });
      }
    }

    if (action === 'PURGE_SUSPICIOUS_KEYS') {
      let count = 0;
      db.apiKeys.forEach((k) => {
        if (k.status === 'active' && k.environment === 'test') {
          k.status = 'revoked';
          count++;
        }
      });
      persistAuditLog({
        actorId: actor.id,
        actorName: actor.name,
        actorEmail: actor.email,
        action: 'EMERGENCY_KEY_PURGE',
        category: 'SECURITY',
        target: `${count} sandbox tokens revoked`,
        source,
        status: 'WARNING',
        ipAddress: req.ip || 'unknown',
      });
      return res.json({ success: true, revokedCount: count });
    }

    res.status(400).json({ error: 'Unrecognized emergency action' });
  });

  // Feature Flags — reading the live switchboard is an admin capability too,
  // so this route is gated exactly like the rest of /admin/*.
  app.get('/api/v1/admin/feature-flags', (req, res) => {
    if (!requireAdmin(req, res)) return;
    res.json({ featureFlags: db.featureFlags });
  });

  app.patch('/api/v1/admin/feature-flags/:id', (req, res) => {
    if (!requireAdmin(req, res)) return;
    const id = sanitizeText(req.params.id, 64);
    const { enabled } = req.body;
    const flag = db.featureFlags.find((f) => f.id === id);
    if (!flag) return res.status(404).json({ error: 'Feature flag not found' });
    flag.enabled = !!enabled;
    flag.updatedAt = new Date().toISOString();
    res.json({ success: true, flag });
  });

  // Webhooks — secrets NEVER returned in list; SSRF-guarded URLs.
  // Every row belongs to the account that created it: others can't see it,
  // test it, or read its delivery logs (admins excepted).
  function canManageWebhook(actor: User, w: { ownerId?: string }): boolean {
    return actor.role === 'ADMIN' || w.ownerId === actor.id;
  }

  /** One REAL delivery attempt: actual network call, HMAC-signed body,
   * redirect refused, real status/latency recorded. Shared by /test and by
   * event dispatch — nothing here ever fabricates a delivery result. */
  async function deliverWebhook(
    wh: { id: string; url: string; secret: string },
    event: string,
    data: Record<string, unknown>,
  ): Promise<WebhookDeliveryLog> {
    const payload = { event, timestamp: new Date().toISOString(), data };
    const body = JSON.stringify(payload);
    const signature = crypto.createHmac('sha256', wh.secret).update(body).digest('hex');
    const started = Date.now();
    let statusCode = 0;
    let ok = false;
    try {
      const response = await fetch(wh.url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-vanitas-event': event,
          'x-vanitas-signature': `sha256=${signature}`,
          'user-agent': 'Vanitas-Webhooks/1.0',
        },
        body,
        // Never follow redirects: a 30x bouncing to an internal host would
        // be SSRF with extra steps.
        redirect: 'error',
        signal: AbortSignal.timeout(5000),
      });
      statusCode = response.status;
      ok = response.ok;
      void response.body?.cancel().catch(() => undefined);
    } catch (err) {
      ok = false;
      statusCode = 0;
      console.warn('[webhooks] delivery failed:', (err as Error).message);
    }
    const log: WebhookDeliveryLog = {
      id: secureId('wh_log'),
      webhookId: wh.id,
      event,
      status: ok ? 'delivered' : 'failed',
      statusCode,
      latencyMs: Date.now() - started,
      timestamp: new Date().toISOString(),
      payload,
    };
    db.webhookLogs.unshift(log);
    if (db.webhookLogs.length > 200) db.webhookLogs.length = 200;
    const live = db.webhooks.find((w) => w.id === wh.id);
    if (live) {
      live.lastTriggeredAt = new Date().toISOString();
      live.failureCount = ok ? 0 : live.failureCount + 1;
    }
    return log;
  }

  /** Fire-and-forget event dispatch: real signed POSTs to every active
   * endpoint subscribed to this event. Never awaited by the caller. */
  function dispatchWebhooks(event: string, data: Record<string, unknown>): void {
    for (const wh of db.webhooks) {
      if (wh.status !== 'active' || !wh.events.includes(event)) continue;
      void deliverWebhook(wh, event, data).catch((err: Error) =>
        console.warn('[webhooks] dispatch error:', err.message),
      );
    }
  }

  app.get('/api/v1/webhooks', (req, res) => {
    const actor = getActorUser(req);
    if (!actor) return res.status(401).json({ error: 'Authentication required' });
    const visible = actor.role === 'ADMIN' ? db.webhooks : db.webhooks.filter((w) => canManageWebhook(actor, w));
    const visibleIds = new Set(visible.map((w) => w.id));
    const safe = visible.map((w) => ({ ...w, secret: undefined }));
    const logs = db.webhookLogs.filter((l) => visibleIds.has(l.webhookId));
    res.json({ webhooks: safe, logs });
  });

  app.post('/api/v1/webhooks', (req, res) => {
    const actor = getActorUser(req);
    if (!actor) return res.status(401).json({ error: 'Authentication required' });
    const name = sanitizeText(req.body?.name, 80);
    const rawUrl = req.body?.url;
    const events = req.body?.events;
    if (!name || name.length < 3 || !rawUrl || !Array.isArray(events) || events.length === 0 || events.length > 20) {
      return res.status(400).json({ error: 'Name (3-80), URL, and Events (1-20) are required' });
    }
    const url = sanitizeUrl(rawUrl);
    if (!url) return res.status(400).json({ error: 'Invalid or blocked webhook URL (https only, no private hosts)' });
    const cleanEvents = events.map((e: unknown) => sanitizeText(e, 48)).filter((e: string) => /^[a-z_.-]+$/.test(e));
    if (cleanEvents.length === 0) return res.status(400).json({ error: 'Invalid event names' });
    const newWebhook: WebhookEndpoint = {
      id: secureId('wh'),
      name,
      url,
      events: cleanEvents,
      secret: secureToken('whsec_'),
      status: 'active' as const,
      createdAt: new Date().toISOString(),
      lastTriggeredAt: null,
      failureCount: 0,
      ownerId: actor.id,
    };
    db.webhooks.unshift(newWebhook);
    persistAuditLog({
      actorId: actor.id,
      actorName: actor.name,
      actorEmail: actor.email,
      action: 'WEBHOOK_CREATED',
      category: 'API',
      target: `${sanitizeText(newWebhook.name, 80)} (${newWebhook.url.slice(0, 120)})`,
      source: detectSource(req),
      status: 'SUCCESS',
      ipAddress: req.ip || 'unknown',
    });
    // Return secret ONCE on creation only
    res.status(201).json({ webhook: newWebhook });
  });

  app.post('/api/v1/webhooks/:id/test', async (req, res) => {
    const id = sanitizeText(req.params.id, 128);
    const actor = getActorUser(req);
    if (!actor) return res.status(401).json({ error: 'Authentication required' });
    const wh = db.webhooks.find((w) => w.id === id);
    if (!wh) return res.status(404).json({ error: 'Webhook not found' });
    if (!canManageWebhook(actor, wh)) return res.status(403).json({ error: 'Not your webhook' });

    // REAL delivery: the request actually goes out, and the log records the
    // true status code and latency — success:false when the endpoint failed.
    try {
      const log = await deliverWebhook(wh, 'ping.test', { message: 'Vanitas ping verification handshake' });
      res.json({ success: log.status === 'delivered', log });
    } catch (err) {
      console.error('[webhooks] test failed:', (err as Error).message);
      res.status(500).json({ error: 'Webhook test failed' });
    }
  });

  // Bot Gateway Execution (validated, allowlisted platforms)
  app.get('/api/v1/bot/status', (_req, res) => {
    res.json({ bots: db.bots });
  });

  app.post('/api/v1/bot/execute', (req, res) => {
    const actor = getActorUser(req);
    if (!actor) return res.status(401).json({ error: 'Authentication required' });
    const platform = sanitizeText(req.body?.platform, 32) || 'discord';
    const command = sanitizeText(req.body?.command, 200);
    const payload = req.body?.payload;

    if (!command || command.length < 1) {
      return res.status(400).json({ error: 'Missing command payload' });
    }
    if (!['discord', 'whatsapp', 'telegram', 'custom'].includes(platform)) {
      return res.status(400).json({ error: 'Invalid platform' });
    }
    if (payload && (typeof payload !== 'object' || JSON.stringify(payload).length > 8000)) {
      return res.status(400).json({ error: 'Invalid payload (max 8KB object)' });
    }

    const bot = db.bots.find((b) => b.platform === platform) || db.bots[0];
    bot.commandsExecuted += 1;
    bot.lastPingAt = new Date().toISOString();

    persistAuditLog({
      actorId: actor.id,
      actorName: actor.name,
      actorEmail: actor.email,
      action: 'BOT_COMMAND_EXECUTED',
      category: 'BOT',
      target: `${platform}::${command.slice(0, 120)}`,
      source: 'BOT',
      status: 'SUCCESS',
      ipAddress: req.ip || 'unknown',
      metadata: { command: command.slice(0, 200), latencyMs: 14 },
    });

    res.json({
      success: true,
      executionId: secureId('exec'),
      platform: bot.platform,
      command,
      output: `Vanitas executed [${command.slice(0, 100)}] on ${bot.name}. Result: Nominal.`,
      timestamp: new Date().toISOString(),
    });
  });

  // Signed-in users' own chat history (never seeded, wiped with the account).
  app.get('/api/v1/ai/history', async (req, res) => {
    try {
      const actor = getActorUser(req);
      if (!actor) return res.status(401).json({ error: 'Authentication required' });
      const messages = await listAiChatHistory(actor.id);
      res.json({ messages });
    } catch (err) {
      console.error('[ai/history]', (err as Error)?.message);
      res.status(500).json({ error: 'Failed loading chat history' });
    }
  });

  app.delete('/api/v1/ai/history', async (req, res) => {
    try {
      const actor = getActorUser(req);
      if (!actor) return res.status(401).json({ error: 'Authentication required' });
      const removed = await clearAiChatHistory(actor.id);
      res.json({ success: true, removed });
    } catch (err) {
      console.error('[ai/history]', (err as Error)?.message);
      res.status(500).json({ error: 'Failed clearing chat history' });
    }
  });

  // Vanitas AI Chat endpoint (prompt size cap + persona allowlist).
  // With { stream: true } the reply is delivered as Server-Sent Events
  // (delta → delta → done) so the UI can reveal it progressively.
  app.post('/api/v1/ai/chat', async (req, res) => {
    try {
      const persona = sanitizeText(req.body?.persona, 32) || 'code';
      const toneStyle = sanitizeText(req.body?.toneStyle, 32) || 'developer';
      const prompt = sanitizeText(req.body?.prompt, 8000);
      if (!prompt || prompt.length < 2) return res.status(400).json({ error: 'Prompt is required (2-8000 chars)' });
      if (!['code', 'api', 'security', 'analyst', 'docs', 'video', 'admin'].includes(persona)) {
        return res.status(400).json({ error: 'Invalid persona' });
      }

      const actor = getActorUser(req);
      const queryOptions = {
        persona: persona as any,
        toneStyle: (['architect', 'security', 'developer', 'bot', 'arabic'].includes(toneStyle) ? toneStyle : 'developer') as any,
        prompt,
        enableWebSearch: !!req.body?.enableWebSearch,
        enableVideoSearch: !!req.body?.enableVideoSearch,
        context: typeof req.body?.context === 'object' ? req.body.context : undefined,
      };

      // Persist the user's message for signed-in accounts (both modes).
      if (actor) {
        try {
          await appendAiChatMessage({ userId: actor.id, role: 'user', content: prompt, persona });
        } catch (histErr) {
          console.warn('[ai/chat] history save (user) failed:', (histErr as Error)?.message);
        }
      }

      if (req.body?.stream === true) {
        res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
        res.setHeader('Cache-Control', 'no-cache, no-transform');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('X-Accel-Buffering', 'no');

        const send = (payload: unknown) => res.write(`data: ${JSON.stringify(payload)}\n\n`);
        let streamedText = '';

        try {
          const response = await processAiQueryStream(queryOptions, (delta) => {
            if (!delta) return;
            streamedText += delta;
            send({ type: 'delta', t: delta });
          });

          // `text` is authoritative — the client syncs its bubble to it.
          const finalText = (response.text || streamedText).trim();
          if (actor && finalText) {
            try {
              await appendAiChatMessage({ userId: actor.id, role: 'ai', content: finalText, persona });
            } catch (histErr) {
              console.warn('[ai/chat] history save (ai) failed:', (histErr as Error)?.message);
            }
          }

          send({
            type: 'done',
            text: finalText,
            engine: response.engine,
            upstream: response.upstream ?? null,
            groundingSources: response.groundingSources,
            videos: response.videos,
            videoQuery: response.videoQuery,
            requiresConfirmation: response.requiresConfirmation,
          });
        } catch (streamErr) {
          console.error('[ai/chat] stream]', (streamErr as Error)?.message);
          send({ type: 'error', message: 'The AI engine failed to respond. Please try again.' });
        }
        return res.end();
      }

      const response = await processAiQuery(queryOptions);
      if (actor && response.text) {
        try {
          await appendAiChatMessage({ userId: actor.id, role: 'ai', content: response.text, persona });
        } catch (histErr) {
          console.warn('[ai/chat] history save (ai) failed:', (histErr as Error)?.message);
        }
      }

      res.json(response);
    } catch (err: any) {
      console.error('[ai/chat]', (err as Error)?.message);
      res.status(500).json({ error: 'AI engine error' });
    }
  });

  // Vanitas AI Code Diagnosis, Bug Detection & Auto-Repair Tool
  app.post('/api/v1/ai/diagnose-fix', async (req, res) => {
    try {
      const code = typeof req.body?.code === 'string' ? req.body.code.slice(0, 30000) : '';
      const language = sanitizeText(req.body?.language, 16) || 'typescript';
      if (!code) {
        return res.status(400).json({ error: 'Code snippet string is required (max 30KB)' });
      }
      if (!['typescript', 'javascript', 'python', 'curl', 'json', 'sql'].includes(language)) {
        return res.status(400).json({ error: 'Invalid language' });
      }

      const result = await diagnoseAndFixCode({
        code,
        language: language as any,
        context: sanitizeText(req.body?.context, 2000) || undefined,
        autoFix: req.body?.autoFix !== false,
      });

      res.json(result);
    } catch (err: any) {
      console.error('[ai/diagnose]', (err as Error)?.message);
      res.status(500).json({ error: 'Failed running code diagnosis' });
    }
  });

  // Product suggestions are intentionally separate from AI chat: users can report a bug,
  // while an administrator retains control over the review and any proposed code repair.
  app.post('/api/v1/suggestions', wrap(async (req, res) => {
    const actor = getActorUser(req);
    if (!actor) return res.status(401).json({ error: 'Sign in to submit a suggestion' });
    const title = sanitizeText(req.body?.title, 140);
    const details = sanitizeText(req.body?.details, 5000);
    const category = sanitizeText(req.body?.category, 16) || 'feature';
    const code = typeof req.body?.code === 'string' ? req.body.code.slice(0, 20000) : undefined;
    if (!title || title.length < 3 || !details || details.length < 3) return res.status(400).json({ error: 'Title and details are required (3+ chars)' });
    if (!['bug', 'feature', 'ux'].includes(category)) return res.status(400).json({ error: 'Invalid suggestion category' });

    const suggestion = await createSuggestion({ title, details, category: category as any, code, authorName: sanitizeText(actor.name, 80) });
    persistAuditLog({
      actorId: actor.id, actorName: actor.name, actorEmail: actor.email,
      action: 'SUGGESTION_CREATED', category: 'ADMIN', target: suggestion.id,
      source: detectSource(req), status: 'SUCCESS', ipAddress: req.ip || 'unknown', metadata: { category },
    });
    res.status(201).json({ suggestion });
  }));

  app.get('/api/v1/admin/suggestions', wrap(async (req, res) => {
    if (!requireAdmin(req, res)) return;
    res.json({ suggestions: await listSuggestions() });
  }));

  app.patch('/api/v1/admin/suggestions/:id', wrap(async (req, res) => {
    if (!requireAdmin(req, res)) return;
    const status = sanitizeText(req.body?.status, 16);
    const adminNote = sanitizeText(req.body?.adminNote, 2000) || undefined;
    if (!['open', 'reviewing', 'resolved'].includes(status)) return res.status(400).json({ error: 'Invalid status' });
    const suggestion = await updateSuggestion(sanitizeText(req.params.id, 128), status as any, adminNote);
    if (!suggestion) return res.status(404).json({ error: 'Suggestion not found' });
    res.json({ suggestion });
  }));

  app.post('/api/v1/admin/suggestions/:id/ai-fix', async (req, res) => {
    if (!requireAdmin(req, res)) return;
    const suggestion = await findSuggestion(sanitizeText(req.params.id, 128));
    if (!suggestion) return res.status(404).json({ error: 'Suggestion not found' });
    if (!suggestion.code) return res.status(400).json({ error: 'A code sample is required before AI repair can run' });
    await updateSuggestion(suggestion.id, 'reviewing', 'Admin requested an AI repair proposal.');
    const language = sanitizeText(req.body?.language, 16) || 'typescript';
    const diagnosis = await diagnoseAndFixCode({ code: suggestion.code.slice(0, 30000), language: language as any, context: suggestion.details.slice(0, 2000), autoFix: true });
    res.json({ suggestion: await findSuggestion(suggestion.id), diagnosis });
  });

  // ----------------------------------------------------
  // AI-POWERED GLOBAL SEMANTIC SEARCH
  // ----------------------------------------------------
  app.all(['/api/v1/search/semantic', '/api/v1/semantic-search'], async (req, res) => {
    try {
      const rawQuery = (req.method === 'POST' ? req.body?.query : req.query.q) as string;
      const query = sanitizeText(rawQuery, 300);
      if (!query || query.length < 2) {
        return res.status(400).json({ error: 'Search query (2-300 chars) is required' });
      }
      // Optional: resolves the caller so the corpus can be scoped (see below).
      // The endpoint stays reachable anonymously for public documentation search.
      const actor = getActorUser(req);

      // Documentation endpoints corpus
      const docsCorpus = [
        {
          id: 'doc_auth_scopes',
          title: 'Authentication & Scopes Matrix Guide',
          description: 'Overview of JWT bearer tokens, SHA-256 secret hashing, and granular scopes (api.read, bot.execute, admin.all).',
          tags: ['auth', 'jwt', 'scopes', 'tokens', 'security'],
        },
        {
          id: 'doc_rate_limiting',
          title: 'Sliding Window & Token Bucket Rate Limiting',
          description: 'Configure high-throughput per-minute quotas, burst capacities, and 429 Too Many Requests response policies.',
          tags: ['rate-limit', 'sliding_window', 'token_bucket', 'burst', 'quota'],
        },
        {
          id: 'doc_bot_gateway',
          title: 'Discord & WhatsApp Bot Integration Protocol',
          description: 'Ingest slash commands and automated actions across distributed guilds with sub-20ms latency.',
          tags: ['bot', 'discord', 'whatsapp', 'slash_commands', 'gateway'],
        },
        {
          id: 'doc_webhooks',
          title: 'Webhook Dispatcher & HMAC-SHA256 Signatures',
          description: 'Secure event dispatching with exponential backoff retries and payload verification headers.',
          tags: ['webhooks', 'hmac', 'events', 'dispatch', 'signatures'],
        },
        {
          id: 'doc_cloud_databases',
          title: 'External Free Cloud Database Integrations (PostgreSQL & Redis)',
          description: 'Connecting Supabase, Neon Serverless Postgres, and Upstash Redis with automated pooling and SSL.',
          tags: ['database', 'postgres', 'supabase', 'neon', 'upstash', 'sql'],
        },
        {
          id: 'doc_modern_clients',
          title: 'Modern Client Architecture: Android 14/15 APK & Windows 11 EXE',
          description: 'Deploying native ARM64 Android binaries and Windows 11 Mica acrylic workstation builds with hardware acceleration.',
          tags: ['downloads', 'android', 'apk', 'windows', 'exe', 'arm64', 'modern'],
        },
      ];

      const result = await performSemanticSearch(query, {
        docs: docsCorpus,
        // API keys and security threats are NOT public corpus material:
        // a caller only ever searches their OWN keys, and threats (internal
        // telemetry) are indexed for administrators alone. Anonymous callers
        // search docs/status/bots/releases only — no cross-tenant metadata.
        keys: actor ? db.apiKeys.filter((k) => actor.role === 'ADMIN' || k.ownerId === actor.id) : [],
        status: db.systemStats.requestBreakdown.map((r) => ({
          name: r.endpoint,
          uptime: '99.99%',
          latency: `${r.avgLatencyMs}ms`,
          status: r.errorCount > 0 ? 'degraded' : 'operational',
        })),
        bots: db.bots,
        threats: actor?.role === 'ADMIN' ? db.securityThreats : [],
        releases: db.releases,
      });

      res.json(result);
    } catch (err: any) {
      console.error('[semantic-search]', (err as Error)?.message);
      res.status(500).json({ error: 'Semantic search failed' });
    }
  });

  // ----------------------------------------------------
  // YOUTUBE VIDEO SEARCH & AI INTELLIGENCE
  // ----------------------------------------------------
  app.get('/api/v1/youtube/search', async (req, res) => {
    try {
      const q = sanitizeText(req.query.q as string, 200) || 'Vanitas API Gateway';
      const limit = Math.min(Math.max(parseInt((req.query.limit as string) || '6', 10) || 6, 1), 20);
      const result = await searchYouTubeVideos(q, limit);
      res.json(result);
    } catch (err: any) {
      console.error('[youtube/search]', (err as Error)?.message);
      res.status(500).json({ error: 'Failed searching YouTube videos' });
    }
  });

  // ----------------------------------------------------
  // EXTERNAL CLOUD DATABASES (SUPABASE, NEON, UPSTASH)
  // ----------------------------------------------------
  // Connection metadata (names, providers, regions, masked URLs) is
  // infrastructure detail — admins only, like the connect route below.
  app.get('/api/v1/databases/external', (req, res) => {
    if (!requireAdmin(req, res)) return;
    res.json({
      success: true,
      databases: db.externalDatabases,
      recommendedFreeTiers: [
        { provider: 'supabase', name: 'Supabase PostgreSQL', freeQuota: '500 MB DB + 50,000 MAU', url: 'https://supabase.com' },
        { provider: 'neon', name: 'Neon Serverless Postgres', freeQuota: '0.5 GiB + Scale-to-Zero', url: 'https://neon.tech' },
        { provider: 'upstash', name: 'Upstash Redis', freeQuota: '10,000 commands/day', url: 'https://upstash.com' },
        { provider: 'render', name: 'Render Free Service', freeQuota: 'Free Webhook receiver & worker', url: 'https://render.com' },
      ],
    });
  });

  // Admin-only: REAL reachability probe for a stored external endpoint.
  // http(s) URLs are dialled (SSRF-guarded via sanitizeUrl, redirects refused,
  // 5s cap) and the reported latency is the MEASURED round trip; postgres/
  // redis dialects are never dialled by the gateway (only masked URLs are
  // stored) and report honestly as unverified — no random "connected" answers.
  app.post('/api/v1/databases/external/test', async (req, res) => {
    if (!requireAdmin(req, res)) return;
    const id = sanitizeText(req.body?.id, 128);
    if (!id) return res.status(400).json({ error: 'Database ID is required' });

    const item = db.getExternalDatabase(id);
    if (!item) {
      return res.json({ success: false, latencyMs: 0, message: 'Database configuration not found' });
    }

    const scheme = (item.connectionUrlMasked.match(/^([a-z][a-z0-9+.-]*):\/\//i)?.[1] || '').toLowerCase();
    if (scheme !== 'http' && scheme !== 'https') {
      return res.json({
        success: false,
        latencyMs: 0,
        message: `${scheme || 'non-http'} endpoints are stored masked and never dialled by the gateway — verify this connection from your own client.`,
        database: item,
      });
    }

    // Policy check happens WITHOUT userinfo (sanitizeUrl rejects credentials);
    // the dial also sends no credentials — any HTTP answer proves reachability.
    const dialUrl = item.connectionUrlMasked.replace(/\/\/[^/@]*@/, '//');
    if (!sanitizeUrl(dialUrl)) {
      return res.json({
        success: false,
        latencyMs: 0,
        message: 'Stored URL fails the SSRF policy (blocked host or scheme) — not dialled.',
        database: item,
      });
    }

    const started = Date.now();
    try {
      const response = await fetch(dialUrl, {
        method: 'GET',
        redirect: 'error',
        signal: AbortSignal.timeout(5000),
        headers: { 'user-agent': 'Vanitas-Connect-Test/1.0' },
      });
      const latencyMs = Date.now() - started;
      void response.body?.cancel().catch(() => undefined);
      const ok = response.status < 500;
      const database = db.markDatabaseTested(id, ok, latencyMs);
      res.json({
        success: ok,
        latencyMs,
        message: ok
          ? `Reachable — HTTP ${response.status} in ${latencyMs}ms${response.status >= 400 ? ' (host up; endpoint answered with an error status)' : ''}.`
          : `Host answered but returned HTTP ${response.status} in ${latencyMs}ms — unhealthy.`,
        database,
      });
    } catch (err) {
      const latencyMs = Date.now() - started;
      const raw = String((err as Error)?.message || 'network error');
      const reason = /abort|timeout/i.test(raw) ? `timed out after 5s (${latencyMs}ms)` : raw.slice(0, 120);
      const database = db.markDatabaseTested(id, false, latencyMs);
      res.json({ success: false, latencyMs, message: `Unreachable — ${reason}.`, database });
    }
  });

  // Admin-only: storing a connection URL is sensitive — never return raw URL.
  app.post('/api/v1/databases/external', (req, res) => {
    const actor = requireAdmin(req, res);
    if (!actor) return;
    const name = sanitizeText(req.body?.name, 80);
    const provider = sanitizeText(req.body?.provider, 32);
    const region = sanitizeText(req.body?.region, 80);
    const connectionUrl = typeof req.body?.connectionUrl === 'string' ? req.body.connectionUrl.slice(0, 2048) : '';
    if (!name || name.length < 3 || !provider || !connectionUrl) {
      return res.status(400).json({ error: 'Name, Provider, and Connection URL are required' });
    }
    if (!['supabase', 'neon', 'upstash', 'render', 'railway', 'sqlite_cloud'].includes(provider)) {
      return res.status(400).json({ error: 'Unsupported provider' });
    }
    // Validate the connection URL before storing it. http(s) goes through
    // sanitizeUrl (SSRF blocklist). postgres/redis schemes get parsed and
    // may never point at a cloud-metadata host: the URL is only stored
    // (masked) and never dialled by the server today, but a stored metadata
    // address would be a loaded gun for any future connect path. RFC1918
    // private ranges stay allowed — a self-hosted database is legitimate.
    const scheme = (connectionUrl.match(/^([a-z][a-z0-9+.-]*):\/\//i)?.[1] || '').toLowerCase();
    let urlOk = false;
    if (scheme === 'http' || scheme === 'https') {
      urlOk = !!sanitizeUrl(connectionUrl);
    } else if (['postgresql', 'postgres', 'rediss', 'redis'].includes(scheme)) {
      try {
        const parsed = new URL(connectionUrl);
        const host = parsed.hostname.toLowerCase();
        urlOk =
          !!host &&
          host !== '169.254.169.254' &&
          host !== 'metadata.google.internal' &&
          host !== 'metadata.goog' &&
          host !== '100.100.100.200' &&
          !host.endsWith('.metadata.google.internal');
      } catch {
        urlOk = false;
      }
    }
    if (!urlOk) {
      return res.status(400).json({ error: 'Invalid connection URL (unsupported scheme or blocked host)' });
    }

    const created = db.addExternalDatabase({ name, provider: provider as any, connectionUrl, region: region || undefined });

    persistAuditLog({
      actorId: actor.id,
      actorName: actor.name,
      actorEmail: actor.email,
      action: 'DATABASE_CONNECTED',
      category: 'DATABASE',
      target: `${created.name} (${created.provider})`,
      source: detectSource(req),
      status: 'SUCCESS',
      ipAddress: req.ip || 'unknown',
      metadata: { provider: created.provider, region: created.region },
    });

    res.status(201).json({ success: true, database: created });
  });

  // ----------------------------------------------------
  // VIDEO WALKTHROUGHS & SHOWCASE
  // ----------------------------------------------------
  // Live tutorials — REAL YouTube results (5-minute cache). If the live
  // search is unreachable the client simply gets an empty list; nothing fake
  // is ever substituted.
  let tutorialsCache: { at: number; payload: unknown } | null = null;
  app.get('/api/v1/videos/tutorials', async (_req, res) => {
    try {
      if (tutorialsCache && Date.now() - tutorialsCache.at < 5 * 60_000) {
        return res.json(tutorialsCache.payload);
      }
      const result = await searchYouTubeVideos('build REST API authentication tutorial', 8);
      const tutorials = result.videos.map((v: any) => ({
        id: `yt_${v.id}`,
        title: v.title,
        description: v.description || 'Live YouTube tutorial result.',
        category: 'getting_started',
        duration: v.duration || '',
        thumbnailUrl: v.thumbnailUrl,
        videoEmbedUrl: v.embedUrl,
        youtubeId: v.id,
        badge: 'Live on YouTube',
        author: v.channelTitle,
        tags: ['YouTube', 'Tutorial'],
        highlights: [],
      }));
      const payload = { success: true, tutorials, source: result.searchEngine, summary: result.aiSummary };
      tutorialsCache = { at: Date.now(), payload };
      res.json(payload);
    } catch (err) {
      console.error('[videos/tutorials]', (err as Error)?.message);
      res.json({ success: true, tutorials: [] });
    }
  });

  // ----------------------------------------------------
  // CLIENT DOWNLOADS & RELEASE ARTIFACTS
  // ----------------------------------------------------
  // ---------------------------------------------------------------------------
  // Client release downloads. What a user downloads per platform today is a
  // SIGNED BUILD MANIFEST (text) — native binaries are not published yet and
  // the UI discloses that. Integrity is real: the served bytes, the metadata
  // sha256/sizeBytes and the page verifier all describe the same file.
  //   • Console button → session-authenticated fetch (real success/failure)
  //   • QR on another device → short-lived signed link minted by a session
  // Counts move ONLY when bytes are actually served.
  // ---------------------------------------------------------------------------
  const DOWNLOAD_LINK_TTL_MS = 10 * 60 * 1000;
  // Signed with a key derived from DATABASE_URL so any serverless instance
  // can verify a link minted by another one (same pattern as the 2FA state
  // key above, with a domain-separation prefix so the keys differ). With
  // neither secret configured (pure local dev, single process), fall back to
  // a random per-process key: links are 10-minute credentials anyway, whereas
  // a hardcoded constant would let anyone forge them.
  const downloadSignKey = crypto
    .createHash('sha256')
    .update(
      `download-link:${
        process.env.DATABASE_URL ||
        process.env.ADMIN_API_TOKEN ||
        `local-${crypto.randomBytes(32).toString('hex')}`
      }`,
    )
    .digest();

  const signDownloadLink = (type: string, exp: number, uid: string): string =>
    crypto.createHmac('sha256', downloadSignKey).update(`${type}|${exp}|${uid}`).digest('base64url');

  app.get('/api/v1/download/releases', (_req, res) => {
    res.json({
      success: true,
      // Derived from the catalog itself — never a hardcoded version string.
      latestVersion: db.releases[0]?.version || '',
      releases: db.releases,
    });
  });

  // Mint a short-lived signed download link (used by the cross-device QR).
  // Requires a real session — a device without credentials can consume the
  // link, but only a signed-in user can create one.
  app.post('/api/v1/download/:type/token', (req, res) => {
    const actor = getActorUser(req);
    if (!actor) return res.status(401).json({ error: 'Authentication required' });
    const type = sanitizeText(req.params.type, 16);
    if (!['apk', 'exe', 'dmg', 'appimage'].includes(type)) {
      return res.status(400).json({ error: 'Invalid platform release type. Expected: apk, exe, dmg, appimage' });
    }
    const exp = Date.now() + DOWNLOAD_LINK_TTL_MS;
    const sig = signDownloadLink(type, exp, actor.id);
    res.json({
      url: `/api/v1/download/${type}?exp=${exp}&uid=${encodeURIComponent(actor.id)}&sig=${sig}`,
      expiresAt: new Date(exp).toISOString(),
      expiresInSec: DOWNLOAD_LINK_TTL_MS / 1000,
    });
  });

  app.get('/api/v1/download/:type', (req, res) => {
    try {
      const type = sanitizeText(req.params.type, 16) as 'apk' | 'exe' | 'dmg' | 'appimage';
      const typeValid = ['apk', 'exe', 'dmg', 'appimage'].includes(type);
      const source = detectSource(req);

      // Authorization path A: a real session (the console's own fetch).
      let actor = getActorUser(req);

      // Authorization path B: a valid short-lived signed link (QR scan).
      // The signature covers type + expiry + issuing user id, so a link for
      // one artifact cannot be replayed against another or extended.
      if (!actor) {
        const exp = Number(req.query.exp);
        const sig = String(req.query.sig || '');
        const uid = String(req.query.uid || '').slice(0, 64);
        const now = Date.now();
        let valid = false;
        if (typeValid && sig && Number.isFinite(exp) && exp > now && exp <= now + DOWNLOAD_LINK_TTL_MS) {
          const expected = Buffer.from(signDownloadLink(type, exp, uid), 'utf8');
          const given = Buffer.from(sig, 'utf8');
          valid = expected.length === given.length && crypto.timingSafeEqual(expected, given);
        }
        if (!valid) return res.status(401).json({ error: 'Authentication required' });
        // Attribute to the issuing account when it still exists; otherwise to
        // an honest machine principal — never to a fabricated human.
        actor =
          db.users.find((u) => u.id === uid) || {
            id: 'usr_signed_download_link',
            email: 'signed-download-link@vanitas.local',
            name: 'Signed Download Link',
            username: 'signed_download_link',
            avatarUrl: '',
            role: 'USER' as const,
            twoFactorEnabled: false,
            createdAt: '1970-01-01T00:00:00.000Z',
            lastLoginAt: '1970-01-01T00:00:00.000Z',
            verification: '',
            connectedAccounts: { google: false, github: false, discord: false },
          };
      }

      if (!typeValid) {
        return res.status(400).json({ error: 'Invalid platform release type. Expected: apk, exe, dmg, appimage' });
      }

      const release = db.releases.find((r) => r.type === type);
      if (!release) return res.status(404).json({ error: 'Release artifact not found' });

      // Metadata inspection is a pure read — it NEVER moves download counts.
      if (req.query.format === 'json' || req.headers.accept?.includes('application/json')) {
        return res.json({
          success: true,
          release,
          artifactKind: release.artifactKind,
          downloadUrl: `/api/v1/download/${type}`,
        });
      }

      const payload = db.getReleasePayload(type);
      if (!payload) return res.status(404).json({ error: 'Release artifact not found' });

      // The count and the audit entry move only now — bytes are leaving.
      db.recordClientDownload(type, actor, source);

      res.setHeader('Content-Disposition', `attachment; filename="${sanitizeText(release.filename, 128)}"`);
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('X-Vanitas-Version', sanitizeText(release.version, 32));
      res.setHeader('X-Vanitas-Checksum-SHA256', sanitizeText(release.sha256, 128));
      res.setHeader('X-Vanitas-Artifact-Kind', release.artifactKind);
      res.setHeader('Content-Length', String(payload.length));

      res.send(payload);
    } catch (err: any) {
      console.error('[download]', (err as Error)?.message);
      res.status(500).json({ error: 'Download failed' });
    }
  });

  // Centralized error handler — never leak stack traces to clients
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    console.error('[unhandled]', err?.message);
    res.status(500).json({ error: 'Internal server error' });
  });

  // ----------------------------------------------------
  // VITE MIDDLEWARE (Development) or STATIC SERVE (Production)
  // In serverless (Vercel) skip vite/static — platform serves frontend.
  // ----------------------------------------------------
  if (!process.env.VERCEL) {
    if (process.env.NODE_ENV !== 'production') {
      // Dev-only: build the specifier dynamically so bundlers/nft-tracers
      // never pull the (huge, dev-only) vite package into a serverless bundle.
      const viteSpecifier = ['v', 'ite'].join('');
      const { createServer: createViteServer } = await import(viteSpecifier);
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: 'spa',
      });
      app.use(vite.middlewares);
    } else {
      const distPath = path.join(process.cwd(), 'dist');
      app.use(express.static(distPath));
      app.get(/^(?!\/api\/).*/, (_req, res) => {
        res.sendFile(path.join(distPath, 'index.html'));
      });
    }
  }

  return app;
}

async function startServer() {
  const PORT = Number(process.env.PORT) || 3000;
  const app = await buildApp();
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Vanitas Central Server running on http://0.0.0.0:${PORT}`);
  });
}

// A rejected promise from any unwrapped async work must not take the whole
// process down (Node ≥15 crashes on unhandled rejections by default — one
// transient storage error would mean total downtime). Log it and keep serving.
process.on('unhandledRejection', (reason) => {
  console.error('[process] unhandledRejection:', reason instanceof Error ? reason.message : String(reason));
});

export default buildApp;

// Only auto-listen when run directly (node dist/server.cjs / tsx server.ts),
// not when imported by Vercel serverless.
if (!process.env.VERCEL && (process.argv[1]?.endsWith('server.ts') || process.argv[1]?.endsWith('server.cjs'))) {
  startServer();
} else if (!process.env.VERCEL && process.env.NODE_ENV !== 'test') {
  // Fallback for `npm run dev` / `npm start` where argv check may vary.
  // Avoid double-listen on Vercel.
  if (!(globalThis as any).__vanitas_listening) {
    (globalThis as any).__vanitas_listening = true;
    startServer().catch((e) => console.error(e));
  }
}
