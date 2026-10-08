import crypto from 'crypto';
import { databasePool, ensureSchema } from './pg.ts';
import { secureToken, secureId } from './security.ts';

// ---------------------------------------------------------------------------
// Vanitas as an OAuth 2.0 AUTHORIZATION SERVER (provider).
//
// Third-party applications register here, then send their users through
// the real authorization-code flow (with PKCE) to authenticate against
// Vanitas and come back with an access token for the user's profile.
//
// Storage: PostgreSQL when DATABASE_URL is set, in-memory otherwise
// (process-local, resets on restart — like every other memory-mode
// store). NEVER seeded: a fresh install starts with zero apps.
//
// Secrets at rest:
//   client secrets  → scrypt hashes (like user passwords)
//   auth codes      → sha256 hashes, single-use, 10-minute TTL
//   access tokens   → sha256 hashes, 1-hour TTL, revocable
// A database dump alone can never mint a working credential.
// ---------------------------------------------------------------------------

export interface OAuthApp {
  id: string;
  ownerId: string;
  name: string;
  clientId: string;
  /** Public client (SPA/mobile): no secret exists, PKCE is mandatory. */
  isPublic: boolean;
  redirectUris: string[];
  scopes: string[];
  createdAt: string;
}

interface OAuthCode {
  codeHash: string;
  appId: string;
  userId: string;
  redirectUri: string;
  scopes: string[];
  codeChallenge: string | null;
  codeChallengeMethod: 'plain' | 's256';
  expiresAt: string;
  used: boolean;
}

interface OAuthAccessToken {
  tokenHash: string;
  appId: string;
  userId: string;
  scopes: string[];
  expiresAt: string;
  createdAt: string;
  revoked: boolean;
}

/** Scopes a registered app may request. `profile` is the identity
 *  basics; `email` adds the verified account address. */
export const OAUTH_SCOPES = ['profile', 'email'] as const;
export type OAuthScope = (typeof OAUTH_SCOPES)[number];

export function isKnownOAuthScope(value: string): value is OAuthScope {
  return (OAUTH_SCOPES as readonly string[]).includes(value);
}

export const AUTH_CODE_TTL_MS = 10 * 60 * 1000;
export const ACCESS_TOKEN_TTL_MS = 60 * 60 * 1000;

const memoryApps: OAuthApp[] = [];
const memoryCodes: OAuthCode[] = [];
const memoryTokens: OAuthAccessToken[] = [];

const iso = (v: unknown): string =>
  v instanceof Date ? v.toISOString() : String(v || new Date().toISOString());

function mapAppRow(row: Record<string, any>): OAuthApp {
  const redirectUris = Array.isArray(row.redirect_uris) ? row.redirect_uris : [];
  const scopes = Array.isArray(row.scopes) ? row.scopes : ['profile'];
  return {
    id: row.id,
    ownerId: row.owner_id,
    name: row.name,
    clientId: row.client_id,
    isPublic: !!row.is_public,
    redirectUris: redirectUris.map(String),
    scopes: scopes.map(String),
    createdAt: iso(row.created_at),
  };
}

// ---- scrypt hashing for client secrets (same cost as passwords) ----

function scryptAsync(password: string, salt: Buffer, keylen: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, keylen, { N: 16384, r: 8, p: 1 }, (err, key) => {
      if (err) reject(err);
      else resolve(key);
    });
  });
}

async function hashClientSecret(secret: string): Promise<string> {
  const salt = crypto.randomBytes(16);
  const key = await scryptAsync(secret, salt, 64);
  return `scrypt$16384$8$1$${salt.toString('base64')}$${key.toString('base64')}`;
}

async function verifyClientSecret(secret: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const N = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  if (![N, r, p].every((n) => Number.isFinite(n) && n > 0)) return false;
  let salt: Buffer;
  let expected: Buffer;
  try {
    salt = Buffer.from(parts[4], 'base64');
    expected = Buffer.from(parts[5], 'base64');
  } catch {
    return false;
  }
  const actual = await scryptAsync(secret, salt, expected.length);
  const a = Buffer.from(actual);
  const b = Buffer.from(expected);
  if (a.length !== b.length || a.length === 0) return false;
  return crypto.timingSafeEqual(a, b);
}

const sha256Hex = (value: string) => crypto.createHash('sha256').update(value).digest('hex');

// Opportunistic hygiene: used/expired codes and spent tokens would
// otherwise accumulate forever (arrays in memory mode, rows in PG).
// Sweeps every 100th mint; on PostgreSQL it is fire-and-forget so the
// minting request never waits on it.
let sinceSweep = 0;
function sweepExpiredOAuthRows(): void {
  if (++sinceSweep < 100) return;
  sinceSweep = 0;
  if (!databasePool) {
    const now = Date.now();
    for (let i = memoryCodes.length - 1; i >= 0; i--) {
      const c = memoryCodes[i];
      if (c.used || Date.parse(c.expiresAt) <= now) memoryCodes.splice(i, 1);
    }
    // Tokens are kept a week past expiry for audit/debugging, then dropped.
    const cutoff = now - 7 * 24 * 60 * 60 * 1000;
    for (let i = memoryTokens.length - 1; i >= 0; i--) {
      if (Date.parse(memoryTokens[i].expiresAt) < cutoff) memoryTokens.splice(i, 1);
    }
    return;
  }
  void databasePool
    .query("delete from public.oauth_codes where expires_at < now() - interval '1 day'")
    .catch(() => undefined);
  void databasePool
    .query("delete from public.oauth_tokens where expires_at < now() - interval '7 days'")
    .catch(() => undefined);
}

/** Validates an OAuth 2.0 redirect URI.
 *  Rules (RFC 6749 §7 + RFC 8252):
 *  - https only — an authorization code must never travel in clear text;
 *  - loopback (localhost / 127.0.0.1 / [::1], any port) may use plain http
 *    so native and local-development apps can receive callbacks (RFC 8252);
 *  - no fragments, no embedded credentials;
 *  - never a private, link-local or otherwise reserved host (an app must
 *    not redirect codes into someone's local network). */
export function isValidRedirectUri(value: string): boolean {
  if (typeof value !== 'string' || value.length > 2048) return false;
  let u: URL;
  try {
    u = new URL(value);
  } catch {
    return false;
  }
  if (u.username || u.password || u.hash) return false;
  const host = u.hostname.toLowerCase();
  // URL.hostname keeps the brackets around IPv6 literals: '[::1]'.
  const isLoopback =
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host === '127.0.0.1' ||
    host === '[::1]';
  if (isLoopback) return u.protocol === 'http:' || u.protocol === 'https:';
  if (u.protocol !== 'https:') return false;
  if (/^10\.|^172\.(1[6-9]|2\d|3[01])\.|^192\.168\./.test(host)) return false;
  if (/^169\.254\.|^127\.|^0\.|^100\.6[4-9]\.|^100\.(7\d|8\d|9\d|1[01]\d|2[0-6]\d)\.|^22[4-9]\.|^23\d\./.test(host)) return false;
  return true;
}

// ---------------------------------------------------------------------------
// App registry
// ---------------------------------------------------------------------------

export async function createOAuthApp(params: {
  ownerId: string;
  name: string;
  redirectUris: string[];
  scopes: string[];
  isPublic?: boolean;
}): Promise<{ app: OAuthApp; clientSecret: string | null }> {
  const isPublic = params.isPublic === true;
  const app: OAuthApp = {
    id: secureId('oa'),
    ownerId: params.ownerId,
    name: params.name,
    clientId: secureToken('vnt_oa_', 18),
    isPublic,
    redirectUris: params.redirectUris,
    scopes: params.scopes,
    createdAt: new Date().toISOString(),
  };
  // Confidential: the plaintext secret exists exactly once — here.
  // Public (SPA/mobile): NO secret is ever minted; the app authenticates
  // with client_id + PKCE alone, because a shipped binary can't hide one.
  const clientSecret = isPublic ? null : secureToken('vnt_oa_sec_', 30);

  if (!databasePool) {
    memoryApps.push(app);
    memoryApps.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
    // Memory mode keeps the plaintext secret process-local only
    // (nothing is written anywhere) — PG mode hashes at rest.
    if (clientSecret) memorySecrets.set(app.clientId, clientSecret);
    return { app, clientSecret };
  }
  await ensureSchema();
  const secretHash = clientSecret ? await hashClientSecret(clientSecret) : '';
  await databasePool.query(
    `insert into public.oauth_apps
       (id, owner_id, name, client_id, client_secret_hash, is_public, redirect_uris, scopes)
     values ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [app.id, app.ownerId, app.name, app.clientId, secretHash, isPublic, app.redirectUris, app.scopes],
  );
  return { app, clientSecret };
}

export async function listOAuthApps(ownerId: string): Promise<OAuthApp[]> {
  if (!databasePool) {
    return memoryApps.filter((a) => a.ownerId === ownerId);
  }
  await ensureSchema();
  const r = await databasePool.query(
    'select id, owner_id, name, client_id, redirect_uris, scopes, created_at from public.oauth_apps where owner_id = $1 order by created_at desc',
    [ownerId],
  );
  return r.rows.map(mapAppRow);
}

/** Public app record by client_id (never the secret hash). */
export async function lookupOAuthApp(clientId: string): Promise<OAuthApp | null> {
  const app = await findAppByClientId(clientId);
  if (!app) return null;
  return {
    id: app.id,
    ownerId: app.ownerId,
    name: app.name,
    clientId: app.clientId,
    isPublic: app.isPublic,
    redirectUris: app.redirectUris,
    scopes: app.scopes,
    createdAt: app.createdAt,
  };
}

export async function deleteOAuthApp(id: string, ownerId: string): Promise<boolean> {
  if (!databasePool) {
    const i = memoryApps.findIndex((a) => a.id === id && a.ownerId === ownerId);
    if (i === -1) return false;
    memorySecrets.delete(memoryApps[i].clientId);
    memoryApps.splice(i, 1);
    // Codes and tokens die with the app (PG cascades via FK).
    for (let j = memoryCodes.length - 1; j >= 0; j--) {
      if (memoryCodes[j].appId === id) memoryCodes.splice(j, 1);
    }
    for (let j = memoryTokens.length - 1; j >= 0; j--) {
      if (memoryTokens[j].appId === id) memoryTokens.splice(j, 1);
    }
    return true;
  }
  await ensureSchema();
  const r = await databasePool.query(
    'delete from public.oauth_apps where id = $1 and owner_id = $2 returning id',
    [id, ownerId],
  );
  return r.rowCount === 1;
}

interface AppCredentials extends OAuthApp {
  secretHash: string;
}

async function findAppByClientId(clientId: string): Promise<AppCredentials | null> {
  if (!clientId || clientId.length > 128) return null;
  if (!databasePool) {
    const app = memoryApps.find((a) => a.clientId === clientId) || null;
    return app ? { ...app, secretHash: '' } : null;
  }
  await ensureSchema();
  const r = await databasePool.query(
    'select * from public.oauth_apps where client_id = $1',
    [clientId],
  );
  const row = r.rows[0];
  return row ? { ...mapAppRow(row), secretHash: String(row.client_secret_hash || '') } : null;
}

export async function authenticateClient(
  clientId: string,
  clientSecret: string,
): Promise<OAuthApp | null> {
  const app = await findAppByClientId(clientId);
  if (!app) return null;
  if (!clientSecret) return null;
  if (!databasePool) {
    // Memory mode keeps the plaintext secret process-local (see
    // createOAuthApp). Compare digests with timingSafeEqual so the
    // comparison itself leaks nothing about the stored secret.
    const expected = memorySecrets.get(app.clientId);
    if (!expected) return null;
    const a = crypto.createHash('sha256').update(clientSecret).digest();
    const b = crypto.createHash('sha256').update(expected).digest();
    return crypto.timingSafeEqual(a, b) ? app : null;
  }
  if (!app.secretHash) return null; // public client — no secret exists
  const ok = await verifyClientSecret(clientSecret, app.secretHash);
  return ok ? app : null;
}

// Memory-mode secret bookkeeping (PG hashes at rest).
const memorySecrets = new Map<string, string>();

// ---------------------------------------------------------------------------
// Authorization codes — single-use, hashed, short-lived
// ---------------------------------------------------------------------------

export async function createAuthorizationCode(params: {
  appId: string;
  userId: string;
  redirectUri: string;
  scopes: string[];
  codeChallenge: string | null;
  codeChallengeMethod: 'plain' | 's256';
}): Promise<string> {
  const code = secureToken('vnt_code_', 30);
  const record: OAuthCode = {
    codeHash: sha256Hex(code),
    appId: params.appId,
    userId: params.userId,
    redirectUri: params.redirectUri,
    scopes: params.scopes,
    codeChallenge: params.codeChallenge,
    codeChallengeMethod: params.codeChallengeMethod,
    expiresAt: new Date(Date.now() + AUTH_CODE_TTL_MS).toISOString(),
    used: false,
  };
  sweepExpiredOAuthRows();
  if (!databasePool) {
    memoryCodes.push(record);
    return code;
  }
  await ensureSchema();
  await databasePool.query(
    `insert into public.oauth_codes
       (code_hash, app_id, user_id, redirect_uri, scopes, code_challenge, code_challenge_method, expires_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      record.codeHash,
      record.appId,
      record.userId,
      record.redirectUri,
      record.scopes,
      record.codeChallenge,
      record.codeChallengeMethod,
      record.expiresAt,
    ],
  );
  return code;
}

/** Consume a code exactly once: hash-lookup, verify unused +
 *  unexpired, and flip `used` in the same atomic statement so two
 *  racing exchanges can never both succeed. */
export async function consumeAuthorizationCode(
  rawCode: string,
): Promise<OAuthCode | null> {
  if (!rawCode || rawCode.length > 256) return null;
  const hash = sha256Hex(rawCode);
  if (!databasePool) {
    const record = memoryCodes.find((c) => c.codeHash === hash) || null;
    if (!record || record.used || Date.parse(record.expiresAt) <= Date.now()) return null;
    record.used = true;
    return record;
  }
  await ensureSchema();
  const r = await databasePool.query(
    `update public.oauth_codes set used = true
     where code_hash = $1 and used = false and expires_at > now()
     returning *`,
    [hash],
  );
  const row = r.rows[0];
  if (!row) return null;
  return {
    codeHash: row.code_hash,
    appId: row.app_id,
    userId: row.user_id,
    redirectUri: row.redirect_uri,
    scopes: (Array.isArray(row.scopes) ? row.scopes : []).map(String),
    codeChallenge: row.code_challenge || null,
    codeChallengeMethod: row.code_challenge_method === 's256' ? 's256' : 'plain',
    expiresAt: iso(row.expires_at),
    used: true,
  };
}

// ---------------------------------------------------------------------------
// Access tokens — hashed, TTL'd, revocable
// ---------------------------------------------------------------------------

export async function createAccessToken(params: {
  appId: string;
  userId: string;
  scopes: string[];
}): Promise<string> {
  const token = secureToken('vnt_at_', 30);
  const nowIso = new Date().toISOString();
  const record: OAuthAccessToken = {
    tokenHash: sha256Hex(token),
    appId: params.appId,
    userId: params.userId,
    scopes: params.scopes,
    expiresAt: new Date(Date.now() + ACCESS_TOKEN_TTL_MS).toISOString(),
    createdAt: nowIso,
    revoked: false,
  };
  sweepExpiredOAuthRows();
  if (!databasePool) {
    memoryTokens.push(record);
    return token;
  }
  await ensureSchema();
  await databasePool.query(
    `insert into public.oauth_tokens (token_hash, app_id, user_id, scopes, expires_at)
     values ($1, $2, $3, $4, $5)`,
    [record.tokenHash, record.appId, record.userId, record.scopes, record.expiresAt],
  );
  return token;
}

export async function resolveAccessToken(rawToken: string): Promise<OAuthAccessToken | null> {
  if (!rawToken || rawToken.length > 256) return null;
  const hash = sha256Hex(rawToken);
  if (!databasePool) {
    const record = memoryTokens.find((t) => t.tokenHash === hash) || null;
    if (!record || record.revoked || Date.parse(record.expiresAt) <= Date.now()) return null;
    return record;
  }
  await ensureSchema();
  const r = await databasePool.query(
    'select * from public.oauth_tokens where token_hash = $1 and revoked = false and expires_at > now()',
    [hash],
  );
  const row = r.rows[0];
  if (!row) return null;
  return {
    tokenHash: row.token_hash,
    appId: row.app_id,
    userId: row.user_id,
    scopes: (Array.isArray(row.scopes) ? row.scopes : []).map(String),
    expiresAt: iso(row.expires_at),
    createdAt: iso(row.created_at),
    revoked: false,
  };
}

export async function revokeAccessToken(rawToken: string): Promise<boolean> {
  if (!rawToken || rawToken.length > 256) return false;
  const hash = sha256Hex(rawToken);
  if (!databasePool) {
    const record = memoryTokens.find((t) => t.tokenHash === hash);
    if (!record) return false;
    record.revoked = true;
    return true;
  }
  await ensureSchema();
  const r = await databasePool.query(
    'update public.oauth_tokens set revoked = true where token_hash = $1 returning token_hash',
    [hash],
  );
  return r.rowCount === 1;
}

/** Sweep an account's apps/codes/tokens — memory mode only
 *  (PostgreSQL cascades via FK on users.id). */
export function purgeOAuthAppData(ownerId: string): void {
  if (databasePool) return;
  const appIds = new Set(memoryApps.filter((a) => a.ownerId === ownerId).map((a) => a.id));
  for (const a of memoryApps.filter((a) => a.ownerId === ownerId)) memorySecrets.delete(a.clientId);
  for (let i = memoryApps.length - 1; i >= 0; i--) {
    if (memoryApps[i].ownerId === ownerId) memoryApps.splice(i, 1);
  }
  for (let i = memoryCodes.length - 1; i >= 0; i--) {
    if (appIds.has(memoryCodes[i].appId) || memoryCodes[i].userId === ownerId) memoryCodes.splice(i, 1);
  }
  for (let i = memoryTokens.length - 1; i >= 0; i--) {
    if (appIds.has(memoryTokens[i].appId) || memoryTokens[i].userId === ownerId) memoryTokens.splice(i, 1);
  }
}

// ---------------------------------------------------------------------------
// User-facing grants — "which apps can touch my account, and revoke them"
// ---------------------------------------------------------------------------

export interface UserGrant {
  appId: string;
  name: string;
  clientId: string;
  isPublic: boolean;
  scopes: string[];
  /** Newest token issued for this app. */
  grantedAt: string;
  /** Expiry of the newest token. */
  expiresAt: string;
  activeTokens: number;
}

/** Every app with at least one active (unrevoked, unexpired) token for
 *  this user, scopes unioned across their live tokens, newest first.
 *  This is what powers the "Authorized apps" review screen — a user must
 *  always be able to see and withdraw every grant they ever made. */
export async function listUserGrants(userId: string): Promise<UserGrant[]> {
  const byApp = new Map<string, UserGrant>();
  const absorb = (
    appId: string,
    name: string,
    clientId: string,
    isPublic: boolean,
    scopes: string[],
    grantedAt: string,
    expiresAt: string,
  ) => {
    let grant = byApp.get(appId);
    if (!grant) {
      grant = { appId, name, clientId, isPublic, scopes: [], grantedAt, expiresAt, activeTokens: 0 };
      byApp.set(appId, grant);
    }
    for (const s of scopes) if (!grant.scopes.includes(s)) grant.scopes.push(s);
    if (grantedAt > grant.grantedAt) grant.grantedAt = grantedAt;
    if (expiresAt > grant.expiresAt) grant.expiresAt = expiresAt;
    grant.activeTokens += 1;
  };

  if (!databasePool) {
    const now = Date.now();
    for (const t of memoryTokens) {
      if (t.userId !== userId || t.revoked || Date.parse(t.expiresAt) <= now) continue;
      const app = memoryApps.find((a) => a.id === t.appId);
      if (!app) continue;
      absorb(app.id, app.name, app.clientId, app.isPublic, t.scopes, t.createdAt, t.expiresAt);
    }
    return Array.from(byApp.values()).sort((a, b) => (a.grantedAt < b.grantedAt ? 1 : -1));
  }
  await ensureSchema();
  const r = await databasePool.query(
    `select t.scopes, t.expires_at, t.created_at,
            a.id as app_id, a.name, a.client_id, a.is_public
       from public.oauth_tokens t
       join public.oauth_apps a on a.id = t.app_id
      where t.user_id = $1 and t.revoked = false and t.expires_at > now()
      order by t.created_at desc`,
    [userId],
  );
  for (const row of r.rows) {
    absorb(
      row.app_id,
      row.name,
      row.client_id,
      !!row.is_public,
      (Array.isArray(row.scopes) ? row.scopes : []).map(String),
      iso(row.created_at),
      iso(row.expires_at),
    );
  }
  return Array.from(byApp.values());
}

/** Revoke every active token this user granted to one app.
 *  Returns how many tokens died. */
export async function revokeUserGrants(userId: string, appId: string): Promise<number> {
  if (!databasePool) {
    let n = 0;
    for (const t of memoryTokens) {
      if (t.userId === userId && t.appId === appId && !t.revoked) {
        t.revoked = true;
        n += 1;
      }
    }
    return n;
  }
  await ensureSchema();
  const r = await databasePool.query(
    'update public.oauth_tokens set revoked = true where user_id = $1 and app_id = $2 and revoked = false returning token_hash',
    [userId, appId],
  );
  return r.rowCount ?? 0;
}

/** Withdraw every grant at once ("sign out of all connected apps"). */
export async function revokeAllUserGrants(userId: string): Promise<number> {
  if (!databasePool) {
    let n = 0;
    for (const t of memoryTokens) {
      if (t.userId === userId && !t.revoked) {
        t.revoked = true;
        n += 1;
      }
    }
    return n;
  }
  await ensureSchema();
  const r = await databasePool.query(
    'update public.oauth_tokens set revoked = true where user_id = $1 and revoked = false returning token_hash',
    [userId],
  );
  return r.rowCount ?? 0;
}

// ---------------------------------------------------------------------------
// PKCE (RFC 7636)
// ---------------------------------------------------------------------------

export function verifyPkce(
  verifier: string | null,
  challenge: string | null,
  method: 'plain' | 's256',
): boolean {
  if (!challenge) return true; // PKCE optional for confidential clients
  if (!verifier || verifier.length < 43 || verifier.length > 128) return false;
  if (!/^[A-Za-z0-9\-._~]+$/.test(verifier)) return false;
  if (method === 's256') {
    const expected = crypto.createHash('sha256').update(verifier).digest('base64url');
    const a = Buffer.from(expected);
    const b = Buffer.from(challenge);
    if (a.length !== b.length || a.length === 0) return false;
    return crypto.timingSafeEqual(a, b);
  }
  const a = Buffer.from(verifier);
  const b = Buffer.from(challenge);
  if (a.length !== b.length || a.length === 0) return false;
  return crypto.timingSafeEqual(a, b);
}

export function computeS256Challenge(verifier: string): string {
  return crypto.createHash('sha256').update(verifier).digest('base64url');
}

// Memory-mode plaintext secret registry (never persisted).
export function rememberMemorySecret(clientId: string, secret: string): void {
  if (!databasePool) memorySecrets.set(clientId, secret);
}

export function memorySecretFor(clientId: string): string | undefined {
  return memorySecrets.get(clientId);
}
