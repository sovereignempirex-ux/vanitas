import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import crypto from 'crypto';
import { Pool } from 'pg';
import { db, ALL_SCOPES } from './src/server/db.ts';
import { processAiQuery, diagnoseAndFixCode, performSemanticSearch, searchYouTubeVideos } from './src/server/aiService.ts';
import { ClientSource, UserRole, PermissionScope, ProductSuggestion } from './src/types.ts';
import { getActorUser, requireAdmin, rateLimit, sanitizeText, sanitizeUrl, csvCell, parsePagination, secureToken, secureId, isValidScope } from './src/server/security.ts';

// PostgreSQL pool with SSL auto-detect (required for Supabase / Neon).
// Never expose DATABASE_URL to the browser — server-side only.
const databasePool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 8,
      ssl: /supabase\.co|neon\.tech|sslmode=require/.test(process.env.DATABASE_URL) ? { rejectUnauthorized: false } : undefined,
    })
  : null;

if (databasePool) {
  databasePool.on('error', (err) => console.error('[db] pool error:', (err as Error).message));
}

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
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization,X-Request-Id');
    if (req.method === 'OPTIONS') return res.status(204).end();
    next();
  });

  // Global abuse protection
  app.use('/api/', rateLimit({ windowMs: 60_000, max: 300 }));
  app.use('/api/v1/auth/', rateLimit({ windowMs: 60_000, max: 60 }));
  app.use('/api/v1/ai/', rateLimit({ windowMs: 60_000, max: 60 }));
  app.use('/api/v1/bot/', rateLimit({ windowMs: 60_000, max: 120 }));

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
      ai: process.env.AI_PROVIDER === 'ollama' ? 'ollama_configured' : process.env.GEMINI_API_KEY ? 'gemini_enabled' : 'fallback_ready',
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

  // Auth Current User
  app.get('/api/v1/auth/me', (req, res) => {
    const actor = getActorUser(req);
    res.json({
      user: actor,
      permissions: actor.role === 'ADMIN' ? ALL_SCOPES.map((s) => s.scope) : ['api.read', 'keys.read', 'keys.create', 'bot.execute'],
    });
  });

  // Auth OAuth Simulation (validated + secure token, no Math.random)
  app.post('/api/v1/auth/oauth', (req, res) => {
    const provider = sanitizeText(req.body?.provider, 32).toUpperCase() || 'GENERIC';
    if (!/^[A-Z0-9_-]{1,32}$/.test(provider)) {
      return res.status(400).json({ error: 'Invalid provider' });
    }
    const actor = getActorUser(req);
    const source = detectSource(req);

    db.recordAuditLog({
      actorId: actor.id,
      actorName: actor.name,
      actorEmail: actor.email,
      action: `OAUTH_LOGIN_${provider}`,
      category: 'AUTH',
      target: `User Account: ${actor.id}`,
      source,
      status: 'SUCCESS',
      ipAddress: req.ip || 'unknown',
      metadata: { provider },
    });

    res.json({
      success: true,
      token: secureToken('vnt_jwt_'),
      user: actor,
    });
  });

  // Auth Sessions
  app.get('/api/v1/auth/sessions', (_req, res) => {
    res.json({ sessions: db.sessions });
  });

  app.delete('/api/v1/auth/sessions/:id', (req, res) => {
    const id = sanitizeText(req.params.id, 64);
    const actor = getActorUser(req);
    const idx = db.sessions.findIndex((s) => s.id === id);
    if (idx !== -1) {
      const removed = db.sessions.splice(idx, 1)[0];
      db.recordAuditLog({
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

  // Admin Users List
  app.get('/api/v1/admin/users', (req, res) => {
    if (!requireAdmin(req, res)) return;
    res.json({ users: db.users });
  });

  // Admin User Role Update (cannot demote last admin)
  app.patch('/api/v1/admin/users/:id/role', (req, res) => {
    const actor = requireAdmin(req, res);
    if (!actor) return;

    const id = sanitizeText(req.params.id, 64);
    const role = sanitizeText(req.body?.role, 16);
    if (!['USER', 'ADMIN'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }

    const targetUser = db.users.find((u) => u.id === id);
    if (!targetUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (targetUser.id === actor.id && role !== 'ADMIN') {
      const adminCount = db.users.filter((u) => u.role === 'ADMIN').length;
      if (adminCount <= 1) return res.status(400).json({ error: 'Cannot demote the last administrator' });
    }

    const priorRole = targetUser.role;
    targetUser.role = role as UserRole;

    db.recordAuditLog({
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

  // Admin Audit Logs (capped pagination, allowlisted filters)
  app.get('/api/v1/admin/logs', (req, res) => {
    if (!requireAdmin(req, res)) return;

    const { limit, offset } = parsePagination(req.query);
    const from = sanitizeText(req.query.from as string, 32);
    const category = sanitizeText((req.query.category as string) || 'ALL', 16).toUpperCase();
    const search = sanitizeText((req.query.search as string) || '', 100).toLowerCase();

    let logs = [...db.auditLogs];

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
  app.get('/api/v1/admin/logs/export', (req, res) => {
    if (!requireAdmin(req, res)) return res.status(403).send('Forbidden');

    const headers = ['Timestamp', 'Actor', 'Action', 'Category', 'Target', 'Source', 'Status', 'Request ID', 'IP Address', 'Metadata'];
    const rows = db.auditLogs.slice(0, 5000).map((l) => [
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

  // Admin System Statistics
  app.get('/api/v1/admin/statistics', (req, res) => {
    if (!requireAdmin(req, res)) return;
    res.json({ stats: db.systemStats, threats: db.securityThreats });
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
        db.recordAuditLog({
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
      db.recordAuditLog({
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

  // Feature Flags
  app.get('/api/v1/admin/feature-flags', (_req, res) => {
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
    db.recordAuditLog({
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

    db.recordAuditLog({
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

  // Vanitas AI Chat endpoint (prompt size cap + persona allowlist)
  app.post('/api/v1/ai/chat', async (req, res) => {
    try {
      const persona = sanitizeText(req.body?.persona, 32) || 'code';
      const toneStyle = sanitizeText(req.body?.toneStyle, 32) || 'developer';
      const prompt = sanitizeText(req.body?.prompt, 8000);
      if (!prompt || prompt.length < 2) return res.status(400).json({ error: 'Prompt is required (2-8000 chars)' });
      if (!['code', 'api', 'security', 'analyst', 'docs', 'video', 'admin'].includes(persona)) {
        return res.status(400).json({ error: 'Invalid persona' });
      }

      const response = await processAiQuery({
        persona: persona as any,
        toneStyle: (['architect', 'security', 'developer', 'bot', 'arabic'].includes(toneStyle) ? toneStyle : 'developer') as any,
        prompt,
        enableWebSearch: !!req.body?.enableWebSearch,
        enableVideoSearch: !!req.body?.enableVideoSearch,
        context: typeof req.body?.context === 'object' ? req.body.context : undefined,
      });

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
    const title = sanitizeText(req.body?.title, 140);
    const details = sanitizeText(req.body?.details, 5000);
    const category = sanitizeText(req.body?.category, 16) || 'feature';
    const code = typeof req.body?.code === 'string' ? req.body.code.slice(0, 20000) : undefined;
    if (!title || title.length < 3 || !details || details.length < 3) return res.status(400).json({ error: 'Title and details are required (3+ chars)' });
    if (!['bug', 'feature', 'ux'].includes(category)) return res.status(400).json({ error: 'Invalid suggestion category' });

    const suggestion = await createSuggestion({ title, details, category: category as any, code, authorName: sanitizeText(actor.name, 80) });
    db.recordAuditLog({
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

    db.recordAuditLog({
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
  app.get('/api/v1/videos/tutorials', (_req, res) => {
    res.json({
      success: true,
      tutorials: db.videoTutorials,
    });
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
