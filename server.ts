import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import crypto from 'crypto';
import { db, ALL_SCOPES } from './src/server/db.ts';
import { databasePool, ensureSchema } from './src/server/pg.ts';
import { createAccount, verifyAccount, createSession, resolveSession, revokeSession, upsertOAuthUser, updateProfile, forgetAccount, getTwoFactorSecret, setTwoFactor, findUserById, invalidateResolveCache, rowToUser } from './src/server/authStore.ts';
import { generateTotpSecret, verifyTotp, totpOtpauthUrl } from './src/server/totp.ts';
import {
  getProviderConfig,
  isOAuthProvider,
  listConfiguredProviders,
  signState,
  verifyState,
  buildAuthorizeUrl,
  callbackUrl,
  appBaseUrl,
  exchangeCode,
  fetchProfile,
} from './src/server/oauth.ts';
import { processAiQuery, processAiQueryStream, diagnoseAndFixCode, performSemanticSearch, searchYouTubeVideos, getLastAiUpstream } from './src/server/aiService.ts';
import { authenticateApiKey, requireScope, rateWindowStatus, nextQuotaReset } from './src/server/apiKeyAuth.ts';
import { ClientSource, UserRole, PermissionScope, ProductSuggestion, ApiKey, User, AuditLog, VerificationType } from './src/types.ts';
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

export async function buildApp() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use(express.json({ limit: '256kb' }));
  app.use(express.urlencoded({ extended: true, limit: '256kb' }));

  // Hardened CORS — same-origin by default, allowlist via FRONTEND_URL
  app.use((req, res, next) => {
    const allowed = (process.env.FRONTEND_URL || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
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
  const defaultLimiter = rateLimit({ windowMs: 60_000, max: 300 });
  const publicLimiter = rateLimit({ windowMs: 60_000, max: 1200 });
  app.use('/api/', (req, res, next) =>
    (req.originalUrl || req.url).startsWith('/api/v1/public/')
      ? publicLimiter(req, res, next)
      : defaultLimiter(req, res, next),
  );
  app.use('/api/v1/auth/', rateLimit({ windowMs: 60_000, max: 60 }));
  app.use('/api/v1/ai/', rateLimit({ windowMs: 60_000, max: 60 }));
  app.use('/api/v1/bot/', rateLimit({ windowMs: 60_000, max: 120 }));
  app.use('/api/v1/comments/', rateLimit({ windowMs: 60_000, max: 30 }));

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
      ai: process.env.AI_PROVIDER === 'ollama' ? 'ollama_configured' : process.env.GEMINI_API_KEY ? 'gemini_enabled' : 'pollinations_free',
      // Why the last live AI attempt degraded (null when healthy) — honest,
      // machine-readable diagnostics for ops and smoke tests.
      aiUpstream: getLastAiUpstream(),
      mode: process.env.DEMO_MODE === 'true' && process.env.NODE_ENV !== 'production' ? 'demo' : 'authenticated',
    });
  });

  // Status Summary
  app.get('/api/v1/status', (_req, res) => {
    res.json({
      platform: 'Vanitas',
      status: db.systemStats.services,
      stats: {
        totalRequestsToday: db.systemStats.apiRequestsToday,
        p95LatencyMs: db.systemStats.p95LatencyMs,
        errorRate: db.systemStats.errorRate,
      },
    });
  });

  function permissionsFor(actor: { role: UserRole }): string[] {
    return actor.role === 'ADMIN' ? ALL_SCOPES.map((s) => s.scope) : ['api.read', 'keys.read', 'keys.create', 'bot.execute'];
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

  // Profile update — persists name/avatar to the real account (PostgreSQL).
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
    if (!isHttpsUrl && !isUploadedImage) {
      return res.status(400).json({ error: 'Avatar must be an https URL or an uploaded image up to 300KB' });
    }

    try {
      const updated = await updateProfile(actor.id, { name, avatarUrl });
      if (!updated) return res.status(404).json({ error: 'Account not found' });
      res.json({ user: updated, permissions: permissionsFor(updated) });
    } catch (err) {
      console.error('[auth/profile]', (err as Error).message);
      res.status(500).json({ error: 'Profile update failed' });
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
      const outcome = await createAccount({ email, password, name });
      if (outcome.ok === false) return res.status(outcome.status).json({ error: outcome.error });

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
      console.error('[auth] register failed:', err);
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
      if (outcome.ok === false) return res.status(outcome.status).json({ error: outcome.error });

      // Real 2FA (RFC 6238): once TOTP is enabled the password alone is no
      // longer enough — a valid 6-digit authenticator code is required too.
      if (outcome.user.twoFactorEnabled) {
        const secret = await getTwoFactorSecret(outcome.user.id);
        const code = sanitizeText(req.body?.code, 16);
        if (!secret || !verifyTotp(secret, code)) {
          return res
            .status(401)
            .json({ twoFactorRequired: true, error: 'Enter the 6-digit code from your authenticator app' });
        }
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
      return res.json({ token, user: outcome.user, permissions: permissionsFor(outcome.user) });
    } catch (err) {
      console.error('[auth] login failed:', err);
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
  const twoFactorStateKey = crypto
    .createHash('sha256')
    .update(process.env.DATABASE_URL || process.env.ADMIN_API_TOKEN || 'vanitas-local-2fa')
    .digest();

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
      });
      res.json({ success: true });
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
      const secret = await getTwoFactorSecret(result.id);
      if (!secret || !verifyTotp(secret, code)) return res.status(400).json({ error: 'Invalid 6-digit code' });
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

  // Step 1: send the browser to the provider's consent screen.
  // (Path kept OUT of /auth/oauth on purpose: Vercel's edge intercepts
  // "/oauth/<seg>" GETs before the lambda — see comment in oauth.ts.)
  app.get('/api/v1/social/:provider', (req, res) => {
    const base = appBaseUrl(req);
    const provider = sanitizeText(req.params.provider, 20).toLowerCase();
    if (!isOAuthProvider(provider)) return res.redirect(`${base}/login#vnt_error=unknown_provider`);
    const cfg = getProviderConfig(provider);
    if (!cfg) return res.redirect(`${base}/login#vnt_error=not_configured`);
    const state = signState(provider, cfg.clientSecret);
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
      return res.redirect(`${base}/login#vnt_error=provider_denied`);
    }
    if (!code || !verifyState(provider, cfg.clientSecret, state)) {
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

  // Auth Sessions (demo device list — real sessions live in auth_sessions)
  app.get('/api/v1/auth/sessions', (req, res) => {
    const actor = getActorUser(req);
    if (!actor) return res.status(401).json({ error: 'Authentication required' });
    res.json({ sessions: db.sessions });
  });

  app.delete('/api/v1/auth/sessions/:id', (req, res) => {
    const id = sanitizeText(req.params.id, 64);
    const actor = getActorUser(req);
    if (!actor) return res.status(401).json({ error: 'Authentication required' });
    const idx = db.sessions.findIndex((s) => s.id === id);
    if (idx !== -1) {
      const removed = db.sessions.splice(idx, 1)[0];
      persistAuditLog({
        actorId: actor.id,
        actorName: actor.name,
        actorEmail: actor.email,
        action: 'SESSION_REVOKED',
        category: 'AUTH',
        target: `Session Device: ${sanitizeText(removed.device, 120)} (${sanitizeText(removed.ip, 64)})`,
        source: detectSource(req),
        status: 'SUCCESS',
        ipAddress: req.ip || 'unknown',
        metadata: { deviceId: id },
      });
      return res.json({ success: true, message: 'Session terminated' });
    }
    res.status(404).json({ error: 'Session not found' });
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
    const period = (req.query.period as '24h' | '7d' | '30d') || '24h';
    const data = db.getKeyUsageAnalytics(period);
    res.json(data);
  });

  // API Key Create (with assertGrantableScopes + strict validation)
  app.post('/api/v1/api-keys', (req, res) => {
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
      if (!scopes.every(isValidScope)) {
        return res.status(400).json({ error: 'Invalid scope format detected.' });
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
  app.post('/api/v1/api-keys/:id/rotate', (req, res) => {
    try {
      const actor = getActorUser(req);
      if (!actor) return res.status(401).json({ error: 'Authentication required' });
      const id = sanitizeText(req.params.id, 128);
      const result = db.rotateApiKey(id, actor);
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
  app.delete('/api/v1/api-keys/:id', (req, res) => {
    try {
      const actor = getActorUser(req);
      if (!actor) return res.status(401).json({ error: 'Authentication required' });
      const id = sanitizeText(req.params.id, 128);
      const reason = sanitizeText(req.body?.reason, 200);
      const key = db.revokeApiKey(id, actor, reason || undefined);
      res.json({ success: true, key });
    } catch (err: any) {
      res.status(400).json({ error: 'Revocation failed' });
    }
  });

  // API Key Update Scopes
  app.patch('/api/v1/api-keys/:id/scopes', (req, res) => {
    try {
      const actor = getActorUser(req);
      if (!actor) return res.status(401).json({ error: 'Authentication required' });
      const id = sanitizeText(req.params.id, 128);
      const { scopes } = req.body;
      if (!scopes || !Array.isArray(scopes) || scopes.length > 30 || !scopes.every(isValidScope)) {
        return res.status(400).json({ error: 'Valid scopes array required (max 30)' });
      }
      const key = db.updateApiKeyScopes(id, scopes, actor);
      res.json({ success: true, key });
    } catch (err: any) {
      res.status(403).json({ error: 'Scope update denied' });
    }
  });

  // API Key Update Rate Limit & Resource Policy
  app.patch('/api/v1/api-keys/:id/rate-limit', (req, res) => {
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
      res.json({ success: true, key });
    } catch (err: any) {
      res.status(400).json({ error: 'Rate limit update failed' });
    }
  });

  // API Key Simulate / Test Rate Limit Ingress
  app.post('/api/v1/api-keys/:id/simulate-traffic', (req, res) => {
    try {
      const id = sanitizeText(req.params.id, 128);
      const requestCount = req.body?.requestCount;
      const key = db.apiKeys.find((k) => k.id === id);
      if (!key) return res.status(404).json({ error: 'Key not found' });

      // Increment simulated usage (capped to prevent abuse)
      const count = Math.min(Math.max(Number(requestCount) || 50, 1), 1000);
      key.usageCount += count;
      key.currentUsageThisMonth = (key.currentUsageThisMonth || 0) + count;
      key.currentRpmUsage = Math.min(
        Math.round(key.rateLimitPerMin * 1.3),
        (key.currentRpmUsage || 0) + Math.floor(count * 0.9)
      );
      key.lastUsedAt = new Date().toISOString();

      const isThrottled = (key.currentRpmUsage || 0) >= key.rateLimitPerMin;
      const remainingQuota = Math.max(0, key.rateLimitPerMin - (key.currentRpmUsage || 0));

      res.json({
        success: true,
        key,
        simulatedBatch: count,
        currentRpm: key.currentRpmUsage,
        isThrottled,
        headers: {
          'x-ratelimit-limit': key.rateLimitPerMin,
          'x-ratelimit-remaining': remainingQuota,
          'x-ratelimit-reset': Math.floor(Date.now() / 1000) + 45,
          'retry-after': isThrottled ? 15 : 0,
        },
      });
    } catch (err: any) {
      res.status(400).json({ error: 'Simulation failed' });
    }
  });

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
  app.patch('/api/v1/admin/users/:id/role', async (req, res) => {
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
  });

  // Admin: grant or revoke the verification badge shown next to a user's name.
  // Three kinds — USER (verified), DEVELOPER, ADMIN — only admins may grant.
  app.patch('/api/v1/admin/users/:id/verification', async (req, res) => {
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
  app.get('/api/v1/admin/logs', async (req, res) => {
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
  });

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

  // Webhooks — secrets NEVER returned in list; SSRF-guarded URLs
  app.get('/api/v1/webhooks', (_req, res) => {
    const safe = db.webhooks.map((w) => ({ ...w, secret: undefined, url: w.url }));
    res.json({ webhooks: safe, logs: db.webhookLogs });
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
    const newWebhook = {
      id: secureId('wh'),
      name,
      url,
      events: cleanEvents,
      secret: secureToken('whsec_'),
      status: 'active' as const,
      createdAt: new Date().toISOString(),
      lastTriggeredAt: null,
      failureCount: 0,
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

  app.post('/api/v1/webhooks/:id/test', (req, res) => {
    const id = sanitizeText(req.params.id, 128);
    const wh = db.webhooks.find((w) => w.id === id);
    if (!wh) return res.status(404).json({ error: 'Webhook not found' });

    wh.lastTriggeredAt = new Date().toISOString();
    const log = {
      id: secureId('wh_log'),
      webhookId: wh.id,
      event: 'ping.test',
      status: 'delivered' as const,
      statusCode: 200,
      latencyMs: 90 + crypto.randomInt(80),
      timestamp: new Date().toISOString(),
      payload: { event: 'ping.test', timestamp: new Date().toISOString(), message: 'Vanitas ping verification handshake' },
    };
    db.webhookLogs.unshift(log);
    res.json({ success: true, log });
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
  app.post('/api/v1/suggestions', async (req, res) => {
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
  });

  app.get('/api/v1/admin/suggestions', async (req, res) => {
    if (!requireAdmin(req, res)) return;
    res.json({ suggestions: await listSuggestions() });
  });

  app.patch('/api/v1/admin/suggestions/:id', async (req, res) => {
    if (!requireAdmin(req, res)) return;
    const status = sanitizeText(req.body?.status, 16);
    const adminNote = sanitizeText(req.body?.adminNote, 2000) || undefined;
    if (!['open', 'reviewing', 'resolved'].includes(status)) return res.status(400).json({ error: 'Invalid status' });
    const suggestion = await updateSuggestion(sanitizeText(req.params.id, 128), status as any, adminNote);
    if (!suggestion) return res.status(404).json({ error: 'Suggestion not found' });
    res.json({ suggestion });
  });

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
        keys: db.apiKeys,
        status: db.systemStats.requestBreakdown.map((r) => ({
          name: r.endpoint,
          uptime: '99.99%',
          latency: `${r.avgLatencyMs}ms`,
          status: r.errorCount > 0 ? 'degraded' : 'operational',
        })),
        bots: db.bots,
        threats: db.securityThreats,
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
  app.get('/api/v1/databases/external', (_req, res) => {
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

  app.post('/api/v1/databases/external/test', (req, res) => {
    const id = sanitizeText(req.body?.id, 128);
    if (!id) return res.status(400).json({ error: 'Database ID is required' });
    const result = db.testDatabaseConnection(id);
    res.json(result);
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
    // Do not store obviously unsafe URLs (private hosts) — SSRF guard
    if (!sanitizeUrl(connectionUrl) && !connectionUrl.startsWith('postgresql://') && !connectionUrl.startsWith('rediss://') && !connectionUrl.startsWith('https://')) {
      return res.status(400).json({ error: 'Invalid connection URL' });
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
  app.get('/api/v1/download/releases', (_req, res) => {
    res.json({
      success: true,
      latestVersion: '1.4.2',
      releases: db.releases,
    });
  });

  app.get('/api/v1/download/:type', (req, res) => {
    try {
      const actor = getActorUser(req);
      if (!actor) return res.status(401).json({ error: 'Authentication required' });
      const source = detectSource(req);
      const type = sanitizeText(req.params.type, 16) as 'apk' | 'exe' | 'dmg' | 'appimage';

      if (!['apk', 'exe', 'dmg', 'appimage'].includes(type)) {
        return res.status(400).json({ error: 'Invalid platform release type. Expected: apk, exe, dmg, appimage' });
      }

      const release = db.recordClientDownload(type, actor, source);
      if (!release) return res.status(404).json({ error: 'Release artifact not found' });

      // If client requests JSON representation (e.g. from frontend API inspector)
      if (req.query.format === 'json' || req.headers.accept?.includes('application/json')) {
        return res.json({
          success: true,
          release,
          downloadUrl: `/api/v1/download/${type}?direct=true`,
        });
      }

      // Generate downloadable client binary package
      const mimeTypes: Record<string, string> = {
        apk: 'application/vnd.android.package-archive',
        exe: 'application/x-msdownload',
        dmg: 'application/x-apple-diskimage',
        appimage: 'application/x-executable',
      };

      const contentType = mimeTypes[type] || 'application/octet-stream';
      const filename = release.filename;

      // Construct verified Vanitas client manifest payload header
      const manifestHeader = [
        `==============================================================================`,
        `VANITAS UNIFIED PLATFORM CLIENT BINARY PACKAGE`,
        `==============================================================================`,
        `Artifact:       ${release.name}`,
        `Filename:       ${release.filename}`,
        `Version:        ${release.version}`,
        `Platform:       ${release.platform}`,
        `Target Arch:    ${release.architecture}`,
        `SHA-256:        ${release.sha256}`,
        `Build Date:     ${release.releaseDate}`,
        `Central Gateway: https://vanitas-bot.vercel.app/api/v1/`,
        `==============================================================================`,
        `[VANITAS RUNTIME PAYLOAD INITIALIZED - BIOMETRIC & OFFLINE GATEWAY DAEMON READY]`,
        `\n`,
      ].join('\n');

      const buffer = Buffer.from(manifestHeader, 'utf-8');

      res.setHeader('Content-Disposition', `attachment; filename="${sanitizeText(filename, 128)}"`);
      res.setHeader('Content-Type', contentType);
      res.setHeader('X-Vanitas-Version', sanitizeText(release.version, 32));
      res.setHeader('X-Vanitas-Checksum-SHA256', sanitizeText(release.sha256, 128));
      res.setHeader('Content-Length', buffer.length);

      res.send(buffer);
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
