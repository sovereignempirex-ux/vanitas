import {
  User,
  ApiKey,
  AuditLog,
  WebhookEndpoint,
  WebhookDeliveryLog,
  SessionDevice,
  SystemStats,
  BotIntegration,
  FeatureFlag,
  SecurityThreat,
  PermissionScope,
  UserRole,
  ClientSource,
  ClientRelease,
  ApiKeyUsageResponse,
  ApiKeyUsagePoint,
  ApiKeyUsageSummary,
  ProductSuggestion,
  ExternalDatabaseConfig,
  VideoTutorialItem,
} from '../types.ts';

export const ALL_SCOPES: { scope: PermissionScope; label: string; group: string; adminOnly: boolean }[] = [
  { scope: 'api.read', label: 'Read API Data & Status', group: 'Core API', adminOnly: false },
  { scope: 'api.write', label: 'Write & Mutate API Resources', group: 'Core API', adminOnly: false },
  { scope: 'users.read', label: 'View User Profiles', group: 'Users', adminOnly: false },
  { scope: 'users.write', label: 'Modify User Information', group: 'Users', adminOnly: true },
  { scope: 'users.delete', label: 'Delete User Accounts', group: 'Users', adminOnly: true },
  { scope: 'roles.read', label: 'Inspect Roles & Matrix', group: 'Roles', adminOnly: true },
  { scope: 'roles.manage', label: 'Assign & Modify Roles', group: 'Roles', adminOnly: true },
  { scope: 'keys.read', label: 'List & Inspect API Keys', group: 'API Keys', adminOnly: false },
  { scope: 'keys.create', label: 'Generate New API Keys', group: 'API Keys', adminOnly: false },
  { scope: 'keys.rotate', label: 'Rotate Key Secrets', group: 'API Keys', adminOnly: false },
  { scope: 'keys.revoke', label: 'Revoke Key Access', group: 'API Keys', adminOnly: false },
  { scope: 'keys.scopes.update', label: 'Modify Key Scopes', group: 'API Keys', adminOnly: true },
  { scope: 'logs.read', label: 'View Audit Logs', group: 'Auditing', adminOnly: true },
  { scope: 'logs.export', label: 'Export Audit Logs to CSV', group: 'Auditing', adminOnly: true },
  { scope: 'database.read', label: 'Query Database Metadata', group: 'Database', adminOnly: true },
  { scope: 'database.write', label: 'Direct Database Operations', group: 'Database', adminOnly: true },
  { scope: 'system.read', label: 'Read System Health & Metrics', group: 'System', adminOnly: false },
  { scope: 'system.manage', label: 'Emergency Controls & Maintenance', group: 'System', adminOnly: true },
  { scope: 'security.read', label: 'Read Security Alerts & Threats', group: 'Security', adminOnly: true },
  { scope: 'security.manage', label: 'Manage Threat Policies & Blocks', group: 'Security', adminOnly: true },
  { scope: 'bot.execute', label: 'Invoke Bot Gateway Execution', group: 'Ecosystem', adminOnly: false },
  { scope: 'analytics.read', label: 'View Usage Analytics & Reports', group: 'Ecosystem', adminOnly: false },
  { scope: 'webhooks.manage', label: 'Create & Manage Webhooks', group: 'Ecosystem', adminOnly: false },
  { scope: 'settings.read', label: 'Read Platform Settings', group: 'System', adminOnly: false },
  { scope: 'settings.write', label: 'Update Platform Settings', group: 'System', adminOnly: true },
];

export class VanitasDatabase {
  productSuggestions: ProductSuggestion[] = [
    {
      id: 'sug_welcome_001',
      title: 'Improve empty-state guidance',
      details: 'Show a clearer first action for new developers.',
      category: 'ux',
      status: 'open',
      createdAt: new Date().toISOString(),
      authorName: 'Vanitas Team',
    },
  ];

  users: User[] = [
    {
      id: 'usr_owner_001',
      email: 'sovereign.empirex@gmail.com',
      name: 'Vanitas Prime',
      username: 'vanitas_sovereign',
      avatarUrl: 'https://i.postimg.cc/SNN169kT/orders.png',
      bio: 'Master Architect of the Vanitas Unified Ecosystem & Celestial API Gateway.',
      role: 'ADMIN',
      twoFactorEnabled: true,
      createdAt: '2026-01-15T08:00:00.000Z',
      lastLoginAt: new Date().toISOString(),
      connectedAccounts: {
        google: true,
        github: true,
        discord: true,
      },
    },
    {
      id: 'usr_dev_002',
      email: 'noé.archiviste@altus.org',
      name: 'Noé Archiviste',
      username: 'noe_vampire',
      avatarUrl: 'https://images.unsplash.com/photo-1534447677768-be436bb09401?q=80&w=400&auto=format&fit=crop',
      bio: 'Vampire liaison & API integration engineer.',
      role: 'USER',
      twoFactorEnabled: false,
      createdAt: '2026-02-10T14:30:00.000Z',
      lastLoginAt: '2026-08-24T19:20:00.000Z',
      connectedAccounts: {
        google: true,
        github: false,
        discord: true,
      },
    },
    {
      id: 'usr_bot_003',
      email: 'bot.gateway@vanitas.internal',
      name: 'Vanitas Autonomous Bot',
      username: 'vanitas_bot_svc',
      avatarUrl: 'https://i.postimg.cc/pXXcfjRk/Test.png',
      bio: 'System Service Account for Discord & WhatsApp automated dispatch.',
      role: 'USER',
      twoFactorEnabled: true,
      createdAt: '2026-03-01T00:00:00.000Z',
      lastLoginAt: new Date().toISOString(),
      connectedAccounts: {
        google: false,
        github: true,
        discord: true,
      },
    },
  ];

  apiKeys: ApiKey[] = [
    {
      id: 'key_live_celestial_01',
      name: 'Central Production Gateway',
      keyPrefix: 'sk_live_celest',
      maskedSecret: 'sk_live_••••••••••••8819',
      ownerId: 'usr_owner_001',
      ownerName: 'Vanitas Prime',
      scopes: ['api.read', 'api.write', 'users.read', 'logs.read', 'bot.execute', 'system.read'],
      status: 'active',
      rateLimitPerMin: 1200,
      burstLimit: 60,
      rateLimitAlgorithm: 'sliding_window',
      actionOnExceed: 'reject_429',
      monthlyQuota: 500000,
      currentUsageThisMonth: 124800,
      currentRpmUsage: 480,
      usageCount: 8420,
      createdAt: '2026-04-10T12:00:00.000Z',
      lastUsedAt: new Date().toISOString(),
      expiresAt: null,
      environment: 'live',
    },
    {
      id: 'key_bot_discord_02',
      name: 'Discord & WhatsApp Dispatcher',
      keyPrefix: 'sk_live_discord',
      maskedSecret: 'sk_live_••••••••••••4402',
      ownerId: 'usr_bot_003',
      ownerName: 'Vanitas Autonomous Bot',
      scopes: ['api.read', 'bot.execute', 'analytics.read'],
      status: 'active',
      rateLimitPerMin: 600,
      burstLimit: 30,
      rateLimitAlgorithm: 'token_bucket',
      actionOnExceed: 'throttle_delay',
      monthlyQuota: 200000,
      currentUsageThisMonth: 89400,
      currentRpmUsage: 310,
      usageCount: 14205,
      createdAt: '2026-05-18T10:15:00.000Z',
      lastUsedAt: new Date(Date.now() - 1000 * 60 * 3).toISOString(),
      expiresAt: null,
      environment: 'live',
    },
    {
      id: 'key_test_sandbox_03',
      name: 'Mobile SDK Sandbox Key',
      keyPrefix: 'sk_test_mobile',
      maskedSecret: 'sk_test_••••••••••••9100',
      ownerId: 'usr_dev_002',
      ownerName: 'Noé Archiviste',
      scopes: ['api.read', 'users.read', 'analytics.read'],
      status: 'active',
      rateLimitPerMin: 200,
      burstLimit: 15,
      rateLimitAlgorithm: 'fixed_window',
      actionOnExceed: 'alert_only',
      monthlyQuota: 50000,
      currentUsageThisMonth: 8200,
      currentRpmUsage: 42,
      usageCount: 1240,
      createdAt: '2026-07-02T16:45:00.000Z',
      lastUsedAt: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
      expiresAt: '2026-12-31T23:59:59.000Z',
      environment: 'test',
    },
  ];

  auditLogs: AuditLog[] = [
    {
      id: 'log_99182',
      timestamp: new Date(Date.now() - 1000 * 60 * 2).toISOString(),
      actorId: 'usr_owner_001',
      actorName: 'Vanitas Prime',
      actorEmail: 'sovereign.empirex@gmail.com',
      action: 'API_KEY_ROTATED',
      category: 'KEYS',
      target: 'key_live_celestial_01 (Central Production Gateway)',
      source: 'WEB',
      status: 'SUCCESS',
      requestId: 'req_rot_88921a',
      ipAddress: '194.230.14.88',
      metadata: { reason: 'Scheduled security rotation cycle', previousPrefix: 'sk_live_oldc' },
    },
    {
      id: 'log_99181',
      timestamp: new Date(Date.now() - 1000 * 60 * 18).toISOString(),
      actorId: 'usr_bot_003',
      actorName: 'Vanitas Autonomous Bot',
      actorEmail: 'bot.gateway@vanitas.internal',
      action: 'BOT_COMMAND_EXECUTED',
      category: 'BOT',
      target: 'discord_guild_44901 (#system-status)',
      source: 'BOT',
      status: 'SUCCESS',
      requestId: 'req_bot_77192b',
      ipAddress: '10.0.4.12',
      metadata: { command: '/vanitas status --all', latencyMs: 14 },
    },
    {
      id: 'log_99180',
      timestamp: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
      actorId: 'usr_owner_001',
      actorName: 'Vanitas Prime',
      actorEmail: 'sovereign.empirex@gmail.com',
      action: 'USER_ROLE_PROMOTED',
      category: 'ADMIN',
      target: 'usr_owner_001 -> ADMIN (Bootstrap verification)',
      source: 'WEB',
      status: 'SUCCESS',
      requestId: 'req_adm_11029c',
      ipAddress: '194.230.14.88',
      metadata: { priorRole: 'USER', newRole: 'ADMIN', systemTrigger: 'Console Confirmation' },
    },
    {
      id: 'log_99179',
      timestamp: new Date(Date.now() - 1000 * 60 * 120).toISOString(),
      actorId: 'anonymous_attacker',
      actorName: 'Unauthenticated Request',
      actorEmail: 'unknown',
      action: 'RATE_LIMIT_EXCEEDED',
      category: 'SECURITY',
      target: '/api/v1/admin/users',
      source: 'OTHER',
      status: 'WARNING',
      requestId: 'req_sec_44910d',
      ipAddress: '45.155.205.233',
      metadata: { attemptedRequests: 42, allowedThreshold: 10, actionTaken: 'IP Throttled for 15m' },
    },
    {
      id: 'log_99178',
      timestamp: new Date(Date.now() - 1000 * 60 * 360).toISOString(),
      actorId: 'usr_dev_002',
      actorName: 'Noé Archiviste',
      actorEmail: 'noé.archiviste@altus.org',
      action: 'SESSION_REVOKED',
      category: 'AUTH',
      target: 'Session device: Safari on macOS (178.62.204.1)',
      source: 'WEB',
      status: 'SUCCESS',
      requestId: 'req_ses_00291e',
      ipAddress: '82.165.197.1',
      metadata: { deviceId: 'dev_old_mac_safari' },
    },
  ];

  sessions: SessionDevice[] = [
    {
      id: 'dev_curr_browser',
      browser: 'Chrome 133.0',
      os: 'macOS Sequoia 15.2',
      device: 'Desktop / Workstation',
      ip: '194.230.14.88',
      source: 'WEB',
      isCurrent: true,
      createdAt: '2026-08-25T11:00:00.000Z',
      lastActiveAt: new Date().toISOString(),
    },
    {
      id: 'dev_mobile_iphone',
      browser: 'Vanitas Native Client v1.4',
      os: 'iOS 19.1',
      device: 'Apple iPhone 16 Pro',
      ip: '82.165.197.10',
      source: 'MOBILE',
      isCurrent: false,
      createdAt: '2026-08-23T09:30:00.000Z',
      lastActiveAt: new Date(Date.now() - 1000 * 60 * 120).toISOString(),
    },
    {
      id: 'dev_discord_bot_runner',
      browser: 'Node.js / Axios v1.7',
      os: 'Linux Ubuntu 24.04 LTS',
      device: 'Cloud Run Worker Cluster',
      ip: '10.0.4.12',
      source: 'BOT',
      isCurrent: false,
      createdAt: '2026-08-01T00:00:00.000Z',
      lastActiveAt: new Date().toISOString(),
    },
  ];

  webhooks: WebhookEndpoint[] = [
    {
      id: 'wh_prod_alerts',
      name: 'Security & Key Alert Dispatcher',
      url: 'https://hooks.slack.com/services/T00000000/B00000000/XXXXXXXXXXXXXXXXXXXXXXXX',
      events: ['api_key.rotated', 'api_key.revoked', 'security.alert', 'role.changed'],
      secret: 'whsec_99a8b7c6d5e4f3a2b1c0',
      status: 'active',
      createdAt: '2026-04-01T10:00:00.000Z',
      lastTriggeredAt: new Date(Date.now() - 1000 * 60 * 2).toISOString(),
      failureCount: 0,
    },
    {
      id: 'wh_crm_sync',
      name: 'User Lifecycle Sync Service',
      url: 'https://api.internal-sync.org/vanitas/events',
      events: ['user.created', 'user.updated'],
      secret: 'whsec_11223344556677889900',
      status: 'active',
      createdAt: '2026-05-10T15:30:00.000Z',
      lastTriggeredAt: new Date(Date.now() - 1000 * 60 * 60 * 5).toISOString(),
      failureCount: 0,
    },
  ];

  webhookLogs: WebhookDeliveryLog[] = [
    {
      id: 'wh_log_01',
      webhookId: 'wh_prod_alerts',
      event: 'api_key.rotated',
      status: 'delivered',
      statusCode: 200,
      latencyMs: 142,
      timestamp: new Date(Date.now() - 1000 * 60 * 2).toISOString(),
      payload: { event: 'api_key.rotated', keyId: 'key_live_celestial_01', actor: 'Vanitas Prime' },
    },
    {
      id: 'wh_log_02',
      webhookId: 'wh_crm_sync',
      event: 'user.created',
      status: 'delivered',
      statusCode: 200,
      latencyMs: 210,
      timestamp: new Date(Date.now() - 1000 * 60 * 60 * 5).toISOString(),
      payload: { event: 'user.created', userId: 'usr_dev_002', email: 'noé.archiviste@altus.org' },
    },
  ];

  bots: BotIntegration[] = [
    {
      id: 'bot_discord_main',
      name: 'Vanitas Discord Sentinel',
      platform: 'discord',
      apiKeyId: 'key_bot_discord_02',
      status: 'online',
      lastPingAt: new Date().toISOString(),
      commandsExecuted: 8940,
      webhookUrl: 'https://discord.com/api/webhooks/...',
    },
    {
      id: 'bot_wa_agent',
      name: 'Vanitas WhatsApp Business Bridge',
      platform: 'whatsapp',
      apiKeyId: 'key_bot_discord_02',
      status: 'online',
      lastPingAt: new Date(Date.now() - 1000 * 60 * 4).toISOString(),
      commandsExecuted: 3210,
    },
    {
      id: 'bot_tg_alert',
      name: 'Telegram Ops Alert Channel',
      platform: 'telegram',
      apiKeyId: 'key_live_celestial_01',
      status: 'online',
      lastPingAt: new Date(Date.now() - 1000 * 60 * 1).toISOString(),
      commandsExecuted: 1450,
    },
  ];

  featureFlags: FeatureFlag[] = [
    {
      id: 'ff_ai_assistant',
      key: 'ENABLE_VANITAS_AI',
      name: 'Vanitas AI Copilot Engine',
      description: 'Enables Gemini-powered intelligent code, API, and security analysis.',
      enabled: true,
      adminOnly: false,
      updatedAt: '2026-08-20T10:00:00.000Z',
    },
    {
      id: 'ff_web_search',
      key: 'ENABLE_AI_WEB_SEARCH',
      name: 'AI Grounded Web & Docs Search',
      description: 'Allows the AI layer to search live documentation and official sources.',
      enabled: true,
      adminOnly: false,
      updatedAt: '2026-08-20T10:00:00.000Z',
    },
    {
      id: 'ff_beta_v2',
      key: 'ENABLE_V2_PREVIEW_API',
      name: 'v2 Graph & Event Stream API',
      description: 'Exposes experimental /api/v2/ GraphQL & SSE real-time stream endpoints.',
      enabled: true,
      adminOnly: true,
      updatedAt: '2026-08-22T14:15:00.000Z',
    },
    {
      id: 'ff_maintenance',
      key: 'SYSTEM_MAINTENANCE_MODE',
      name: 'Emergency Maintenance Lock',
      description: 'Suspends non-admin write endpoints and returns 503 Service Unavailable.',
      enabled: false,
      adminOnly: true,
      updatedAt: '2026-08-01T00:00:00.000Z',
    },
  ];

  securityThreats: SecurityThreat[] = [
    {
      id: 'thr_001',
      level: 'HIGH',
      title: 'Excessive Failed Authentication Attempts',
      description: '27 repeated invalid token handshakes detected within 3 minutes from single IP range.',
      source: 'OTHER',
      ip: '45.155.205.233',
      timestamp: new Date(Date.now() - 1000 * 60 * 35).toISOString(),
      resolved: false,
    },
    {
      id: 'thr_002',
      level: 'MEDIUM',
      title: 'New Geographical Ingress Detected',
      description: 'Account access requested from new autonomous system in Frankfurt data center.',
      source: 'APPLICATION',
      ip: '194.230.14.88',
      timestamp: new Date(Date.now() - 1000 * 60 * 120).toISOString(),
      resolved: true,
    },
  ];

  systemStats: SystemStats = {
    totalUsers: 1420,
    activeUsers: 388,
    apiRequestsToday: 8420,
    apiRequestsThisMonth: 194300,
    apiQuotaLimit: 250000,
    p95LatencyMs: 24,
    errorRate: 0.04,
    activeApiKeys: 18,
    services: {
      api: 'operational',
      auth: 'operational',
      database: 'operational',
      ai: 'operational',
      bot: 'operational',
      webhooks: 'operational',
    },
    requestBreakdown: [
      { endpoint: '/api/v1/auth/me', count: 3200, avgLatencyMs: 12, errorCount: 1 },
      { endpoint: '/api/v1/bot/execute', count: 2840, avgLatencyMs: 18, errorCount: 0 },
      { endpoint: '/api/v1/api-keys', count: 1100, avgLatencyMs: 22, errorCount: 2 },
      { endpoint: '/api/v1/ai/chat', count: 780, avgLatencyMs: 340, errorCount: 0 },
      { endpoint: '/api/v1/admin/logs', count: 500, avgLatencyMs: 35, errorCount: 0 },
    ],
    hourlyTraffic: [
      { hour: '00:00', requests: 210, errors: 0 },
      { hour: '04:00', requests: 140, errors: 0 },
      { hour: '08:00', requests: 620, errors: 1 },
      { hour: '12:00', requests: 1450, errors: 2 },
      { hour: '16:00', requests: 2100, errors: 3 },
      { hour: '20:00', requests: 1800, errors: 1 },
      { hour: 'Now', requests: 2100, errors: 0 },
    ],
  };

  // --- Methods ---

  recordAuditLog(entry: Omit<AuditLog, 'id' | 'timestamp' | 'requestId'>): AuditLog {
    const log: AuditLog = {
      ...entry,
      id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      timestamp: new Date().toISOString(),
      requestId: `req_${Math.random().toString(36).substring(2, 9)}`,
    };
    this.auditLogs.unshift(log);
    if (this.auditLogs.length > 500) {
      this.auditLogs.pop();
    }
    return log;
  }

  createSuggestion(params: Omit<ProductSuggestion, 'id' | 'createdAt' | 'status'>): ProductSuggestion {
    const suggestion: ProductSuggestion = {
      ...params,
      id: `sug_${Date.now().toString(36)}`,
      status: 'open',
      createdAt: new Date().toISOString(),
    };
    this.productSuggestions.unshift(suggestion);
    return suggestion;
  }

  updateSuggestionStatus(id: string, status: ProductSuggestion['status'], adminNote?: string): ProductSuggestion | undefined {
    const suggestion = this.productSuggestions.find((item) => item.id === id);
    if (suggestion) {
      suggestion.status = status;
      if (adminNote !== undefined) suggestion.adminNote = adminNote;
    }
    return suggestion;
  }

  assertGrantableScopes(requesterRole: UserRole, requestedScopes: PermissionScope[]): void {
    if (requesterRole === 'ADMIN') return;
    const adminOnlyScopes = ALL_SCOPES.filter((s) => s.adminOnly).map((s) => s.scope);
    const forbidden = requestedScopes.filter((s) => adminOnlyScopes.includes(s));
    if (forbidden.length > 0) {
      throw new Error(`Permission Denied: User role cannot grant administrator scopes: [${forbidden.join(', ')}]`);
    }
  }

  createApiKey(params: {
    name: string;
    ownerId: string;
    ownerName: string;
    requesterRole: UserRole;
    scopes: PermissionScope[];
    environment?: 'live' | 'test';
    rateLimitPerMin?: number;
    burstLimit?: number;
    rateLimitAlgorithm?: 'sliding_window' | 'token_bucket' | 'fixed_window';
    actionOnExceed?: 'reject_429' | 'throttle_delay' | 'alert_only';
    monthlyQuota?: number;
    expiresAt?: string | null;
  }): { key: ApiKey; rawSecret: string } {
    this.assertGrantableScopes(params.requesterRole, params.scopes);

    const env = params.environment || 'live';
    const randPart = Math.random().toString(36).substring(2, 10) + Math.random().toString(36).substring(2, 10);
    const rawSecret = `sk_${env}_vanitas_${randPart}`;
    const keyPrefix = rawSecret.substring(0, 14);
    const maskedSecret = `${keyPrefix}••••••••••••${rawSecret.slice(-4)}`;

    const rateLimitPerMin = params.rateLimitPerMin || 600;
    const burstLimit = params.burstLimit || Math.round(rateLimitPerMin * 0.05);

    const newKey: ApiKey = {
      id: `key_${env}_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`,
      name: params.name,
      keyPrefix,
      maskedSecret,
      ownerId: params.ownerId,
      ownerName: params.ownerName,
      scopes: params.scopes,
      status: 'active',
      rateLimitPerMin,
      burstLimit,
      rateLimitAlgorithm: params.rateLimitAlgorithm || 'sliding_window',
      actionOnExceed: params.actionOnExceed || 'reject_429',
      monthlyQuota: params.monthlyQuota || rateLimitPerMin * 500,
      currentUsageThisMonth: 0,
      currentRpmUsage: 0,
      usageCount: 0,
      createdAt: new Date().toISOString(),
      lastUsedAt: null,
      expiresAt: params.expiresAt || null,
      environment: env,
    };

    this.apiKeys.unshift(newKey);
    this.systemStats.activeApiKeys = this.apiKeys.filter((k) => k.status === 'active').length;

    this.recordAuditLog({
      actorId: params.ownerId,
      actorName: params.ownerName,
      actorEmail: params.ownerName,
      action: 'API_KEY_CREATED',
      category: 'KEYS',
      target: `${newKey.id} (${newKey.name})`,
      source: 'WEB',
      status: 'SUCCESS',
      ipAddress: '194.230.14.88',
      metadata: { scopes: newKey.scopes, environment: newKey.environment, rateLimitPerMin: newKey.rateLimitPerMin },
    });

    return { key: newKey, rawSecret };
  }

  rotateApiKey(keyId: string, actor: User): { key: ApiKey; rawSecret: string } {
    const key = this.apiKeys.find((k) => k.id === keyId);
    if (!key) throw new Error('API key not found');
    if (key.status === 'revoked') throw new Error('Cannot rotate a revoked key');

    if (actor.role !== 'ADMIN' && key.ownerId !== actor.id) {
      throw new Error('Forbidden: You can only rotate keys you own');
    }

    const env = key.environment;
    const randPart = Math.random().toString(36).substring(2, 10) + Math.random().toString(36).substring(2, 10);
    const rawSecret = `sk_${env}_vanitas_${randPart}`;
    const keyPrefix = rawSecret.substring(0, 14);
    key.keyPrefix = keyPrefix;
    key.maskedSecret = `${keyPrefix}••••••••••••${rawSecret.slice(-4)}`;

    this.recordAuditLog({
      actorId: actor.id,
      actorName: actor.name,
      actorEmail: actor.email,
      action: 'API_KEY_ROTATED',
      category: 'KEYS',
      target: `${key.id} (${key.name})`,
      source: 'WEB',
      status: 'SUCCESS',
      ipAddress: '194.230.14.88',
      metadata: { newPrefix: key.keyPrefix },
    });

    return { key, rawSecret };
  }

  revokeApiKey(keyId: string, actor: User, reason?: string): ApiKey {
    const key = this.apiKeys.find((k) => k.id === keyId);
    if (!key) throw new Error('API key not found');

    if (actor.role !== 'ADMIN' && key.ownerId !== actor.id) {
      throw new Error('Forbidden: You can only revoke keys you own');
    }

    key.status = 'revoked';
    this.systemStats.activeApiKeys = this.apiKeys.filter((k) => k.status === 'active').length;

    this.recordAuditLog({
      actorId: actor.id,
      actorName: actor.name,
      actorEmail: actor.email,
      action: 'API_KEY_REVOKED',
      category: 'KEYS',
      target: `${key.id} (${key.name})`,
      source: 'WEB',
      status: 'SUCCESS',
      ipAddress: '194.230.14.88',
      metadata: { reason: reason || 'User explicit revocation' },
    });

    return key;
  }

  updateApiKeyScopes(keyId: string, newScopes: PermissionScope[], actor: User): ApiKey {
    const key = this.apiKeys.find((k) => k.id === keyId);
    if (!key) throw new Error('API key not found');

    this.assertGrantableScopes(actor.role, newScopes);

    const oldScopes = [...key.scopes];
    key.scopes = newScopes;

    this.recordAuditLog({
      actorId: actor.id,
      actorName: actor.name,
      actorEmail: actor.email,
      action: 'API_KEY_SCOPES_UPDATED',
      category: 'KEYS',
      target: `${key.id} (${key.name})`,
      source: 'WEB',
      status: 'SUCCESS',
      ipAddress: '194.230.14.88',
      metadata: { oldScopes, newScopes },
    });

    return key;
  }

  updateApiKeyRateLimit(
    keyId: string,
    params: {
      rateLimitPerMin: number;
      burstLimit?: number;
      rateLimitAlgorithm?: 'sliding_window' | 'token_bucket' | 'fixed_window';
      actionOnExceed?: 'reject_429' | 'throttle_delay' | 'alert_only';
      monthlyQuota?: number;
    },
    actor: User
  ): ApiKey {
    const key = this.apiKeys.find((k) => k.id === keyId);
    if (!key) throw new Error('API key not found');

    if (actor.role !== 'ADMIN' && key.ownerId !== actor.id) {
      throw new Error('Forbidden: You can only update rate limits for keys you own');
    }

    const oldLimit = key.rateLimitPerMin;
    key.rateLimitPerMin = params.rateLimitPerMin;
    if (params.burstLimit !== undefined) key.burstLimit = params.burstLimit;
    if (params.rateLimitAlgorithm) key.rateLimitAlgorithm = params.rateLimitAlgorithm;
    if (params.actionOnExceed) key.actionOnExceed = params.actionOnExceed;
    if (params.monthlyQuota !== undefined) key.monthlyQuota = params.monthlyQuota;

    this.recordAuditLog({
      actorId: actor.id,
      actorName: actor.name,
      actorEmail: actor.email,
      action: 'API_KEY_RATE_LIMIT_UPDATED',
      category: 'KEYS',
      target: `${key.id} (${key.name}) -> ${key.rateLimitPerMin} req/m`,
      source: 'WEB',
      status: 'SUCCESS',
      ipAddress: '194.230.14.88',
      metadata: {
        oldLimit,
        newLimit: key.rateLimitPerMin,
        burstLimit: key.burstLimit,
        algorithm: key.rateLimitAlgorithm,
        actionOnExceed: key.actionOnExceed,
        monthlyQuota: key.monthlyQuota,
      },
    });

    return key;
  }

  releases: ClientRelease[] = [
    {
      id: 'rel_android_apk',
      platform: 'android',
      type: 'apk',
      name: 'Vanitas Mobile Client (Android APK)',
      version: 'v1.4.2',
      releaseDate: '2026-08-20',
      sizeMb: 28.4,
      downloadUrl: '/api/v1/download/apk',
      filename: 'vanitas-v1.4.2-arm64.apk',
      sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      minOsVersion: 'Android 9.0 (Pie) or newer (API level 28+)',
      architecture: 'Universal (arm64-v8a / armeabi-v7a / x86_64)',
      description: 'Complete Vanitas Mobile client for Android smartphones and tablets with biometric auth, offline token cache, real-time push alerts, and direct bot execution triggers.',
      features: [
        'Biometric / Fingerprint Sign-in',
        'Offline Scoped Token Cache',
        'Live Rate Limit Gauges',
        'Discord & WhatsApp Bot Trigger',
        'Push Notification Channel',
        'Low Battery Standby Engine',
      ],
      downloadsCount: 1420,
    },
    {
      id: 'rel_windows_exe',
      platform: 'windows',
      type: 'exe',
      name: 'Vanitas Desktop Client (Windows Setup EXE)',
      version: 'v1.4.2',
      releaseDate: '2026-08-20',
      sizeMb: 64.8,
      downloadUrl: '/api/v1/download/exe',
      filename: 'vanitas-desktop-setup-v1.4.2.exe',
      sha256: '8f4e2a9b7c6d5e1f0a3b2c1d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f',
      minOsVersion: 'Windows 10 / Windows 11 (64-bit)',
      architecture: 'x86_64 (DirectX 11 / OpenGL Acceleration)',
      description: 'Official Vanitas Desktop workstation app with system tray daemon, global Command Palette (Ctrl+Shift+V), local API proxy cache, and real-time security monitor.',
      features: [
        'System Tray Minimized Daemon',
        'Global Hotkey (Ctrl+Shift+V)',
        'Local Ingress Reverse Proxy',
        'Auto-Update with Code Signing',
        'Multi-Monitor Glassmorphism UI',
        'Hardware Encrypted Key Vault',
      ],
      downloadsCount: 2890,
    },
    {
      id: 'rel_macos_dmg',
      platform: 'macos',
      type: 'dmg',
      name: 'Vanitas for macOS (Universal DMG)',
      version: 'v1.4.2',
      releaseDate: '2026-08-20',
      sizeMb: 71.2,
      downloadUrl: '/api/v1/download/dmg',
      filename: 'Vanitas-v1.4.2-Universal.dmg',
      sha256: '1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b',
      minOsVersion: 'macOS 12.0 (Monterey) or newer',
      architecture: 'Universal Binary (Apple Silicon M1/M2/M3 & Intel x64)',
      description: 'Native macOS glass client featuring Menu Bar companion app, Touch ID key unlocking, and Apple Silicon optimization.',
      features: [
        'Menu Bar Status Companion',
        'Touch ID Biometric Verification',
        'Native Apple Silicon Optimization',
        'Dark Mode Ambient Glow',
        'Notification Center Integration',
      ],
      downloadsCount: 1840,
    },
    {
      id: 'rel_linux_appimage',
      platform: 'linux',
      type: 'appimage',
      name: 'Vanitas Linux Standalone (AppImage)',
      version: 'v1.4.2',
      releaseDate: '2026-08-20',
      sizeMb: 58.9,
      downloadUrl: '/api/v1/download/appimage',
      filename: 'vanitas-v1.4.2-x86_64.AppImage',
      sha256: '3f4e5d6c7b8a9f0e1d2c3b4a5f6e7d8c9b0a1f2e3d4c5b6a7f8e9d0c1b2a3f4e',
      minOsVersion: 'glibc 2.28+ (Ubuntu 20.04+, Debian 11+, Arch, Fedora)',
      architecture: 'x86_64 Standalone AppImage',
      description: 'Self-contained desktop executable package for Linux workstations and headless CLI agents.',
      features: [
        'Zero-Dependency Standalone',
        'CLI Daemon Mode (--headless)',
        'Secret Service API Integration',
        'Wayland & X11 Transparent Glass',
        'Systemd Service Generator',
      ],
      downloadsCount: 960,
    },
  ];

  recordClientDownload(type: 'apk' | 'exe' | 'dmg' | 'appimage', actor: User, source: ClientSource) {
    const release = this.releases.find((r) => r.type === type);
    if (release) {
      release.downloadsCount += 1;
    }

    this.recordAuditLog({
      actorId: actor.id,
      actorName: actor.name,
      actorEmail: actor.email,
      action: 'CLIENT_BINARY_DOWNLOADED',
      category: 'API',
      target: release ? `${release.name} (${release.filename})` : `Binary:${type}`,
      source: source || 'WEB',
      status: 'SUCCESS',
      ipAddress: '194.230.14.88',
      metadata: {
        binaryType: type,
        version: release?.version || '1.4.2',
        platform: release?.platform || type,
        sizeMb: release?.sizeMb || 0,
      },
    });

    return release;
  }

  externalDatabases: ExternalDatabaseConfig[] = [
    {
      id: 'db_supabase_prod',
      name: 'Supabase Serverless PostgreSQL (Free Tier)',
      provider: 'supabase',
      tier: 'free',
      connectionUrlMasked: 'postgresql://postgres:••••••••••••@db.supabase.co:5432/postgres',
      region: 'eu-central-1 (Frankfurt)',
      status: 'connected',
      latencyMs: 14,
      tablesCount: 18,
      storageUsedMb: 62.4,
      storageMaxMb: 500.0,
      sslEnabled: true,
      lastTestedAt: new Date().toISOString(),
    },
    {
      id: 'db_neon_branch',
      name: 'Neon Postgres (Free Scale-to-Zero)',
      provider: 'neon',
      tier: 'free',
      connectionUrlMasked: 'postgresql://neon_admin:••••••••••••@ep-misty-water.neon.tech/main',
      region: 'us-east-2 (Ohio)',
      status: 'connected',
      latencyMs: 22,
      tablesCount: 12,
      storageUsedMb: 38.1,
      storageMaxMb: 512.0,
      sslEnabled: true,
      lastTestedAt: new Date(Date.now() - 1000 * 60 * 15).toISOString(),
    },
    {
      id: 'db_upstash_redis',
      name: 'Upstash Serverless Redis (Rate Limit & Cache)',
      provider: 'upstash',
      tier: 'free',
      connectionUrlMasked: 'rediss://default:••••••••••••@eu1-rest-upstash.io:6379',
      region: 'eu-west-1 (Ireland)',
      status: 'connected',
      latencyMs: 8,
      tablesCount: 6,
      storageUsedMb: 12.0,
      storageMaxMb: 256.0,
      sslEnabled: true,
      lastTestedAt: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
    },
    {
      id: 'db_render_backend',
      name: 'Render / Railway Free Backend Service Node',
      provider: 'render',
      tier: 'free',
      connectionUrlMasked: 'https://vanitas-worker-api.onrender.com/api/v1',
      region: 'us-west-1 (Oregon)',
      status: 'connected',
      latencyMs: 29,
      tablesCount: 8,
      storageUsedMb: 18.5,
      storageMaxMb: 1000.0,
      sslEnabled: true,
      lastTestedAt: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
    },
  ];

  videoTutorials: VideoTutorialItem[] = [
    {
      id: 'vid_01_welcome',
      title: 'Vanitas Central API Gateway: Full Setup, Auth & Scopes',
      titleArabic: 'شرح منصة فانيتاس المركزية: التثبيت، التوثيق وصلاحيات المفاتيح',
      description: 'Master the core architecture of Vanitas API Gateway, generating scoped keys, setting burst limits, and monitoring telemetry.',
      category: 'getting_started',
      duration: '14:20',
      thumbnailUrl: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=640&auto=format&fit=crop',
      videoEmbedUrl: 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
      youtubeId: 'dQw4w9WgXcQ',
      badge: 'Essential Guide',
      author: 'Vanitas Core Architecture Team',
      tags: ['API Gateway', 'Authentication', 'Scopes', 'Quickstart'],
      highlights: [
        'Issuing cryptographically signed API keys',
        'Configuring sliding window rate limits',
        'Testing endpoints in the live playground',
      ],
    },
    {
      id: 'vid_02_database',
      title: 'Connecting Free Cloud Databases (Supabase & Neon) to Vanitas',
      titleArabic: 'ربط قواعد البيانات السحابية المجانية (Supabase & Neon) مع السيرفر',
      description: 'How to provision zero-cost, high-speed PostgreSQL clusters using Supabase and Neon with automatic scale-to-zero.',
      category: 'cloud_database',
      duration: '18:45',
      thumbnailUrl: 'https://images.unsplash.com/photo-1558494949-ef010cbdcc31?q=80&w=640&auto=format&fit=crop',
      videoEmbedUrl: 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
      youtubeId: 'dQw4w9WgXcQ',
      badge: 'Free Tier Database',
      author: 'Database Engineering Group',
      tags: ['PostgreSQL', 'Supabase', 'Neon', 'Free Cloud', 'SQL'],
      highlights: [
        'Creating free PostgreSQL instances in 30 seconds',
        'Setting up SSL encrypted connection strings',
        'Live schema synchronization and testing',
      ],
    },
    {
      id: 'vid_03_clients',
      title: 'Modern Client Installation & Capabilities: Android APK & Windows EXE',
      titleArabic: 'تثبيت وتشغيل تطبيقات الأجهزة الحديثة: أندرويد APK وويندوز EXE',
      description: 'Explore the modern native builds for Android 14/15 ARM64 and Windows 11 Mica Glass UI with hardware acceleration.',
      category: 'desktop_mobile',
      duration: '12:30',
      thumbnailUrl: 'https://images.unsplash.com/photo-1517694712202-14dd9538aa97?q=80&w=640&auto=format&fit=crop',
      videoEmbedUrl: 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
      youtubeId: 'dQw4w9WgXcQ',
      badge: 'Modern Devices',
      author: 'Native Systems Team',
      tags: ['Android APK', 'Windows EXE', 'ARM64', 'Mica UI'],
      highlights: [
        'Universal ARM64 & x86_64 installation',
        'Biometric authentication setup on mobile',
        'DirectX hardware acceleration on Windows 11',
      ],
    },
    {
      id: 'vid_04_bots',
      title: 'Deploying Discord & WhatsApp Bot Integrations via Webhooks',
      titleArabic: 'ربط وتشغيل بوتات ديسكورد وواتساب عبر الويب هوك',
      description: 'Configure real-time message routing, slash command dispatch, and encrypted HMAC webhook listeners.',
      category: 'bots_webhooks',
      duration: '16:10',
      thumbnailUrl: 'https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?q=80&w=640&auto=format&fit=crop',
      videoEmbedUrl: 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
      youtubeId: 'dQw4w9WgXcQ',
      badge: 'Automation',
      author: 'Bot Ingress Engineering',
      tags: ['Discord Bot', 'WhatsApp API', 'Webhooks', 'HMAC'],
      highlights: [
        'Zero-downtime webhook dispatching',
        'Signing webhook payloads with secret keys',
        'Automated failover & retry mechanism',
      ],
    },
  ];

  testDatabaseConnection(dbId: string): { success: boolean; latencyMs: number; message: string; database?: ExternalDatabaseConfig } {
    const dbItem = this.externalDatabases.find((d) => d.id === dbId);
    if (!dbItem) {
      return { success: false, latencyMs: 0, message: 'Database configuration not found' };
    }

    const latencyMs = Math.round(8 + Math.random() * 18);
    dbItem.status = 'connected';
    dbItem.latencyMs = latencyMs;
    dbItem.lastTestedAt = new Date().toISOString();

    return {
      success: true,
      latencyMs,
      message: `Successfully connected to ${dbItem.name} via SSL (${latencyMs}ms roundtrip latency).`,
      database: dbItem,
    };
  }

  addExternalDatabase(params: {
    name: string;
    provider: ExternalDatabaseConfig['provider'];
    connectionUrl: string;
    region?: string;
  }): ExternalDatabaseConfig {
    const masked = params.connectionUrl.replace(/:([^:@]+)@/, ':••••••••••••@');
    const newDb: ExternalDatabaseConfig = {
      id: `db_${params.provider}_${Date.now().toString(36)}`,
      name: params.name,
      provider: params.provider,
      tier: 'free',
      connectionUrlMasked: masked,
      region: params.region || 'us-east-1 (N. Virginia)',
      status: 'connected',
      latencyMs: Math.round(10 + Math.random() * 15),
      tablesCount: 5,
      storageUsedMb: 8.2,
      storageMaxMb: 500.0,
      sslEnabled: true,
      lastTestedAt: new Date().toISOString(),
    };
    this.externalDatabases.push(newDb);
    return newDb;
  }

  incrementRequestCount(endpoint: string, status: number, latencyMs: number) {
    this.systemStats.apiRequestsToday += 1;
    const ep = this.systemStats.requestBreakdown.find((b) => b.endpoint === endpoint);
    if (ep) {
      ep.count += 1;
      if (status >= 400) ep.errorCount += 1;
    }
  }

  getKeyUsageAnalytics(period: '24h' | '7d' | '30d' = '24h'): ApiKeyUsageResponse {
    const activeKeys = this.apiKeys;
    const now = Date.now();
    const timeSeries: ApiKeyUsagePoint[] = [];

    const intervals = period === '24h' ? 24 : period === '7d' ? 7 : 30;
    const intervalMs = period === '24h' ? 3600 * 1000 : 24 * 3600 * 1000;

    let totalVolume = 0;
    let totalThrottled = 0;
    let totalErrors = 0;
    let latencySum = 0;

    // Build timeline points
    for (let i = intervals - 1; i >= 0; i--) {
      const pointTime = new Date(now - i * intervalMs);
      let timeLabel = '';

      if (period === '24h') {
        timeLabel = pointTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      } else if (period === '7d') {
        timeLabel = pointTime.toLocaleDateString([], { weekday: 'short', month: 'numeric', day: 'numeric' });
      } else {
        timeLabel = pointTime.toLocaleDateString([], { month: 'short', day: 'numeric' });
      }

      let pointTotal = 0;
      let pointThrottled = 0;
      let pointErrors = 0;

      const point: ApiKeyUsagePoint = {
        timeLabel,
        timestamp: pointTime.toISOString(),
        totalRequests: 0,
        successCount: 0,
        throttledCount: 0,
        errorCount: 0,
        latencyMs: 0,
        p95LatencyMs: 0,
      };

      // Calculate per key distribution
      activeKeys.forEach((k) => {
        // Base seed depending on key environment and rate limit
        const baseFactor = k.environment === 'live' ? (k.id.includes('discord') ? 220 : 380) : 45;
        // Diurnal wave
        const hourOfDay = pointTime.getHours();
        const wave = 0.6 + 0.4 * Math.sin(((hourOfDay - 6) / 24) * 2 * Math.PI);
        const noise = 0.85 + 0.3 * Math.random();

        const count = Math.max(8, Math.round(baseFactor * wave * noise * (period === '24h' ? 1 : 18)));
        const throttled = Math.random() > 0.82 ? Math.round(count * (k.actionOnExceed === 'reject_429' ? 0.04 : 0.015)) : 0;
        const errs = Math.random() > 0.88 ? Math.round(count * 0.01) : 0;

        point[k.id] = count;
        pointTotal += count;
        pointThrottled += throttled;
        pointErrors += errs;
      });

      const avgLatency = Math.round(18 + Math.random() * 8 + (pointTotal > 500 ? 5 : 0));
      const p95 = Math.round(avgLatency * 1.8 + Math.random() * 10);

      point.totalRequests = pointTotal;
      point.throttledCount = pointThrottled;
      point.errorCount = pointErrors;
      point.successCount = Math.max(0, pointTotal - pointThrottled - pointErrors);
      point.latencyMs = avgLatency;
      point.p95LatencyMs = p95;

      timeSeries.push(point);

      totalVolume += pointTotal;
      totalThrottled += pointThrottled;
      totalErrors += pointErrors;
      latencySum += avgLatency;
    }

    // Build summaries for each key
    const summaries: ApiKeyUsageSummary[] = activeKeys.map((k) => {
      const keyRequests = timeSeries.reduce((acc, pt) => acc + (Number(pt[k.id]) || 0), 0);
      const throttledRatio = k.environment === 'live' ? 0.024 : 0.008;
      const keyThrottled = Math.round(keyRequests * throttledRatio);
      const quota = k.monthlyQuota || 200000;
      const quotaUsedPercent = Math.min(100, Math.round((keyRequests / quota) * 100));

      const endpoints = [
        { endpoint: '/api/v1/bot/execute', count: Math.round(keyRequests * 0.42), percentage: 42 },
        { endpoint: '/api/v1/users/me', count: Math.round(keyRequests * 0.28), percentage: 28 },
        { endpoint: '/api/v1/webhooks/dispatch', count: Math.round(keyRequests * 0.18), percentage: 18 },
        { endpoint: '/api/v1/ai/chat', count: Math.round(keyRequests * 0.12), percentage: 12 },
      ];

      return {
        keyId: k.id,
        keyName: k.name,
        keyPrefix: k.keyPrefix,
        environment: k.environment,
        rateLimitPerMin: k.rateLimitPerMin,
        totalRequests: keyRequests,
        successRate: Number(((1 - (keyThrottled + keyRequests * 0.008) / keyRequests) * 100).toFixed(1)),
        throttledRequests: keyThrottled,
        quotaUsedPercent,
        peakRpm: Math.round(k.rateLimitPerMin * (0.65 + Math.random() * 0.25)),
        avgLatencyMs: Math.round(19 + Math.random() * 6),
        topEndpoints: endpoints,
      };
    });

    return {
      period,
      timeSeries,
      summaries,
      totalVolume,
      overallSuccessRate: Number(((1 - (totalThrottled + totalErrors) / totalVolume) * 100).toFixed(1)),
      overallThrottledCount: totalThrottled,
      overallAvgLatencyMs: Math.round(latencySum / (timeSeries.length || 1)),
    };
  }
}

export const db = new VanitasDatabase();
