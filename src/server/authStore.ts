import crypto from 'crypto';
import { databasePool } from './pg.ts';
import { db } from './db.ts';
import { secureId } from './security.ts';
import type { User, UserRole, PublicProfile } from '../types.ts';

// ---------------------------------------------------------------------------
// Real account authentication.
// - Passwords: scrypt (node:crypto — no native deps, safe on Vercel lambdas)
// - Sessions: random bearer tokens, stored ONLY as sha256 hashes
// - Storage: PostgreSQL (public.users / public.auth_sessions) when DATABASE_URL
//   is configured, otherwise an in-memory fallback that resets on cold start.
// ---------------------------------------------------------------------------

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const RESOLVE_CACHE_TTL_MS = 60_000; // DB-mode lookup cache
const DEFAULT_AVATAR = '/images/avatar-default.svg';

export type AuthOutcome = { ok: true; user: User } | { ok: false; status: number; error: string };

/**
 * ADMIN if the email is listed in ADMIN_EMAILS; otherwise USER — except the
 * very first account on a fresh database, which bootstraps as ADMIN.
 * Shared by password registration and OAuth sign-in.
 */
async function pickInitialRole(email: string): Promise<UserRole> {
  if (isAdminEmail(email)) return 'ADMIN';
  if (databasePool) {
    const count = await databasePool.query('select count(*)::int as n from public.users');
    if ((count.rows[0]?.n ?? 0) === 0) return 'ADMIN';
  } else if (db.users.length === 0) {
    // In-memory mode mirrors PostgreSQL: the very first account bootstraps
    // as ADMIN so a fresh install always has an owner.
    return 'ADMIN';
  }
  return 'USER';
}

// ---- password hashing -----------------------------------------------------

function scryptAsync(password: string, salt: Buffer, keylen: number, opts: { N: number; r: number; p: number }): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    crypto.scrypt(
      password.normalize('NFKC'),
      salt,
      keylen,
      { N: opts.N, r: opts.r, p: opts.p, maxmem: 128 * 1024 * 1024 },
      (err, key) => (err ? reject(err) : resolve(key)),
    );
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16);
  const key = await scryptAsync(password, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$16384$8$1$${salt.toString('base64')}$${key.toString('base64')}`;
}

export async function verifyPassword(password: string, stored: string | null | undefined): Promise<boolean> {
  if (!stored) return false;
  try {
    const parts = stored.split('$');
    if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
    const N = Number(parts[1]);
    const r = Number(parts[2]);
    const p = Number(parts[3]);
    if (!Number.isInteger(N) || !Number.isInteger(r) || !Number.isInteger(p) || N < 1024 || N > 1 << 20) return false;
    const salt = Buffer.from(parts[4], 'base64');
    const expected = Buffer.from(parts[5], 'base64');
    if (salt.length < 8 || expected.length < 32) return false;
    const actual = await scryptAsync(password, salt, expected.length, { N, r, p });
    return crypto.timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

/** Constant-ish work when the email is unknown (anti user-enumeration). */
let dummyHashPromise: Promise<string> | null = null;
async function burnPasswordTime(password: string): Promise<void> {
  if (!dummyHashPromise) dummyHashPromise = hashPassword(crypto.randomBytes(16).toString('hex'));
  await verifyPassword(password, await dummyHashPromise);
}

// ---- helpers --------------------------------------------------------------

function isAdminEmail(email: string): boolean {
  const list = (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return list.includes(email.toLowerCase());
}

// ---------------------------------------------------------------------------
// Public @username identity — lowercase, [a-z0-9_]{3,24}, never a route or
// impersonation word. Auto-generated at signup and claimable/editable later
// from the profile (PATCH /auth/profile).
// ---------------------------------------------------------------------------
export const RESERVED_USERNAMES = new Set([
  'admin', 'administrator', 'root', 'moderator', 'mod', 'staff', 'system',
  'official', 'vanitas', 'api', 'bot', 'support', 'help', 'me', 'settings',
  'login', 'register', 'invite', 'auth', 'dashboard', 'profile', 'profiles',
  'user', 'null', 'undefined', 'security', 'billing', 'legal', 'tos',
  'privacy', 'docs', 'playground', 'console', 'home', 'you',
]);

/** Returns a human-readable reason the username cannot be used, or null. */
export function usernameValidationError(raw: string): string | null {
  const u = raw.trim().toLowerCase();
  if (u.length < 3 || u.length > 24) return 'Username must be between 3 and 24 characters';
  if (!/^[a-z0-9_]+$/.test(u)) return 'Username may only contain letters, numbers and underscores';
  if (RESERVED_USERNAMES.has(u)) return 'That username is reserved';
  return null;
}

function usernameBaseFromEmail(email: string): string {
  return (email.split('@')[0] || 'user').toLowerCase().replace(/[^a-z0-9_]/g, '_').slice(0, 22) || 'user';
}

function usernameFromEmail(email: string, isTaken: (u: string) => boolean): string {
  const base = usernameBaseFromEmail(email);
  let candidate = base;
  let i = 1;
  while (isTaken(candidate) || RESERVED_USERNAMES.has(candidate)) {
    candidate = `${base.slice(0, 21)}${++i}`;
  }
  return candidate;
}

/**
 * PostgreSQL signup path: the synchronous in-memory uniqueness check cannot
 * see existing rows, so pick a username that is actually free (same algorithm
 * as usernameFromEmail: base, then base2, base3…). Fixes duplicate usernames
 * when two accounts share an email local part (a@x.com vs a@y.com).
 */
async function uniqueUsernameFromEmailPg(email: string): Promise<string> {
  const base = usernameBaseFromEmail(email);
  let candidate = base;
  let i = 1;
  while (i < 60) {
    const hit = await databasePool!.query('select 1 from public.users where lower(username) = $1', [candidate]);
    if (!hit.rowCount && !RESERVED_USERNAMES.has(candidate)) return candidate;
    candidate = `${base.slice(0, 21)}${++i}`;
  }
  return `${base.slice(0, 14)}_${Date.now().toString(36)}`;
}

/** Case-insensitive uniqueness check (optionally ignoring one account). */
export async function isUsernameTaken(username: string, exceptUserId?: string): Promise<boolean> {
  const u = username.trim().toLowerCase();
  if (databasePool) {
    const r = await databasePool.query(
      'select 1 from public.users where lower(username) = $1 and id <> $2',
      [u, exceptUserId || ''],
    );
    return !!r.rowCount;
  }
  return db.users.some((x) => (x.username || '').toLowerCase() === u && x.id !== exceptUserId);
}

export function rowToUser(row: Record<string, any>): User {
  const iso = (v: any) => (v instanceof Date ? v.toISOString() : v || undefined);
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    username: row.username || '',
    avatarUrl: row.avatar_url || DEFAULT_AVATAR,
    bio: row.bio || undefined,
    role: row.role === 'ADMIN' ? 'ADMIN' : 'USER',
    verification: ['USER', 'DEVELOPER', 'ADMIN'].includes(row.verification) ? row.verification : '',
    twoFactorEnabled: !!row.two_factor_enabled,
    createdAt: iso(row.created_at) || new Date().toISOString(),
    lastLoginAt: iso(row.last_login_at) || iso(row.created_at) || new Date().toISOString(),
    connectedAccounts: row.connected_accounts || { google: false, github: false, discord: false },
  };
}

/** In-memory password store used when DATABASE_URL is not configured. */
const memoryPasswords = new Map<string, { userId: string; hash: string }>();
const memorySessions = new Map<string, { userId: string; expiresAt: number }>();
/** Short-lived cache so a session token costs one map lookup per request. */
const resolveCache = new Map<string, { user: User | null; until: number }>();

// ---- accounts -------------------------------------------------------------

export async function createAccount(params: { email: string; password: string; name: string }): Promise<AuthOutcome> {
  const email = params.email.trim().toLowerCase();
  const passwordHash = await hashPassword(params.password);
  const role = await pickInitialRole(email);

  if (databasePool) {
    try {
      const existing = await databasePool.query('select 1 from public.users where lower(email) = $1', [email]);
      if (existing.rowCount) return { ok: false, status: 409, error: 'An account with this email already exists' };

      const id = secureId('usr');
      const username = await uniqueUsernameFromEmailPg(email);
      const result = await databasePool.query(
        `insert into public.users (id, email, name, username, avatar_url, role, password_hash, created_at, last_login_at)
         values ($1, lower($2), $3, $4, $5, $6, $7, now(), now())
         returning *`,
        [id, email, params.name, username, DEFAULT_AVATAR, role, passwordHash],
      );
      return { ok: true, user: rowToUser(result.rows[0]) };
    } catch (err: any) {
      if (err?.code === '23505') return { ok: false, status: 409, error: 'An account with this email already exists' };
      if (err?.code === '42P01' || err?.code === '42703') {
        throw new Error('users table missing — run: npm run db:migrate (supabase/schema.sql)');
      }
      throw err;
    }
  }

  // In-memory fallback
  if (db.users.some((u) => u.email.toLowerCase() === email)) {
    return { ok: false, status: 409, error: 'An account with this email already exists' };
  }
  const user: User = {
    id: secureId('usr'),
    email,
    name: params.name,
    username: usernameFromEmail(email, (u) => db.users.some((x) => x.username === u)),
    avatarUrl: DEFAULT_AVATAR,
    role,
    verification: '',
    twoFactorEnabled: false,
    createdAt: new Date().toISOString(),
    lastLoginAt: new Date().toISOString(),
    connectedAccounts: { google: false, github: false, discord: false },
  };
  db.users.push(user);
  memoryPasswords.set(email, { userId: user.id, hash: passwordHash });
  return { ok: true, user };
}

// A session's cached user must not outlive profile edits made to the
// account — drop every cached resolution that points at this user.
export function invalidateResolveCache(userId: string): void {
  for (const [key, rec] of resolveCache) {
    if (rec.user?.id === userId) resolveCache.delete(key);
  }
}

// Persist real profile edits to the account record: display name + avatar,
// plus the claimable @username and bio when provided (undefined = unchanged).
export async function updateProfile(
  userId: string,
  updates: { name: string; avatarUrl: string; username?: string; bio?: string },
): Promise<User | null> {
  if (databasePool) {
    const result = await databasePool.query(
      `update public.users
          set name = $2,
              avatar_url = $3,
              username = coalesce($4, username),
              bio = coalesce($5, bio)
        where id = $1
        returning *`,
      [userId, updates.name, updates.avatarUrl, updates.username ?? null, updates.bio ?? null],
    );
    const user = result.rows[0] ? rowToUser(result.rows[0]) : null;
    if (user) invalidateResolveCache(userId); // /auth/me must reflect fresh edits
    return user;
  }

  const user = db.users.find((u) => u.id === userId);
  if (!user) return null;
  user.name = updates.name;
  user.avatarUrl = updates.avatarUrl || DEFAULT_AVATAR;
  if (updates.username !== undefined) user.username = updates.username;
  if (updates.bio !== undefined) user.bio = updates.bio || undefined;
  invalidateResolveCache(userId);
  return user;
}

/** Public, shareable profile for /u/<username> — no email, no internal ids. */
export async function findPublicProfile(username: string): Promise<PublicProfile | null> {
  const u = username.trim().toLowerCase();
  let user: User | null = null;
  if (databasePool) {
    const r = await databasePool.query('select * from public.users where lower(username) = $1', [u]);
    user = r.rows[0] ? rowToUser(r.rows[0]) : null;
  } else {
    user = db.users.find((x) => (x.username || '').toLowerCase() === u) || null;
  }
  if (!user) return null;
  return {
    name: user.name,
    username: user.username,
    avatarUrl: user.avatarUrl,
    bio: user.bio || '',
    role: user.role,
    verification: user.verification,
    createdAt: user.createdAt,
    connectedAccounts: user.connectedAccounts,
  };
}

/**
 * Permanently delete an account: credentials, sessions (FK cascade),
 * OAuth identities (FK cascade), comments (FK cascade), and API keys
 * (no FK — removed explicitly). Used by DELETE /auth/account.
 */
export async function forgetAccount(userId: string): Promise<void> {
  if (databasePool) {
    await databasePool.query('delete from public.api_keys where owner_id = $1', [userId]);
    await databasePool.query('delete from public.users where id = $1', [userId]);
  } else {
    const idx = db.users.findIndex((u) => u.id === userId);
    if (idx !== -1) {
      const [removed] = db.users.splice(idx, 1);
      if (removed) memoryPasswords.delete(removed.email);
    }
    db.apiKeys = db.apiKeys.filter((k) => k.ownerId !== userId);
    for (const [key, rec] of memorySessions) if (rec.userId === userId) memorySessions.delete(key);
    for (const [key, uid] of memoryIdentities) if (uid === userId) memoryIdentities.delete(key);
    memoryTwoFactor.delete(userId);
  }
  // Cached session resolutions must not outlive the account they point to.
  resolveCache.clear();
}

// ---- two-factor authentication (real TOTP) -------------------------------
// The TOTP secret lives server-side only: PostgreSQL persists it, memory mode
// keeps it in-process. No API ever returns an enabled account's secret, and
// setTwoFactor always invalidates the session resolve-cache so /auth/me and
// every Bearer request see the new state immediately.
const memoryTwoFactor = new Map<string, string>();

export async function getTwoFactorSecret(userId: string): Promise<string | null> {
  if (databasePool) {
    const result = await databasePool.query('select two_factor_secret from public.users where id = $1', [userId]);
    return result.rows[0]?.two_factor_secret || null;
  }
  return memoryTwoFactor.get(userId) || null;
}

export async function setTwoFactor(userId: string, secret: string, enabled: boolean): Promise<void> {
  if (databasePool) {
    await databasePool.query(
      'update public.users set two_factor_secret = $2, two_factor_enabled = $3 where id = $1',
      [userId, secret, enabled],
    );
  } else {
    if (secret) memoryTwoFactor.set(userId, secret);
    else memoryTwoFactor.delete(userId);
    const user = db.users.find((u) => u.id === userId);
    if (user) user.twoFactorEnabled = enabled;
  }
  invalidateResolveCache(userId);
}

/** Load one account by id (both storage modes). */
export async function findUserById(userId: string): Promise<User | null> {
  if (databasePool) {
    const result = await databasePool.query('select * from public.users where id = $1', [userId]);
    return result.rows[0] ? rowToUser(result.rows[0]) : null;
  }
  return db.users.find((u) => u.id === userId) || null;
}

export async function verifyAccount(email: string, password: string): Promise<AuthOutcome> {
  const clean = email.trim().toLowerCase();

  if (databasePool) {
    try {
      const result = await databasePool.query('select * from public.users where lower(email) = $1', [clean]);
      const row = result.rows[0];
      if (!row) {
        await burnPasswordTime(password);
        return { ok: false, status: 401, error: 'Invalid email or password' };
      }
      const valid = await verifyPassword(password, row.password_hash);
      if (!valid) return { ok: false, status: 401, error: 'Invalid email or password' };

      const user = rowToUser({ ...row, last_login_at: new Date().toISOString() });
      if (isAdminEmail(clean) && user.role !== 'ADMIN') {
        user.role = 'ADMIN';
        await databasePool.query("update public.users set role = 'ADMIN' where id = $1", [row.id]);
      }
      await databasePool.query('update public.users set last_login_at = now() where id = $1', [row.id]);
      return { ok: true, user };
    } catch (err: any) {
      if (err?.code === '42P01' || err?.code === '42703') {
        throw new Error('users table missing — run: npm run db:migrate (supabase/schema.sql)');
      }
      throw err;
    }
  }

  // In-memory fallback
  const rec = memoryPasswords.get(clean);
  const user = rec ? db.users.find((u) => u.id === rec.userId) : undefined;
  if (!rec || !user) {
    await burnPasswordTime(password);
    return { ok: false, status: 401, error: 'Invalid email or password' };
  }
  if (!(await verifyPassword(password, rec.hash))) {
    return { ok: false, status: 401, error: 'Invalid email or password' };
  }
  user.lastLoginAt = new Date().toISOString();
  if (isAdminEmail(clean)) user.role = 'ADMIN';
  return { ok: true, user };
}

// ---- sessions -------------------------------------------------------------

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export async function createSession(user: User, meta: { ip?: string; userAgent?: string }): Promise<string> {
  const token = `vnt_sess_${crypto.randomBytes(32).toString('base64url')}`;
  const hash = hashToken(token);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  if (databasePool) {
    await databasePool.query(
      'insert into public.auth_sessions (token_hash, user_id, ip, user_agent, expires_at) values ($1, $2, $3, $4, $5)',
      [hash, user.id, String(meta.ip || '').slice(0, 64), String(meta.userAgent || '').slice(0, 200), expiresAt],
    );
  } else {
    // Opportunistic sweep so the map cannot grow unbounded.
    if (memorySessions.size > 500) {
      const now = Date.now();
      for (const [k, v] of memorySessions) if (v.expiresAt < now) memorySessions.delete(k);
    }
    memorySessions.set(hash, { userId: user.id, expiresAt: expiresAt.getTime() });
  }
  return token;
}

export async function resolveSession(token: string): Promise<User | null> {
  if (!token || !token.startsWith('vnt_sess_')) return null;
  const hash = hashToken(token);

  const cached = resolveCache.get(hash);
  if (cached) {
    if (cached.until > Date.now()) return cached.user;
    resolveCache.delete(hash);
  }

  let user: User | null = null;
  if (databasePool) {
    try {
      const result = await databasePool.query(
        `select u.* from public.auth_sessions s
         join public.users u on u.id = s.user_id
         where s.token_hash = $1 and s.expires_at > now()`,
        [hash],
      );
      user = result.rows[0] ? rowToUser(result.rows[0]) : null;
    } catch (err) {
      console.error('[auth] session lookup failed:', (err as Error).message);
      return null;
    }
  } else {
    const rec = memorySessions.get(hash);
    if (!rec) return null;
    if (rec.expiresAt < Date.now()) {
      memorySessions.delete(hash);
      return null;
    }
    user = db.users.find((u) => u.id === rec.userId) || null;
  }

  resolveCache.set(hash, { user, until: Date.now() + RESOLVE_CACHE_TTL_MS });
  return user;
}

export async function revokeSession(token: string): Promise<void> {
  if (!token) return;
  const hash = hashToken(token);
  resolveCache.delete(hash);
  if (databasePool) {
    try {
      await databasePool.query('delete from public.auth_sessions where token_hash = $1', [hash]);
    } catch (err) {
      console.error('[auth] session revoke failed:', (err as Error).message);
    }
  } else {
    memorySessions.delete(hash);
  }
}

// ---- OAuth identities (Discord / Google / GitHub) -------------------------
//
// A user may link one identity per provider. Sign-in order:
//   1. known (provider, provider_id)  → that account
//   2. verified email match           → link identity to the existing account
//   3. otherwise                      → create a new USER account
// Unverified emails are NEVER used to take over an existing account.

const memoryIdentities = new Map<string, string>(); // `${provider}:${providerId}` → userId

function fallbackOAuthEmail(provider: string, providerId: string): string {
  return `${provider}_${providerId}@oauth.vanitas.local`;
}

export interface OAuthIdentityParams {
  provider: string;
  providerId: string;
  email: string;
  emailVerified: boolean;
  name: string;
  avatarUrl: string;
}

function withConnectedAccount(user: User, provider: string): User {
  if (provider === 'google' || provider === 'github' || provider === 'discord') {
    user.connectedAccounts = { ...user.connectedAccounts, [provider]: true };
  }
  return user;
}

export async function upsertOAuthUser(p: OAuthIdentityParams): Promise<User> {
  const provider = p.provider.toLowerCase().slice(0, 20);
  const providerId = String(p.providerId).slice(0, 64);
  if (!providerId) throw new Error('oauth profile missing provider id');
  const identityKey = `${provider}:${providerId}`;
  const email = p.emailVerified && p.email ? p.email.trim().toLowerCase().slice(0, 120) : '';
  const name = (p.name || 'OAuth User').trim().slice(0, 80) || 'OAuth User';
  const avatarUrl = String(p.avatarUrl || '').slice(0, 500) || DEFAULT_AVATAR;
  const nowIso = new Date().toISOString();

  if (databasePool) {
    try {
      // 1) Same social account as before → straight login.
      const existing = await databasePool.query(
        `select u.* from public.user_identities i
         join public.users u on u.id = i.user_id
         where i.provider = $1 and i.provider_id = $2`,
        [provider, providerId],
      );
      if (existing.rows[0]) {
        const row = existing.rows[0];
        await markSocialLogin(row.id, provider);
        return withConnectedAccount(rowToUser({ ...row, last_login_at: nowIso }), provider);
      }

      // 2) Verified email already registered → link identity to that account.
      if (email) {
        const byEmail = await databasePool.query('select * from public.users where lower(email) = $1', [email]);
        if (byEmail.rows[0]) {
          const row = byEmail.rows[0];
          await databasePool.query(
            'insert into public.user_identities (provider, provider_id, user_id) values ($1, $2, $3) on conflict (provider, provider_id) do nothing',
            [provider, providerId, row.id],
          );
          await markSocialLogin(row.id, provider);
          return withConnectedAccount(rowToUser({ ...row, last_login_at: nowIso }), provider);
        }
      }

      // 3) Brand new account + identity, created atomically (CTE).
      const finalRole = await pickInitialRole(email || 'oauth@unknown');
      const id = secureId('usr');
      const username = await uniqueUsernameFromEmailPg(email || `${provider}${providerId}`);
      await databasePool.query(
        `with new_user as (
           insert into public.users (id, email, name, username, avatar_url, role, password_hash, created_at, last_login_at)
           values ($1, lower($2), $3, $4, $5, $6, '', now(), now())
           returning id
         )
         insert into public.user_identities (provider, provider_id, user_id)
         select $7, $8, id from new_user`,
        [id, email || fallbackOAuthEmail(provider, providerId), name, username, avatarUrl, finalRole, provider, providerId],
      );
      const created = await databasePool.query('select * from public.users where id = $1', [id]);
      return withConnectedAccount(rowToUser(created.rows[0]), provider);
    } catch (err: any) {
      if (err?.code === '42P01' || err?.code === '42703') {
        throw new Error('user_identities table missing — run: npm run db:migrate (supabase/schema.sql)');
      }
      throw err;
    }
  }

  // ---- in-memory fallback (no DATABASE_URL) ----
  const knownUserId = memoryIdentities.get(identityKey);
  if (knownUserId) {
    const user = db.users.find((u) => u.id === knownUserId);
    if (user) {
      user.lastLoginAt = nowIso;
      return withConnectedAccount(user, provider);
    }
    memoryIdentities.delete(identityKey);
  }
  if (email) {
    const byEmail = db.users.find((u) => u.email.toLowerCase() === email);
    if (byEmail) {
      memoryIdentities.set(identityKey, byEmail.id);
      byEmail.lastLoginAt = nowIso;
      return withConnectedAccount(byEmail, provider);
    }
  }
  const user: User = {
    id: secureId('usr'),
    email: email || fallbackOAuthEmail(provider, providerId),
    name,
    username: usernameFromEmail(email || `${provider}${providerId}`, (u) => db.users.some((x) => x.username === u)),
    avatarUrl,
    role: await pickInitialRole(email),
    verification: '',
    twoFactorEnabled: false,
    createdAt: nowIso,
    lastLoginAt: nowIso,
    connectedAccounts: { google: false, github: false, discord: false },
  };
  db.users.push(user);
  memoryIdentities.set(identityKey, user.id);
  return withConnectedAccount(user, provider);
}

/** DB-mode touch: stamp last_login_at and flag the provider as connected. */
async function markSocialLogin(userId: string, provider: string): Promise<void> {
  await databasePool!.query(
    `update public.users
     set last_login_at = now(),
         connected_accounts = jsonb_set(
           coalesce(connected_accounts, '{"google":false,"github":false,"discord":false}'::jsonb),
           array[$2]::text[], 'true')
     where id = $1`,
    [userId, provider],
  );
}
