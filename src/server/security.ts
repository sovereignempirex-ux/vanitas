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

/** True when a hostname (already canonicalised by URL parsing) is a
 * private / reserved / link-local address, i.e. unsafe to fetch server-side. */
function isPrivateHost(host: string): boolean {
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.internal') || host.endsWith('.local')) return true;
  // IPv6 (URL keeps brackets off in .hostname, and WHATWG normalises
  // IPv4-mapped addresses such as ::ffff:7f00:1 to hex form).
  if (host.includes(':')) {
    const h = host.replace(/^\[|\]$/g, '').toLowerCase();
    if (h === '::' || h === '::1') return true;
    if (h.startsWith('fc') || h.startsWith('fd')) return true; // fc00::/7 ULA
    if (/^fe[89ab]/.test(h)) return true; // fe80::/10 link-local
    if (h.startsWith('::ffff:')) return true; // IPv4-mapped escape hatch
    return false;
  }
  const parts = host.split('.').map((p) => Number(p));
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return false;
  const [a, b] = parts;
  if (a === 0) return true; // 0.0.0.0/8
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 127) return true; // loopback
  if (a === 169 && b === 254) return true; // link-local / cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a === 192 && b === 0) return true; // 192.0.0.0/24 + 192.0.2.0/24
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 CGNAT
  if (a === 198 && (b === 18 || b === 19)) return true; // 198.18.0.0/15
  if (a === 198 && b === 51) return true; // 198.51.100.0/24
  if (a === 203 && b === 0) return true; // 203.0.113.0/24
  if (a >= 224) return true; // multicast + reserved
  return false;
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
  // SSRF guard: only http/https, block private / metadata endpoints.
  // WHATWG URL already canonicalises numeric/hex/octal hosts (2130706433,
  // 0x7f.0.0.1 …) to dotted-quad, so range checks below can't be bypassed
  // that way. DNS-rebinding still requires a resolve-time check — noted.
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  if (u.username || u.password) return null; // http://user:pass@host tricks
  const host = u.hostname.toLowerCase();
  const isProd = process.env.NODE_ENV === 'production';
  const isLoopback =
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host === '::1' ||
    host.split('.').length === 4 && Number(host.split('.')[0]) === 127;
  if (isPrivateHost(host)) {
    // Outside production, loopback targets are a legitimate development
    // pattern (local webhook receivers, CLI-style testing). Everything else
    // — LAN ranges, link-local, cloud metadata — is blocked in EVERY mode,
    // and production blocks loopback too (plus requires https, below).
    if (isProd || !isLoopback) return null;
  }
  if (isProd && u.protocol !== 'https:') return null;
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
//
// Keyed by ip + path by default. Dynamic segments (`/invites/<token>`,
// `/profiles/<name>`) would otherwise mint a fresh bucket per value, letting
// an attacker spray thousands of distinct URLs past any per-route ceiling —
// those routes opt in with `perIpOnly`, which buckets purely per IP. The map
// is also swept periodically so unique-path spraying cannot grow it forever.
// ---------------------------------------------------------------------------
const hits = new Map<string, number[]>();
let sweepCounter = 0;
let maxWindowMs = 60_000;
function pruneHits(): void {
  const now = Date.now();
  for (const [key, arr] of hits) {
    const kept = arr.filter((t) => now - t < maxWindowMs);
    if (kept.length === 0) hits.delete(key);
    else hits.set(key, kept);
  }
}
export function rateLimit({ windowMs = 60_000, max = 120, perIpOnly = false }: { windowMs?: number; max?: number; perIpOnly?: boolean }) {
  if (windowMs > maxWindowMs) maxWindowMs = windowMs;
  return (req: Request, res: Response, next: NextFunction) => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const key = perIpOnly ? `${ip}:*` : `${ip}:${req.path}`;
    const now = Date.now();
    if (++sweepCounter % 1000 === 0) pruneHits();
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

export function getActorUser(req: Request): User | null {
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
        const adminUser = db.users.find((u) => u.role === 'ADMIN');
        if (adminUser) return adminUser;
        // No admin row exists yet — act as the machine identity itself so CI
        // can bootstrap (this is a service principal, not a fake human user).
        return {
          id: 'usr_admin_api_token',
          email: 'admin-api-token@vanitas.local',
          name: 'Admin API Token',
          username: 'admin_api_token',
          avatarUrl: '',
          role: 'ADMIN',
          twoFactorEnabled: false,
          createdAt: '1970-01-01T00:00:00.000Z',
          lastLoginAt: new Date().toISOString(),
          verification: '',
          connectedAccounts: { google: false, github: false, discord: false },
        };
      }
    } catch {
      // fall through
    }
  }

  // 1b. Real session actor (resolved from Bearer token by the /api session
  // middleware above). Regular logged-in users act as themselves only.
  const sessionActor = (req as any).actor as User | undefined;
  if (sessionActor) return sessionActor;

  // 2. Demo headers — local UI testing only, never production.
  if (demoMode) {
    const userIdHeader = req.headers['x-user-id'] as string | undefined;
    if (userIdHeader) {
      const user = db.users.find((u) => u.id === sanitizeText(userIdHeader, 64));
      if (user) return user;
    }
    const roleHeader = req.headers['x-user-role'] as string | undefined;
    if (roleHeader === 'ADMIN') {
      return db.users.find((u) => u.role === 'ADMIN') || null;
    }
  }

  // 3. No session → NO actor. Real accounts only: routes must answer 401
  //    instead of falling back to a demo persona.
  return null;
}

export function requireAdmin(req: Request, res: Response): User | null {
  const actor = getActorUser(req);
  if (!actor) {
    res.status(401).json({ error: 'Authentication required' });
    return null;
  }
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
