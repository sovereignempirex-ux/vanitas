import crypto from 'crypto';
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
} from '../types.ts';

/**
 * One real API-key request, recorded on response 'finish' by
 * authenticateApiKey. status/latency/ts are observed facts — this is the
 * single source of truth for the usage-analytics chart.
 */
export interface ApiKeyUsageEvent {
  /** epoch ms when the response finished */
  ts: number;
  keyId: string;
  ownerId: string;
  /** full request path, e.g. /api/v1/public/ping */
  path: string;
  status: number;
  latencyMs: number;
}

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

// ---------------------------------------------------------------------------
// API key secret hashing
// Raw secrets (sk_live_vanitas_…) are NEVER persisted. We keep only sha256 hex.
// The hash is attached NON-ENUMERABLE so JSON.stringify can never leak it.
// ---------------------------------------------------------------------------
export function hashApiKeySecret(rawSecret: string): string {
  return crypto.createHash('sha256').update(rawSecret, 'utf8').digest('hex');
}

export function attachSecretHash(key: ApiKey, hash: string): void {
  Object.defineProperty(key, 'secretHash', {
    value: hash,
    enumerable: false,
    writable: true,
    configurable: true,
  });
}

export class VanitasDatabase {
  // DELIBERATELY EMPTY: no seeded/fake suggestions or comments — ever.
  productSuggestions: ProductSuggestion[] = [];

  // DELIBERATELY EMPTY: real accounts only. The first registration bootstraps
  // as ADMIN (pickInitialRole) — no demo personas exist anywhere.
  users: User[] = [];

  // DELIBERATELY EMPTY: keys are created by real accounts only.
  apiKeys: ApiKey[] = [];

  // DELIBERATELY EMPTY: only real audit events are recorded at runtime.
  auditLogs: AuditLog[] = [];

  // DELIBERATELY EMPTY: no fake devices — real sessions live in auth_sessions.
  sessions: SessionDevice[] = [];

  // DELIBERATELY EMPTY: only real webhook endpoints configured by users.
  webhooks: WebhookEndpoint[] = [];

  // DELIBERATELY EMPTY: only real delivery logs at runtime.
  webhookLogs: WebhookDeliveryLog[] = [];

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

  // DELIBERATELY EMPTY: threats are detected/reported at runtime, never faked.
  securityThreats: SecurityThreat[] = [];

  systemStats: SystemStats = {
    // Counters start at ZERO and are counted for real at runtime
    // (incrementRequestCount + live DB counts in /admin/statistics).
    // No fabricated telemetry.
    totalUsers: 0,
    activeUsers: 0,
    apiRequestsToday: 0,
    apiRequestsThisMonth: 0,
    apiQuotaLimit: 250000,
    p95LatencyMs: 0,
    errorRate: 0,
    activeApiKeys: 0,
    services: {
      api: 'operational',
      auth: 'operational',
      database: 'operational',
      ai: 'operational',
      bot: 'operational',
      webhooks: 'operational',
    },
    requestBreakdown: [],
    hourlyTraffic: [],
  };

  // --- Real API-key usage telemetry ----------------------------------------
  // Every entry is recorded by authenticateApiKey on response 'finish' — a
  // raw, append-only account of what actually happened. The ring is bounded;
  // like the keys themselves it lives for the process (memory-mode PG shares
  // the same lifetime), so analytics NEVER invent data for periods that were
  // not observed: unobserved buckets stay at zero.
  apiKeyUsageEvents: ApiKeyUsageEvent[] = [];
  /** Rolling latency samples for the live p95 (fed by incrementRequestCount). */
  private requestLatencies: number[] = [];
  private latencySampleCount = 0;

  static readonly USAGE_EVENT_CAP = 20_000;
  static readonly LATENCY_SAMPLE_CAP = 1_000;

  recordApiKeyUsage(event: ApiKeyUsageEvent): void {
    this.apiKeyUsageEvents.push(event);
    // Trim in chunks so a hot path never does a full-array shift per request.
    if (this.apiKeyUsageEvents.length > VanitasDatabase.USAGE_EVENT_CAP + 1000) {
      this.apiKeyUsageEvents.splice(0, this.apiKeyUsageEvents.length - VanitasDatabase.USAGE_EVENT_CAP);
    }
  }

  // --- Methods ---

  recordAuditLog(entry: Omit<AuditLog, 'id' | 'timestamp' | 'requestId'>): AuditLog {
    const log: AuditLog = {
      ...entry,
      id: `log_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
      timestamp: new Date().toISOString(),
      requestId: `req_${crypto.randomBytes(5).toString('hex')}`,
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
    const randPart = crypto.randomBytes(18).toString('base64url');
    const rawSecret = `sk_${env}_vanitas_${randPart}`;
    const keyPrefix = rawSecret.substring(0, 14);
    const maskedSecret = `${keyPrefix}••••••••••••${rawSecret.slice(-4)}`;

    const rateLimitPerMin = params.rateLimitPerMin || 600;
    const burstLimit = params.burstLimit || Math.round(rateLimitPerMin * 0.05);

    const newKey: ApiKey = {
      id: `key_${env}_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`,
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
      usagePeriod: new Date().toISOString().slice(0, 7),
      createdAt: new Date().toISOString(),
      lastUsedAt: null,
      expiresAt: params.expiresAt || null,
      environment: env,
    };
    // sha256(secret) — non-enumerable so it is never serialized to any client.
    attachSecretHash(newKey, hashApiKeySecret(rawSecret));

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
      ipAddress: 'unknown', // db-layer call has no request context — never fake an IP
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
    const randPart = crypto.randomBytes(18).toString('base64url');
    const rawSecret = `sk_${env}_vanitas_${randPart}`;
    const keyPrefix = rawSecret.substring(0, 14);
    key.keyPrefix = keyPrefix;
    key.maskedSecret = `${keyPrefix}••••••••••••${rawSecret.slice(-4)}`;
    // Invalidate the old secret: re-bind the hash to the freshly rotated value.
    attachSecretHash(key, hashApiKeySecret(rawSecret));

    this.recordAuditLog({
      actorId: actor.id,
      actorName: actor.name,
      actorEmail: actor.email,
      action: 'API_KEY_ROTATED',
      category: 'KEYS',
      target: `${key.id} (${key.name})`,
      source: 'WEB',
      status: 'SUCCESS',
      ipAddress: 'unknown', // db-layer call has no request context — never fake an IP
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
      ipAddress: 'unknown', // db-layer call has no request context — never fake an IP
      metadata: { reason: reason || 'User explicit revocation' },
    });

    return key;
  }

  updateApiKeyScopes(keyId: string, newScopes: PermissionScope[], actor: User): ApiKey {
    const key = this.apiKeys.find((k) => k.id === keyId);
    if (!key) throw new Error('API key not found');

    // Same ownership rule as rotate/revoke/rate-limit: you may only widen or
    // narrow the scopes of a key you own (admins excepted).
    if (actor.role !== 'ADMIN' && key.ownerId !== actor.id) {
      throw new Error('Forbidden: You can only update scopes for keys you own');
    }

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
      ipAddress: 'unknown', // db-layer call has no request context — never fake an IP
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
      ipAddress: 'unknown', // db-layer call has no request context — never fake an IP
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
      ipAddress: 'unknown', // db-layer call has no request context — never fake an IP
      metadata: {
        binaryType: type,
        version: release?.version || '1.4.2',
        platform: release?.platform || type,
        sizeMb: release?.sizeMb || 0,
      },
    });

    return release;
  }

  // Configured external endpoints (fixture). Metadata is honest: every entry
  // starts 'idle' with zeroed metrics — an entry never claims to be
  // "connected" or shows a latency until an admin runs a REAL probe against
  // it (see /api/v1/databases/external/test).
  externalDatabases: ExternalDatabaseConfig[] = [
    {
      id: 'db_supabase_prod',
      name: 'Supabase Serverless PostgreSQL (Free Tier)',
      provider: 'supabase',
      tier: 'free',
      connectionUrlMasked: 'postgresql://postgres:••••••••••••@db.supabase.co:5432/postgres',
      region: 'eu-central-1 (Frankfurt)',
      status: 'idle',
      latencyMs: 0,
      tablesCount: 0,
      storageUsedMb: 0,
      storageMaxMb: 0,
      sslEnabled: false, // sslmode not stated in the URL — unverified
    },
    {
      id: 'db_neon_branch',
      name: 'Neon Postgres (Free Scale-to-Zero)',
      provider: 'neon',
      tier: 'free',
      connectionUrlMasked: 'postgresql://neon_admin:••••••••••••@ep-misty-water.neon.tech/main',
      region: 'us-east-2 (Ohio)',
      status: 'idle',
      latencyMs: 0,
      tablesCount: 0,
      storageUsedMb: 0,
      storageMaxMb: 0,
      sslEnabled: false, // sslmode not stated in the URL — unverified
    },
    {
      id: 'db_upstash_redis',
      name: 'Upstash Serverless Redis (Rate Limit & Cache)',
      provider: 'upstash',
      tier: 'free',
      connectionUrlMasked: 'rediss://default:••••••••••••@eu1-rest-upstash.io:6379',
      region: 'eu-west-1 (Ireland)',
      status: 'idle',
      latencyMs: 0,
      tablesCount: 0,
      storageUsedMb: 0,
      storageMaxMb: 0,
      sslEnabled: true, // rediss:// scheme proves TLS
    },
    {
      id: 'db_render_backend',
      name: 'Render / Railway Free Backend Service Node',
      provider: 'render',
      tier: 'free',
      connectionUrlMasked: 'https://vanitas-worker-api.onrender.com/api/v1',
      region: 'us-west-1 (Oregon)',
      status: 'idle',
      latencyMs: 0,
      tablesCount: 0,
      storageUsedMb: 0,
      storageMaxMb: 0,
      sslEnabled: true, // https:// scheme proves TLS
    },
  ];

  getExternalDatabase(dbId: string): ExternalDatabaseConfig | undefined {
    return this.externalDatabases.find((d) => d.id === dbId);
  }

  /**
   * Persist the outcome of a REAL probe. The dial itself happens in
   * server.ts (it owns sanitizeUrl and the network policy) — this method only
   * records what actually happened: measured latency and the true verdict.
   */
  markDatabaseTested(dbId: string, success: boolean, latencyMs: number): ExternalDatabaseConfig | undefined {
    const dbItem = this.externalDatabases.find((d) => d.id === dbId);
    if (!dbItem) return undefined;
    dbItem.status = success ? 'connected' : 'unreachable';
    dbItem.latencyMs = Math.max(0, Math.round(latencyMs));
    dbItem.lastTestedAt = new Date().toISOString();
    return dbItem;
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
      // Honest defaults: a freshly stored config is UNTESTED — zeroed metrics
      // and no lastTestedAt until an admin runs a real probe.
      status: 'idle',
      latencyMs: 0,
      tablesCount: 0,
      storageUsedMb: 0,
      storageMaxMb: 0,
      // TLS is only claimed when the scheme itself proves it.
      sslEnabled: /^https:\/\//i.test(params.connectionUrl) || /^rediss:\/\//i.test(params.connectionUrl),
    };
    this.externalDatabases.push(newDb);
    return newDb;
  }

  incrementRequestCount(endpoint: string, status: number, latencyMs: number) {
    this.systemStats.apiRequestsToday += 1;
    this.systemStats.apiRequestsThisMonth += 1;
    let ep = this.systemStats.requestBreakdown.find((b) => b.endpoint === endpoint);
    if (!ep && this.systemStats.requestBreakdown.length < 12) {
      // Real traffic builds this list over time (bounded to keep it readable).
      ep = { endpoint, count: 0, avgLatencyMs: latencyMs, errorCount: 0 };
      this.systemStats.requestBreakdown.push(ep);
    }
    if (ep) {
      ep.count += 1;
      if (status >= 400) ep.errorCount += 1;
      ep.avgLatencyMs = Math.round(ep.avgLatencyMs * 0.85 + latencyMs * 0.15);
    }

    // --- Live hourly histogram (real, last 24 clock hours of /api traffic) ---
    const hourKey = new Date().toISOString().slice(0, 13); // '2026-10-03T21'
    const buckets = this.systemStats.hourlyTraffic;
    let bucket = buckets.length > 0 ? buckets[buckets.length - 1] : null;
    if (!bucket || bucket.hour !== hourKey) {
      if (bucket && bucket.hour > hourKey) {
        // Clock moved backwards — reuse the existing bucket for that hour.
        bucket = buckets.find((b) => b.hour === hourKey) || null;
      }
      if (!bucket) {
        bucket = { hour: hourKey, requests: 0, errors: 0 };
        buckets.push(bucket);
        while (buckets.length > 24) buckets.shift();
      }
    }
    bucket.requests += 1;
    if (status >= 400) bucket.errors += 1;

    // --- Derived metrics: real p95 + error rate, recomputed on a sample
    // cadence so the hot path never sorts on every single request. ---
    this.requestLatencies.push(latencyMs);
    if (this.requestLatencies.length > VanitasDatabase.LATENCY_SAMPLE_CAP) this.requestLatencies.shift();
    this.latencySampleCount += 1;
    if (this.latencySampleCount % 10 === 0) {
      const sorted = [...this.requestLatencies].sort((a, b) => a - b);
      const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil(0.95 * sorted.length) - 1));
      this.systemStats.p95LatencyMs = sorted[idx] ?? 0;

      let reqs = 0;
      let errs = 0;
      for (const b of this.systemStats.hourlyTraffic) {
        reqs += b.requests;
        errs += b.errors;
      }
      this.systemStats.errorRate = reqs > 0 ? Number((errs / reqs).toFixed(4)) : 0;
    }
  }

  /**
   * Zero-filled last-24-hours view of the real hourly histogram. Hours with
   * no traffic are honestly reported as 0 — buckets are never interpolated.
   */
  getHourlyTraffic24h(): { hour: string; requests: number; errors: number }[] {
    const series: { hour: string; requests: number; errors: number }[] = [];
    const recorded = new Map(this.systemStats.hourlyTraffic.map((b) => [b.hour, b]));
    for (let i = 23; i >= 0; i--) {
      const hourKey = new Date(Date.now() - i * 3600_000).toISOString().slice(0, 13);
      const hit = recorded.get(hourKey);
      series.push({ hour: hourKey, requests: hit?.requests || 0, errors: hit?.errors || 0 });
    }
    return series;
  }

  getKeyUsageAnalytics(period: '24h' | '7d' | '30d' = '24h', ownerId: string | null = null): ApiKeyUsageResponse {
    // ownerId = null → fleet-wide view (admin); otherwise only that owner's
    // keys/events are summarised — no cross-tenant leakage of key metadata.
    //
    // EVERY number below is aggregated from apiKeyUsageEvents — the raw
    // request facts recorded on response finish. Buckets with no observed
    // traffic stay at zero; nothing is ever interpolated or randomised.
    const activeKeys = ownerId === null ? this.apiKeys : this.apiKeys.filter((k) => k.ownerId === ownerId);
    const now = Date.now();
    const timeSeries: ApiKeyUsagePoint[] = [];

    const intervals = period === '24h' ? 24 : period === '7d' ? 7 : 30;
    const intervalMs = period === '24h' ? 3600 * 1000 : 24 * 3600 * 1000;
    const windowMs = intervalMs * intervals;
    const windowStart = now - windowMs;

    const events = this.apiKeyUsageEvents.filter(
      (e) => e.ts > windowStart && e.ts <= now && (ownerId === null || e.ownerId === ownerId),
    );

    let totalVolume = 0;
    let totalThrottled = 0;
    let totalErrors = 0;
    let latencySum = 0;

    // Per-bucket accumulators (index 0 = oldest bucket).
    const buckets = Array.from({ length: intervals }, () => ({
      total: 0,
      throttled: 0,
      errors: 0,
      latencies: [] as number[],
      perKey: new Map<string, { n: number; t: number; e: number }>(),
    }));

    for (const ev of events) {
      let idx = Math.floor((ev.ts - windowStart) / intervalMs);
      if (idx < 0) idx = 0;
      if (idx >= intervals) idx = intervals - 1;
      const b = buckets[idx];
      b.total += 1;
      if (ev.status === 429) b.throttled += 1;
      else if (ev.status >= 400) b.errors += 1;
      b.latencies.push(ev.latencyMs);
      const agg = b.perKey.get(ev.keyId) || { n: 0, t: 0, e: 0 };
      agg.n += 1;
      if (ev.status === 429) agg.t += 1;
      else if (ev.status >= 400) agg.e += 1;
      b.perKey.set(ev.keyId, agg);

      totalVolume += 1;
      if (ev.status === 429) totalThrottled += 1;
      else if (ev.status >= 400) totalErrors += 1;
      latencySum += ev.latencyMs;
    }

    // Build the timeline oldest → newest (bucket i covers
    // (windowStart + i*intervalMs, windowStart + (i+1)*intervalMs]).
    for (let i = 0; i < intervals; i++) {
      const b = buckets[i];
      const pointTime = new Date(windowStart + (i + 1) * intervalMs);
      let timeLabel = '';

      if (period === '24h') {
        timeLabel = pointTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      } else if (period === '7d') {
        timeLabel = pointTime.toLocaleDateString([], { weekday: 'short', month: 'numeric', day: 'numeric' });
      } else {
        timeLabel = pointTime.toLocaleDateString([], { month: 'short', day: 'numeric' });
      }

      b.latencies.sort((x, y) => x - y);
      const avgLatency =
        b.latencies.length > 0 ? Math.round(b.latencies.reduce((s, v) => s + v, 0) / b.latencies.length) : 0;
      const p95Idx =
        b.latencies.length > 0 ? Math.min(b.latencies.length - 1, Math.ceil(0.95 * b.latencies.length) - 1) : -1;

      const point: ApiKeyUsagePoint = {
        timeLabel,
        timestamp: pointTime.toISOString(),
        totalRequests: b.total,
        successCount: Math.max(0, b.total - b.throttled - b.errors),
        throttledCount: b.throttled,
        errorCount: b.errors,
        latencyMs: avgLatency,
        p95LatencyMs: p95Idx >= 0 ? b.latencies[p95Idx] : 0,
      };
      // Per-key series: real totals plus real throttled/error splits (the
      // chart reads <keyId>__t / <keyId>__e when a single key is selected —
      // no derived ratios anywhere).
      for (const k of activeKeys) {
        const agg = b.perKey.get(k.id);
        point[k.id] = agg ? agg.n : 0;
        point[`${k.id}__t`] = agg ? agg.t : 0;
        point[`${k.id}__e`] = agg ? agg.e : 0;
      }

      timeSeries.push(point);
    }

    // Per-key summaries — same window, same real events.
    const summaries: ApiKeyUsageSummary[] = activeKeys.map((k) => {
      const keyEvents = events.filter((e) => e.keyId === k.id);
      const keyRequests = keyEvents.length;
      const keyThrottled = keyEvents.filter((e) => e.status === 429).length;
      const keyErrors = keyEvents.filter((e) => e.status >= 400 && e.status !== 429).length;
      const successRate =
        keyRequests > 0 ? Number((((keyRequests - keyThrottled - keyErrors) / keyRequests) * 100).toFixed(1)) : 0;

      // Quota progress uses the REAL monthly usage counter — a key with no
      // configured quota reports 0 instead of assuming a fake denominator.
      const quota = k.monthlyQuota || 0;
      const used = k.currentUsageThisMonth || 0;
      const quotaUsedPercent = quota > 0 ? Math.min(100, Math.round((used / quota) * 100)) : 0;

      // Peak RPM = densest real clock-minute in the window (0 with no
      // traffic); top endpoints come from the paths actually called.
      const minuteCounts = new Map<number, number>();
      const epCounts = new Map<string, number>();
      let keyLatencySum = 0;
      for (const e of keyEvents) {
        const minute = Math.floor(e.ts / 60_000);
        minuteCounts.set(minute, (minuteCounts.get(minute) || 0) + 1);
        epCounts.set(e.path, (epCounts.get(e.path) || 0) + 1);
        keyLatencySum += e.latencyMs;
      }
      let peakRpm = 0;
      minuteCounts.forEach((count) => {
        if (count > peakRpm) peakRpm = count;
      });

      const topEndpoints = [...epCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 4)
        .map(([endpoint, count]) => ({
          endpoint,
          count,
          percentage: Math.round((count / Math.max(1, keyRequests)) * 100),
        }));

      return {
        keyId: k.id,
        keyName: k.name,
        keyPrefix: k.keyPrefix,
        environment: k.environment,
        rateLimitPerMin: k.rateLimitPerMin,
        totalRequests: keyRequests,
        successRate,
        throttledRequests: keyThrottled,
        errorCount: keyErrors,
        quotaUsedPercent,
        peakRpm,
        avgLatencyMs: keyRequests > 0 ? Math.round(keyLatencySum / keyRequests) : 0,
        topEndpoints,
      };
    });

    return {
      period,
      timeSeries,
      summaries,
      totalVolume,
      overallSuccessRate:
        totalVolume > 0 ? Number((((totalVolume - totalThrottled - totalErrors) / totalVolume) * 100).toFixed(1)) : 0,
      overallThrottledCount: totalThrottled,
      overallErrorCount: totalErrors,
      overallAvgLatencyMs: totalVolume > 0 ? Math.round(latencySum / totalVolume) : 0,
    };
  }
}

export const db = new VanitasDatabase();
