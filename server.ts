import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { db, ALL_SCOPES } from './src/server/db.ts';
import { processAiQuery, diagnoseAndFixCode, performSemanticSearch, searchYouTubeVideos } from './src/server/aiService.ts';
import { ClientSource, UserRole, PermissionScope } from './src/types.ts';

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Security Headers Middleware
  app.use((_req, res, next) => {
    res.setHeader('X-DNS-Prefetch-Control', 'on');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
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

  // Auth Context Simulation Middleware
  function getActorUser(req: Request) {
    const authHeader = req.headers.authorization;
    const roleHeader = req.headers['x-user-role'] as UserRole;
    const userIdHeader = req.headers['x-user-id'] as string;

    if (userIdHeader) {
      const user = db.users.find((u) => u.id === userIdHeader);
      if (user) return user;
    }

    if (roleHeader === 'ADMIN') {
      return db.users.find((u) => u.role === 'ADMIN') || db.users[0];
    }

    // Default to prime owner or dev user
    return db.users[0];
  }

  // ----------------------------------------------------
  // API ROUTES (/api/v1/...)
  // ----------------------------------------------------

  // Health & Ready
  app.get('/api/v1/health', (_req, res) => {
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      uptime: process.uptime(),
      service: 'Vanitas Central Gateway',
    });
  });

  app.get('/api/v1/ready', (_req, res) => {
    res.json({
      ready: true,
      database: 'connected',
      auth: 'ready',
      ai: process.env.GEMINI_API_KEY ? 'gemini_enabled' : 'fallback_ready',
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

  // Auth OAuth Simulation
  app.post('/api/v1/auth/oauth', (req, res) => {
    const { provider } = req.body;
    const actor = getActorUser(req);
    const source = detectSource(req);

    db.recordAuditLog({
      actorId: actor.id,
      actorName: actor.name,
      actorEmail: actor.email,
      action: `OAUTH_LOGIN_${(provider || 'GENERIC').toUpperCase()}`,
      category: 'AUTH',
      target: `User Account: ${actor.id}`,
      source,
      status: 'SUCCESS',
      ipAddress: req.ip || '194.230.14.88',
      metadata: { provider, userAgent: req.headers['user-agent'] },
    });

    res.json({
      success: true,
      token: `vnt_jwt_${Math.random().toString(36).substring(2, 14)}`,
      user: actor,
    });
  });

  // Auth Sessions
  app.get('/api/v1/auth/sessions', (_req, res) => {
    res.json({ sessions: db.sessions });
  });

  app.delete('/api/v1/auth/sessions/:id', (req, res) => {
    const { id } = req.params;
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
        target: `Session Device: ${removed.device} (${removed.ip})`,
        source: detectSource(req),
        status: 'SUCCESS',
        ipAddress: req.ip || '194.230.14.88',
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

  // API Key Create (with assertGrantableScopes)
  app.post('/api/v1/api-keys', (req, res) => {
    try {
      const actor = getActorUser(req);
      const { name, scopes, environment, rateLimitPerMin, expiresAt } = req.body;

      if (!name || !scopes || !Array.isArray(scopes)) {
        return res.status(400).json({ error: 'Invalid parameters. "name" and "scopes" array are required.' });
      }

      const result = db.createApiKey({
        name,
        ownerId: actor.id,
        ownerName: actor.name,
        requesterRole: actor.role,
        scopes: scopes as PermissionScope[],
        environment: environment || 'live',
        rateLimitPerMin: Number(rateLimitPerMin) || 600,
        expiresAt: expiresAt || null,
      });

      res.status(201).json({
        key: result.key,
        rawSecret: result.rawSecret,
        revealNote: 'This secret is revealed only once. Store it in a secure vault.',
      });
    } catch (err: any) {
      res.status(403).json({ error: err.message });
    }
  });

  // API Key Rotate (Safe Rotation)
  app.post('/api/v1/api-keys/:id/rotate', (req, res) => {
    try {
      const actor = getActorUser(req);
      const { id } = req.params;
      const result = db.rotateApiKey(id, actor);
      res.json({
        key: result.key,
        rawSecret: result.rawSecret,
        revealNote: 'Previous secret has been permanently invalidated. Store this new secret securely.',
      });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // API Key Revoke (Safe Revoke)
  app.delete('/api/v1/api-keys/:id', (req, res) => {
    try {
      const actor = getActorUser(req);
      const { id } = req.params;
      const { reason } = req.body || {};
      const key = db.revokeApiKey(id, actor, reason);
      res.json({ success: true, key });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // API Key Update Scopes
  app.patch('/api/v1/api-keys/:id/scopes', (req, res) => {
    try {
      const actor = getActorUser(req);
      const { id } = req.params;
      const { scopes } = req.body;
      if (!scopes || !Array.isArray(scopes)) {
        return res.status(400).json({ error: 'Scopes array required' });
      }
      const key = db.updateApiKeyScopes(id, scopes, actor);
      res.json({ success: true, key });
    } catch (err: any) {
      res.status(403).json({ error: err.message });
    }
  });

  // API Key Update Rate Limit & Resource Policy
  app.patch('/api/v1/api-keys/:id/rate-limit', (req, res) => {
    try {
      const actor = getActorUser(req);
      const { id } = req.params;
      const { rateLimitPerMin, burstLimit, rateLimitAlgorithm, actionOnExceed, monthlyQuota } = req.body;
      if (!rateLimitPerMin || isNaN(Number(rateLimitPerMin))) {
        return res.status(400).json({ error: 'Valid rateLimitPerMin number is required' });
      }
      const key = db.updateApiKeyRateLimit(
        id,
        {
          rateLimitPerMin: Number(rateLimitPerMin),
          burstLimit: burstLimit !== undefined ? Number(burstLimit) : undefined,
          rateLimitAlgorithm,
          actionOnExceed,
          monthlyQuota: monthlyQuota !== undefined ? Number(monthlyQuota) : undefined,
        },
        actor
      );
      res.json({ success: true, key });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // API Key Simulate / Test Rate Limit Ingress
  app.post('/api/v1/api-keys/:id/simulate-traffic', (req, res) => {
    try {
      const { id } = req.params;
      const { requestCount = 50 } = req.body;
      const key = db.apiKeys.find((k) => k.id === id);
      if (!key) return res.status(404).json({ error: 'Key not found' });

      // Increment simulated usage
      const count = Number(requestCount) || 50;
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
      res.status(400).json({ error: err.message });
    }
  });

  // Admin Users List
  app.get('/api/v1/admin/users', (req, res) => {
    const actor = getActorUser(req);
    if (actor.role !== 'ADMIN') {
      return res.status(403).json({ error: '403 Forbidden: Admin privileges required' });
    }
    res.json({ users: db.users });
  });

  // Admin User Role Update
  app.patch('/api/v1/admin/users/:id/role', (req, res) => {
    const actor = getActorUser(req);
    if (actor.role !== 'ADMIN') {
      return res.status(403).json({ error: '403 Forbidden: Admin privileges required' });
    }

    const { id } = req.params;
    const { role } = req.body;
    if (!['USER', 'ADMIN'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }

    const targetUser = db.users.find((u) => u.id === id);
    if (!targetUser) {
      return res.status(404).json({ error: 'User not found' });
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
      ipAddress: req.ip || '194.230.14.88',
      metadata: { priorRole, newRole: role },
    });

    res.json({ success: true, user: targetUser });
  });

  // Admin Audit Logs (with limit, offset, from, category, CSV Export)
  app.get('/api/v1/admin/logs', (req, res) => {
    const actor = getActorUser(req);
    if (actor.role !== 'ADMIN') {
      return res.status(403).json({ error: '403 Forbidden: Admin privileges required' });
    }

    const limit = parseInt(req.query.limit as string) || 25;
    const offset = parseInt(req.query.offset as string) || 0;
    const from = req.query.from as string; // '24h' | '7d' | '30d' | ISO date string
    const category = (req.query.category as string || 'ALL').toUpperCase();
    const search = ((req.query.search as string) || '').toLowerCase();

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

    // Category filter
    if (category && category !== 'ALL') {
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

  // Admin Logs CSV Export
  app.get('/api/v1/admin/logs/export', (req, res) => {
    const actor = getActorUser(req);
    if (actor.role !== 'ADMIN') {
      return res.status(403).send('403 Forbidden');
    }

    const headers = ['Timestamp', 'Actor', 'Action', 'Category', 'Target', 'Source', 'Status', 'Request ID', 'IP Address', 'Metadata'];
    const rows = db.auditLogs.map((l) => [
      `"${l.timestamp}"`,
      `"${l.actorName} (${l.actorEmail})"`,
      `"${l.action}"`,
      `"${l.category}"`,
      `"${l.target.replace(/"/g, '""')}"`,
      `"${l.source}"`,
      `"${l.status}"`,
      `"${l.requestId}"`,
      `"${l.ipAddress}"`,
      `"${JSON.stringify(l.metadata || {}).replace(/"/g, '""')}"`,
    ]);

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="vanitas_audit_logs_${Date.now()}.csv"`);
    res.send(csvContent);
  });

  // Admin System Statistics
  app.get('/api/v1/admin/statistics', (req, res) => {
    const actor = getActorUser(req);
    if (actor.role !== 'ADMIN') {
      return res.status(403).json({ error: '403 Forbidden: Admin privileges required' });
    }
    res.json({ stats: db.systemStats, threats: db.securityThreats });
  });

  // Admin Emergency Controls
  app.post('/api/v1/admin/emergency', (req, res) => {
    const actor = getActorUser(req);
    if (actor.role !== 'ADMIN') {
      return res.status(403).json({ error: '403 Forbidden: Admin privileges required' });
    }

    const { action, targetId } = req.body;
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
          ipAddress: req.ip || '194.230.14.88',
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
        ipAddress: req.ip || '194.230.14.88',
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
    const actor = getActorUser(req);
    if (actor.role !== 'ADMIN') {
      return res.status(403).json({ error: '403 Forbidden' });
    }
    const { id } = req.params;
    const { enabled } = req.body;
    const flag = db.featureFlags.find((f) => f.id === id);
    if (!flag) return res.status(404).json({ error: 'Feature flag not found' });
    flag.enabled = !!enabled;
    flag.updatedAt = new Date().toISOString();
    res.json({ success: true, flag });
  });

  // Webhooks
  app.get('/api/v1/webhooks', (_req, res) => {
    res.json({ webhooks: db.webhooks, logs: db.webhookLogs });
  });

  app.post('/api/v1/webhooks', (req, res) => {
    const actor = getActorUser(req);
    const { name, url, events } = req.body;
    if (!name || !url || !events) {
      return res.status(400).json({ error: 'Name, URL, and Events are required' });
    }
    const newWebhook = {
      id: `wh_${Date.now().toString(36)}`,
      name,
      url,
      events,
      secret: `whsec_${Math.random().toString(36).substring(2, 14)}`,
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
      target: `${newWebhook.name} (${newWebhook.url})`,
      source: detectSource(req),
      status: 'SUCCESS',
      ipAddress: req.ip || '194.230.14.88',
    });
    res.status(201).json({ webhook: newWebhook });
  });

  app.post('/api/v1/webhooks/:id/test', (req, res) => {
    const { id } = req.params;
    const wh = db.webhooks.find((w) => w.id === id);
    if (!wh) return res.status(404).json({ error: 'Webhook not found' });

    wh.lastTriggeredAt = new Date().toISOString();
    const log = {
      id: `wh_log_${Date.now()}`,
      webhookId: wh.id,
      event: 'ping.test',
      status: 'delivered' as const,
      statusCode: 200,
      latencyMs: Math.floor(Math.random() * 80) + 90,
      timestamp: new Date().toISOString(),
      payload: { event: 'ping.test', timestamp: new Date().toISOString(), message: 'Vanitas ping verification handshake' },
    };
    db.webhookLogs.unshift(log);
    res.json({ success: true, log });
  });

  // Bot Gateway Execution
  app.get('/api/v1/bot/status', (_req, res) => {
    res.json({ bots: db.bots });
  });

  app.post('/api/v1/bot/execute', (req, res) => {
    const actor = getActorUser(req);
    const { platform, command, payload } = req.body;
    const source = detectSource(req);

    if (!command) {
      return res.status(400).json({ error: 'Missing command payload' });
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
      target: `${platform || 'discord'}::${command}`,
      source: 'BOT',
      status: 'SUCCESS',
      ipAddress: req.ip || '10.0.4.12',
      metadata: { command, payload, latencyMs: 14 },
    });

    res.json({
      success: true,
      executionId: `exec_${Date.now().toString(36)}`,
      platform: bot.platform,
      command,
      output: `Vanitas executed [${command}] on ${bot.name}. Result: Nominal. All systems in state 200 OK.`,
      timestamp: new Date().toISOString(),
    });
  });

  // Vanitas AI Chat endpoint
  app.post('/api/v1/ai/chat', async (req, res) => {
    try {
      const { persona, toneStyle, prompt, enableWebSearch, enableVideoSearch, context } = req.body;
      if (!prompt) return res.status(400).json({ error: 'Prompt is required' });

      const response = await processAiQuery({
        persona: persona || 'code',
        toneStyle: toneStyle || 'developer',
        prompt,
        enableWebSearch: !!enableWebSearch,
        enableVideoSearch: !!enableVideoSearch,
        context,
      });

      res.json(response);
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'AI engine error' });
    }
  });

  // Vanitas AI Code Diagnosis, Bug Detection & Auto-Repair Tool
  app.post('/api/v1/ai/diagnose-fix', async (req, res) => {
    try {
      const { code, language = 'typescript', context, autoFix } = req.body;
      if (!code || typeof code !== 'string') {
        return res.status(400).json({ error: 'Code snippet string is required' });
      }

      const result = await diagnoseAndFixCode({
        code,
        language,
        context,
        autoFix: autoFix !== false,
      });

      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed running code diagnosis' });
    }
  });

  // ----------------------------------------------------
  // AI-POWERED GLOBAL SEMANTIC SEARCH
  // ----------------------------------------------------
  app.all(['/api/v1/search/semantic', '/api/v1/semantic-search'], async (req, res) => {
    try {
      const query = (req.method === 'POST' ? req.body.query : req.query.q) as string;
      if (!query || typeof query !== 'string') {
        return res.status(400).json({ error: 'Search query parameter is required' });
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
      res.status(500).json({ error: err.message || 'Semantic search failed' });
    }
  });

  // ----------------------------------------------------
  // YOUTUBE VIDEO SEARCH & AI INTELLIGENCE
  // ----------------------------------------------------
  app.get('/api/v1/youtube/search', async (req, res) => {
    try {
      const q = (req.query.q as string) || 'Vanitas API Gateway';
      const limit = parseInt((req.query.limit as string) || '6', 10);
      const result = await searchYouTubeVideos(q, limit);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed searching YouTube videos' });
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
    const { id } = req.body;
    if (!id) return res.status(400).json({ error: 'Database ID is required' });
    const result = db.testDatabaseConnection(id);
    res.json(result);
  });

  app.post('/api/v1/databases/external', (req, res) => {
    const actor = getActorUser(req);
    const { name, provider, connectionUrl, region } = req.body;
    if (!name || !provider || !connectionUrl) {
      return res.status(400).json({ error: 'Name, Provider, and Connection URL are required' });
    }

    const created = db.addExternalDatabase({ name, provider, connectionUrl, region });

    db.recordAuditLog({
      actorId: actor.id,
      actorName: actor.name,
      actorEmail: actor.email,
      action: 'DATABASE_CONNECTED',
      category: 'DATABASE',
      target: `${created.name} (${created.provider})`,
      source: detectSource(req),
      status: 'SUCCESS',
      ipAddress: req.ip || '194.230.14.88',
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
      const { type } = req.params as { type: 'apk' | 'exe' | 'dmg' | 'appimage' };

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

      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Content-Type', contentType);
      res.setHeader('X-Vanitas-Version', release.version);
      res.setHeader('X-Vanitas-Checksum-SHA256', release.sha256);
      res.setHeader('Content-Length', buffer.length);

      res.send(buffer);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ----------------------------------------------------
  // VITE MIDDLEWARE (Development) or STATIC SERVE (Production)
  // ----------------------------------------------------
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Vanitas Central Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
