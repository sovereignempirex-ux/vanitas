import crypto from 'crypto';
import { databasePool } from './pg.ts';
import { db } from './db.ts';
import { secureId } from './security.ts';
import type { User, UserRole } from '../types.ts';

// ---------------------------------------------------------------------------
// Real account authentication.
// - Passwords: scrypt (node:crypto — no native deps, safe on Vercel lambdas)
// - Sessions: random bearer tokens, stored ONLY as sha256 hashes
// - Storage: PostgreSQL (public.users / public.auth_sessions) when DATABASE_URL
//   is configured, otherwise an in-memory fallback that resets on cold start.
// ---------------------------------------------------------------------------

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const RESOLVE_CACHE_TTL_MS = 60_000; // DB-mode lookup cache
const DEFAULT_AVATAR = 'https://i.postimg.cc/SNN169kT/orders.png';

export type AuthOutcome = { ok: true; user: User } | { ok: false; status: number; error: string };

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

function usernameFromEmail(email: string, isTaken: (u: string) => boolean): string {
  const base = (email.split('@')[0] || 'user').toLowerCase().replace(/[^a-z0-9_]/g, '_').slice(0, 32) || 'user';
  let candidate = base;
  let i = 1;
  while (isTaken(candidate)) {
    candidate = `${base.slice(0, 28)}${++i}`;
  }
  return candidate;
}

function rowToUser(row: Record<string, any>): User {
  const iso = (v: any) => (v instanceof Date ? v.toISOString() : v || undefined);
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    username: row.username || '',
    avatarUrl: row.avatar_url || DEFAULT_AVATAR,
    bio: row.bio || undefined,
    role: row.role === 'ADMIN' ? 'ADMIN' : 'USER',
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
  const role: UserRole = isAdminEmail(email) ? 'ADMIN' : 'USER';

  if (databasePool) {
    try {
      const existing = await databasePool.query('select 1 from public.users where lower(email) = $1', [email]);
      if (existing.rowCount) return { ok: false, status: 409, error: 'An account with this email already exists' };

      // Fresh install: the very first account becomes the administrator.
      let finalRole = role;
      if (finalRole === 'USER') {
        const count = await databasePool.query('select count(*)::int as n from public.users');
        if ((count.rows[0]?.n ?? 0) === 0) finalRole = 'ADMIN';
      }

      const id = secureId('usr');
      const username = usernameFromEmail(email, () => false);
      const result = await databasePool.query(
        `insert into public.users (id, email, name, username, avatar_url, role, password_hash, created_at, last_login_at)
         values ($1, lower($2), $3, $4, $5, $6, $7, now(), now())
         returning *`,
        [id, email, params.name, username, DEFAULT_AVATAR, finalRole, passwordHash],
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
    twoFactorEnabled: false,
    createdAt: new Date().toISOString(),
    lastLoginAt: new Date().toISOString(),
    connectedAccounts: { google: false, github: false, discord: false },
  };
  db.users.push(user);
  memoryPasswords.set(email, { userId: user.id, hash: passwordHash });
  return { ok: true, user };
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
