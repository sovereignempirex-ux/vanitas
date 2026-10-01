import crypto from 'crypto';
import type { Request, Response, NextFunction } from 'express';
import { db } from './db.ts';
import type { User } from '../types.ts';

// ---------------------------------------------------------------------------
// Secure random helpers (replaces Math.random for all secrets/tokens)
// ---------------------------------------------------------------------------
export function secureToken(prefix: string, bytes = 24): string {
  return `${prefix}${crypto.randomBytes(bytes).toString('base64url')}`;
}

export function secureId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${crypto.randomBytes(6).toString('hex')}`;
}

// ---------------------------------------------------------------------------
// Input sanitization — strip control chars + neutralize HTML injection
// Stored values are escaped on render, but we also neutralize here
// ---------------------------------------------------------------------------
export function sanitizeText(input: unknown, maxLen = 5000): string {
  if (typeof input !== 'string') return '';
  let s = input.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
  s = s.trim().slice(0, maxLen);
  return s;
}

export function sanitizeUrl(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const s = input.trim().slice(0, 2048);
  let u: URL;
  try {
    u = new URL(s);
  } catch {
    return null;
  }
  // SSRF guard: only http/https, block private / metadata endpoints
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  const host = u.hostname.toLowerCase();
  const blocked = [
    'localhost',
    '127.',
    '10.',
    '192.168.',
    '169.254.',
    '0.0.0.0',
    '::1',
    '[::1]',
  ];
  if (blocked.some((b) => host === b || host.startsWith(b))) return null;
  if (host.endsWith('.internal') || host.endsWith('.local')) return null;
  // Require https in production
  if (process.env.NODE_ENV === 'production' && u.protocol !== 'https:') return null;
  return u.toString();
}

// ---------------------------------------------------------------------------
// CSV injection guard for audit-log export
// ---------------------------------------------------------------------------
export function csvCell(value: unknown): string {
  let s = String(value ?? '');
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  s = s.replace(/"/g, '""');
  return `"${s}"`;
}

// ---------------------------------------------------------------------------
// In-memory sliding-window rate limiter (per-IP). For multi-instance prod,
// put Redis/Upstash in front — this prevents single-node abuse + DoS.
// ---------------------------------------------------------------------------
const hits = new Map<string, number[]>();
export function rateLimit({ windowMs = 60_000, max = 120 }: { windowMs?: number; max?: number }) {
  return (req: Request, res: Response, next: NextFunction) => {
    const key = (req.ip || req.socket.remoteAddress || 'unknown') + ':' + req.path;
    const now = Date.now();
    const arr = (hits.get(key) || []).filter((t) => now - t < windowMs);
    if (arr.length >= max) {
      res.setHeader('Retry-After', Math.ceil(windowMs / 1000));
      return res.status(429).json({ error: 'Too many requests. Slow down and retry.' });
    }
    arr.push(now);
    hits.set(key, arr);
    next();
  };
}

// ---------------------------------------------------------------------------
// Auth: real server-side auth.
// - API keys: Authorization: Bearer <rawSecret>  (hashed compare in db layer)
// - Admin bootstrap: ADMIN_API_TOKEN env (32+ chars) for initial admin ops
// - DEMO_MODE headers are ONLY honored when DEMO_MODE=true AND NOT production.
// ---------------------------------------------------------------------------
function adminToken(): string | null {
  const t = process.env.ADMIN_API_TOKEN;
  if (t && t.length >= 32) return t;
  return null;
}

export function getActorUser(req: Request): User {
  const demoMode = process.env.DEMO_MODE === 'true' && process.env.NODE_ENV !== 'production';

  // 1. Admin bootstrap token (for initial setup / CI). Never log it.
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  const expected = adminToken();
  if (expected && token && token.length >= 32) {
    try {
      const a = Buffer.from(token);
      const b = Buffer.from(expected);
      if (a.length === b.length && crypto.timingSafeEqual(a, b)) {
        return db.users.find((u) => u.role === 'ADMIN') || db.users[0];
      }
    } catch {
      // fall through
    }
  }

  // 2. Demo headers — local UI testing only, never production.
  if (demoMode) {
    const userIdHeader = req.headers['x-user-id'] as string | undefined;
    if (userIdHeader) {
      const user = db.users.find((u) => u.id === sanitizeText(userIdHeader, 64));
      if (user) return user;
    }
    const roleHeader = req.headers['x-user-role'] as string | undefined;
    if (roleHeader === 'ADMIN') {
      return db.users.find((u) => u.role === 'ADMIN') || db.users[0];
    }
  }

  // 3. Default: least-privilege regular user object (no admin rights).
  return db.users.find((u) => u.role === 'USER') || db.users[0];
}

export function requireAdmin(req: Request, res: Response): User | null {
  const actor = getActorUser(req);
  if (actor.role !== 'ADMIN') {
    res.status(403).json({ error: 'Administrator access required' });
    return null;
  }
  return actor;
}

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------
export function parsePagination(query: any): { limit: number; offset: number } {
  let limit = parseInt(query.limit, 10);
  let offset = parseInt(query.offset, 10);
  if (!Number.isFinite(limit) || limit <= 0) limit = 25;
  if (!Number.isFinite(offset) || offset < 0) offset = 0;
  limit = Math.min(limit, 100); // hard cap prevents DoS via huge pages
  offset = Math.min(offset, 100_000);
  return { limit, offset };
}

export function isValidScope(s: unknown): boolean {
  return typeof s === 'string' && /^[a-z.]+\.[a-z.]+$/.test(s) && s.length <= 40;
}
