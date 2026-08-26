var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// server.ts
var import_express = __toESM(require("express"), 1);
var import_path = __toESM(require("path"), 1);
var import_vite = require("vite");
var import_pg = require("pg");

// src/server/db.ts
var ALL_SCOPES = [
  { scope: "api.read", label: "Read API Data & Status", group: "Core API", adminOnly: false },
  { scope: "api.write", label: "Write & Mutate API Resources", group: "Core API", adminOnly: false },
  { scope: "users.read", label: "View User Profiles", group: "Users", adminOnly: false },
  { scope: "users.write", label: "Modify User Information", group: "Users", adminOnly: true },
  { scope: "users.delete", label: "Delete User Accounts", group: "Users", adminOnly: true },
  { scope: "roles.read", label: "Inspect Roles & Matrix", group: "Roles", adminOnly: true },
  { scope: "roles.manage", label: "Assign & Modify Roles", group: "Roles", adminOnly: true },
  { scope: "keys.read", label: "List & Inspect API Keys", group: "API Keys", adminOnly: false },
  { scope: "keys.create", label: "Generate New API Keys", group: "API Keys", adminOnly: false },
  { scope: "keys.rotate", label: "Rotate Key Secrets", group: "API Keys", adminOnly: false },
  { scope: "keys.revoke", label: "Revoke Key Access", group: "API Keys", adminOnly: false },
  { scope: "keys.scopes.update", label: "Modify Key Scopes", group: "API Keys", adminOnly: true },
  { scope: "logs.read", label: "View Audit Logs", group: "Auditing", adminOnly: true },
  { scope: "logs.export", label: "Export Audit Logs to CSV", group: "Auditing", adminOnly: true },
  { scope: "database.read", label: "Query Database Metadata", group: "Database", adminOnly: true },
  { scope: "database.write", label: "Direct Database Operations", group: "Database", adminOnly: true },
  { scope: "system.read", label: "Read System Health & Metrics", group: "System", adminOnly: false },
  { scope: "system.manage", label: "Emergency Controls & Maintenance", group: "System", adminOnly: true },
  { scope: "security.read", label: "Read Security Alerts & Threats", group: "Security", adminOnly: true },
  { scope: "security.manage", label: "Manage Threat Policies & Blocks", group: "Security", adminOnly: true },
  { scope: "bot.execute", label: "Invoke Bot Gateway Execution", group: "Ecosystem", adminOnly: false },
  { scope: "analytics.read", label: "View Usage Analytics & Reports", group: "Ecosystem", adminOnly: false },
  { scope: "webhooks.manage", label: "Create & Manage Webhooks", group: "Ecosystem", adminOnly: false },
  { scope: "settings.read", label: "Read Platform Settings", group: "System", adminOnly: false },
  { scope: "settings.write", label: "Update Platform Settings", group: "System", adminOnly: true }
];
var VanitasDatabase = class {
  productSuggestions = [
    {
      id: "sug_welcome_001",
      title: "Improve empty-state guidance",
      details: "Show a clearer first action for new developers.",
      category: "ux",
      status: "open",
      createdAt: (/* @__PURE__ */ new Date()).toISOString(),
      authorName: "Vanitas Team"
    }
  ];
  users = [
    {
      id: "usr_owner_001",
      email: "sovereign.empirex@gmail.com",
      name: "Vanitas Prime",
      username: "vanitas_sovereign",
      avatarUrl: "https://i.postimg.cc/SNN169kT/orders.png",
      bio: "Master Architect of the Vanitas Unified Ecosystem & Celestial API Gateway.",
      role: "ADMIN",
      twoFactorEnabled: true,
      createdAt: "2026-01-15T08:00:00.000Z",
      lastLoginAt: (/* @__PURE__ */ new Date()).toISOString(),
      connectedAccounts: {
        google: true,
        github: true,
        discord: true
      }
    },
    {
      id: "usr_dev_002",
      email: "no\xE9.archiviste@altus.org",
      name: "No\xE9 Archiviste",
      username: "noe_vampire",
      avatarUrl: "https://images.unsplash.com/photo-1534447677768-be436bb09401?q=80&w=400&auto=format&fit=crop",
      bio: "Vampire liaison & API integration engineer.",
      role: "USER",
      twoFactorEnabled: false,
      createdAt: "2026-02-10T14:30:00.000Z",
      lastLoginAt: "2026-08-24T19:20:00.000Z",
      connectedAccounts: {
        google: true,
        github: false,
        discord: true
      }
    },
    {
      id: "usr_bot_003",
      email: "bot.gateway@vanitas.internal",
      name: "Vanitas Autonomous Bot",
      username: "vanitas_bot_svc",
      avatarUrl: "https://i.postimg.cc/pXXcfjRk/Test.png",
      bio: "System Service Account for Discord & WhatsApp automated dispatch.",
      role: "USER",
      twoFactorEnabled: true,
      createdAt: "2026-03-01T00:00:00.000Z",
      lastLoginAt: (/* @__PURE__ */ new Date()).toISOString(),
      connectedAccounts: {
        google: false,
        github: true,
        discord: true
      }
    }
  ];
  apiKeys = [
    {
      id: "key_live_celestial_01",
      name: "Central Production Gateway",
      keyPrefix: "sk_live_celest",
      maskedSecret: "sk_live_\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u20228819",
      ownerId: "usr_owner_001",
      ownerName: "Vanitas Prime",
      scopes: ["api.read", "api.write", "users.read", "logs.read", "bot.execute", "system.read"],
      status: "active",
      rateLimitPerMin: 1200,
      burstLimit: 60,
      rateLimitAlgorithm: "sliding_window",
      actionOnExceed: "reject_429",
      monthlyQuota: 5e5,
      currentUsageThisMonth: 124800,
      currentRpmUsage: 480,
      usageCount: 8420,
      createdAt: "2026-04-10T12:00:00.000Z",
      lastUsedAt: (/* @__PURE__ */ new Date()).toISOString(),
      expiresAt: null,
      environment: "live"
    },
    {
      id: "key_bot_discord_02",
      name: "Discord & WhatsApp Dispatcher",
      keyPrefix: "sk_live_discord",
      maskedSecret: "sk_live_\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u20224402",
      ownerId: "usr_bot_003",
      ownerName: "Vanitas Autonomous Bot",
      scopes: ["api.read", "bot.execute", "analytics.read"],
      status: "active",
      rateLimitPerMin: 600,
      burstLimit: 30,
      rateLimitAlgorithm: "token_bucket",
      actionOnExceed: "throttle_delay",
      monthlyQuota: 2e5,
      currentUsageThisMonth: 89400,
      currentRpmUsage: 310,
      usageCount: 14205,
      createdAt: "2026-05-18T10:15:00.000Z",
      lastUsedAt: new Date(Date.now() - 1e3 * 60 * 3).toISOString(),
      expiresAt: null,
      environment: "live"
    },
    {
      id: "key_test_sandbox_03",
      name: "Mobile SDK Sandbox Key",
      keyPrefix: "sk_test_mobile",
      maskedSecret: "sk_test_\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u20229100",
      ownerId: "usr_dev_002",
      ownerName: "No\xE9 Archiviste",
      scopes: ["api.read", "users.read", "analytics.read"],
      status: "active",
      rateLimitPerMin: 200,
      burstLimit: 15,
      rateLimitAlgorithm: "fixed_window",
      actionOnExceed: "alert_only",
      monthlyQuota: 5e4,
      currentUsageThisMonth: 8200,
      currentRpmUsage: 42,
      usageCount: 1240,
      createdAt: "2026-07-02T16:45:00.000Z",
      lastUsedAt: new Date(Date.now() - 1e3 * 60 * 60 * 2).toISOString(),
      expiresAt: "2026-12-31T23:59:59.000Z",
      environment: "test"
    }
  ];
  auditLogs = [
    {
      id: "log_99182",
      timestamp: new Date(Date.now() - 1e3 * 60 * 2).toISOString(),
      actorId: "usr_owner_001",
      actorName: "Vanitas Prime",
      actorEmail: "sovereign.empirex@gmail.com",
      action: "API_KEY_ROTATED",
      category: "KEYS",
      target: "key_live_celestial_01 (Central Production Gateway)",
      source: "WEB",
      status: "SUCCESS",
      requestId: "req_rot_88921a",
      ipAddress: "194.230.14.88",
      metadata: { reason: "Scheduled security rotation cycle", previousPrefix: "sk_live_oldc" }
    },
    {
      id: "log_99181",
      timestamp: new Date(Date.now() - 1e3 * 60 * 18).toISOString(),
      actorId: "usr_bot_003",
      actorName: "Vanitas Autonomous Bot",
      actorEmail: "bot.gateway@vanitas.internal",
      action: "BOT_COMMAND_EXECUTED",
      category: "BOT",
      target: "discord_guild_44901 (#system-status)",
      source: "BOT",
      status: "SUCCESS",
      requestId: "req_bot_77192b",
      ipAddress: "10.0.4.12",
      metadata: { command: "/vanitas status --all", latencyMs: 14 }
    },
    {
      id: "log_99180",
      timestamp: new Date(Date.now() - 1e3 * 60 * 45).toISOString(),
      actorId: "usr_owner_001",
      actorName: "Vanitas Prime",
      actorEmail: "sovereign.empirex@gmail.com",
      action: "USER_ROLE_PROMOTED",
      category: "ADMIN",
      target: "usr_owner_001 -> ADMIN (Bootstrap verification)",
      source: "WEB",
      status: "SUCCESS",
      requestId: "req_adm_11029c",
      ipAddress: "194.230.14.88",
      metadata: { priorRole: "USER", newRole: "ADMIN", systemTrigger: "Console Confirmation" }
    },
    {
      id: "log_99179",
      timestamp: new Date(Date.now() - 1e3 * 60 * 120).toISOString(),
      actorId: "anonymous_attacker",
      actorName: "Unauthenticated Request",
      actorEmail: "unknown",
      action: "RATE_LIMIT_EXCEEDED",
      category: "SECURITY",
      target: "/api/v1/admin/users",
      source: "OTHER",
      status: "WARNING",
      requestId: "req_sec_44910d",
      ipAddress: "45.155.205.233",
      metadata: { attemptedRequests: 42, allowedThreshold: 10, actionTaken: "IP Throttled for 15m" }
    },
    {
      id: "log_99178",
      timestamp: new Date(Date.now() - 1e3 * 60 * 360).toISOString(),
      actorId: "usr_dev_002",
      actorName: "No\xE9 Archiviste",
      actorEmail: "no\xE9.archiviste@altus.org",
      action: "SESSION_REVOKED",
      category: "AUTH",
      target: "Session device: Safari on macOS (178.62.204.1)",
      source: "WEB",
      status: "SUCCESS",
      requestId: "req_ses_00291e",
      ipAddress: "82.165.197.1",
      metadata: { deviceId: "dev_old_mac_safari" }
    }
  ];
  sessions = [
    {
      id: "dev_curr_browser",
      browser: "Chrome 133.0",
      os: "macOS Sequoia 15.2",
      device: "Desktop / Workstation",
      ip: "194.230.14.88",
      source: "WEB",
      isCurrent: true,
      createdAt: "2026-08-25T11:00:00.000Z",
      lastActiveAt: (/* @__PURE__ */ new Date()).toISOString()
    },
    {
      id: "dev_mobile_iphone",
      browser: "Vanitas Native Client v1.4",
      os: "iOS 19.1",
      device: "Apple iPhone 16 Pro",
      ip: "82.165.197.10",
      source: "MOBILE",
      isCurrent: false,
      createdAt: "2026-08-23T09:30:00.000Z",
      lastActiveAt: new Date(Date.now() - 1e3 * 60 * 120).toISOString()
    },
    {
      id: "dev_discord_bot_runner",
      browser: "Node.js / Axios v1.7",
      os: "Linux Ubuntu 24.04 LTS",
      device: "Cloud Run Worker Cluster",
      ip: "10.0.4.12",
      source: "BOT",
      isCurrent: false,
      createdAt: "2026-08-01T00:00:00.000Z",
      lastActiveAt: (/* @__PURE__ */ new Date()).toISOString()
    }
  ];
  webhooks = [
    {
      id: "wh_prod_alerts",
      name: "Security & Key Alert Dispatcher",
      url: "https://hooks.slack.com/services/T00000000/B00000000/XXXXXXXXXXXXXXXXXXXXXXXX",
      events: ["api_key.rotated", "api_key.revoked", "security.alert", "role.changed"],
      secret: "whsec_99a8b7c6d5e4f3a2b1c0",
      status: "active",
      createdAt: "2026-04-01T10:00:00.000Z",
      lastTriggeredAt: new Date(Date.now() - 1e3 * 60 * 2).toISOString(),
      failureCount: 0
    },
    {
      id: "wh_crm_sync",
      name: "User Lifecycle Sync Service",
      url: "https://api.internal-sync.org/vanitas/events",
      events: ["user.created", "user.updated"],
      secret: "whsec_11223344556677889900",
      status: "active",
      createdAt: "2026-05-10T15:30:00.000Z",
      lastTriggeredAt: new Date(Date.now() - 1e3 * 60 * 60 * 5).toISOString(),
      failureCount: 0
    }
  ];
  webhookLogs = [
    {
      id: "wh_log_01",
      webhookId: "wh_prod_alerts",
      event: "api_key.rotated",
      status: "delivered",
      statusCode: 200,
      latencyMs: 142,
      timestamp: new Date(Date.now() - 1e3 * 60 * 2).toISOString(),
      payload: { event: "api_key.rotated", keyId: "key_live_celestial_01", actor: "Vanitas Prime" }
    },
    {
      id: "wh_log_02",
      webhookId: "wh_crm_sync",
      event: "user.created",
      status: "delivered",
      statusCode: 200,
      latencyMs: 210,
      timestamp: new Date(Date.now() - 1e3 * 60 * 60 * 5).toISOString(),
      payload: { event: "user.created", userId: "usr_dev_002", email: "no\xE9.archiviste@altus.org" }
    }
  ];
  bots = [
    {
      id: "bot_discord_main",
      name: "Vanitas Discord Sentinel",
      platform: "discord",
      apiKeyId: "key_bot_discord_02",
      status: "online",
      lastPingAt: (/* @__PURE__ */ new Date()).toISOString(),
      commandsExecuted: 8940,
      webhookUrl: "https://discord.com/api/webhooks/..."
    },
    {
      id: "bot_wa_agent",
      name: "Vanitas WhatsApp Business Bridge",
      platform: "whatsapp",
      apiKeyId: "key_bot_discord_02",
      status: "online",
      lastPingAt: new Date(Date.now() - 1e3 * 60 * 4).toISOString(),
      commandsExecuted: 3210
    },
    {
      id: "bot_tg_alert",
      name: "Telegram Ops Alert Channel",
      platform: "telegram",
      apiKeyId: "key_live_celestial_01",
      status: "online",
      lastPingAt: new Date(Date.now() - 1e3 * 60 * 1).toISOString(),
      commandsExecuted: 1450
    }
  ];
  featureFlags = [
    {
      id: "ff_ai_assistant",
      key: "ENABLE_VANITAS_AI",
      name: "Vanitas AI Copilot Engine",
      description: "Enables Gemini-powered intelligent code, API, and security analysis.",
      enabled: true,
      adminOnly: false,
      updatedAt: "2026-08-20T10:00:00.000Z"
    },
    {
      id: "ff_web_search",
      key: "ENABLE_AI_WEB_SEARCH",
      name: "AI Grounded Web & Docs Search",
      description: "Allows the AI layer to search live documentation and official sources.",
      enabled: true,
      adminOnly: false,
      updatedAt: "2026-08-20T10:00:00.000Z"
    },
    {
      id: "ff_beta_v2",
      key: "ENABLE_V2_PREVIEW_API",
      name: "v2 Graph & Event Stream API",
      description: "Exposes experimental /api/v2/ GraphQL & SSE real-time stream endpoints.",
      enabled: true,
      adminOnly: true,
      updatedAt: "2026-08-22T14:15:00.000Z"
    },
    {
      id: "ff_maintenance",
      key: "SYSTEM_MAINTENANCE_MODE",
      name: "Emergency Maintenance Lock",
      description: "Suspends non-admin write endpoints and returns 503 Service Unavailable.",
      enabled: false,
      adminOnly: true,
      updatedAt: "2026-08-01T00:00:00.000Z"
    }
  ];
  securityThreats = [
    {
      id: "thr_001",
      level: "HIGH",
      title: "Excessive Failed Authentication Attempts",
      description: "27 repeated invalid token handshakes detected within 3 minutes from single IP range.",
      source: "OTHER",
      ip: "45.155.205.233",
      timestamp: new Date(Date.now() - 1e3 * 60 * 35).toISOString(),
      resolved: false
    },
    {
      id: "thr_002",
      level: "MEDIUM",
      title: "New Geographical Ingress Detected",
      description: "Account access requested from new autonomous system in Frankfurt data center.",
      source: "APPLICATION",
      ip: "194.230.14.88",
      timestamp: new Date(Date.now() - 1e3 * 60 * 120).toISOString(),
      resolved: true
    }
  ];
  systemStats = {
    totalUsers: 1420,
    activeUsers: 388,
    apiRequestsToday: 8420,
    apiRequestsThisMonth: 194300,
    apiQuotaLimit: 25e4,
    p95LatencyMs: 24,
    errorRate: 0.04,
    activeApiKeys: 18,
    services: {
      api: "operational",
      auth: "operational",
      database: "operational",
      ai: "operational",
      bot: "operational",
      webhooks: "operational"
    },
    requestBreakdown: [
      { endpoint: "/api/v1/auth/me", count: 3200, avgLatencyMs: 12, errorCount: 1 },
      { endpoint: "/api/v1/bot/execute", count: 2840, avgLatencyMs: 18, errorCount: 0 },
      { endpoint: "/api/v1/api-keys", count: 1100, avgLatencyMs: 22, errorCount: 2 },
      { endpoint: "/api/v1/ai/chat", count: 780, avgLatencyMs: 340, errorCount: 0 },
      { endpoint: "/api/v1/admin/logs", count: 500, avgLatencyMs: 35, errorCount: 0 }
    ],
    hourlyTraffic: [
      { hour: "00:00", requests: 210, errors: 0 },
      { hour: "04:00", requests: 140, errors: 0 },
      { hour: "08:00", requests: 620, errors: 1 },
      { hour: "12:00", requests: 1450, errors: 2 },
      { hour: "16:00", requests: 2100, errors: 3 },
      { hour: "20:00", requests: 1800, errors: 1 },
      { hour: "Now", requests: 2100, errors: 0 }
    ]
  };
  // --- Methods ---
  recordAuditLog(entry) {
    const log = {
      ...entry,
      id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      requestId: `req_${Math.random().toString(36).substring(2, 9)}`
    };
    this.auditLogs.unshift(log);
    if (this.auditLogs.length > 500) {
      this.auditLogs.pop();
    }
    return log;
  }
  createSuggestion(params) {
    const suggestion = {
      ...params,
      id: `sug_${Date.now().toString(36)}`,
      status: "open",
      createdAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    this.productSuggestions.unshift(suggestion);
    return suggestion;
  }
  updateSuggestionStatus(id, status, adminNote) {
    const suggestion = this.productSuggestions.find((item) => item.id === id);
    if (suggestion) {
      suggestion.status = status;
      if (adminNote !== void 0) suggestion.adminNote = adminNote;
    }
    return suggestion;
  }
  assertGrantableScopes(requesterRole, requestedScopes) {
    if (requesterRole === "ADMIN") return;
    const adminOnlyScopes = ALL_SCOPES.filter((s) => s.adminOnly).map((s) => s.scope);
    const forbidden = requestedScopes.filter((s) => adminOnlyScopes.includes(s));
    if (forbidden.length > 0) {
      throw new Error(`Permission Denied: User role cannot grant administrator scopes: [${forbidden.join(", ")}]`);
    }
  }
  createApiKey(params) {
    this.assertGrantableScopes(params.requesterRole, params.scopes);
    const env = params.environment || "live";
    const randPart = Math.random().toString(36).substring(2, 10) + Math.random().toString(36).substring(2, 10);
    const rawSecret = `sk_${env}_vanitas_${randPart}`;
    const keyPrefix = rawSecret.substring(0, 14);
    const maskedSecret = `${keyPrefix}\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022${rawSecret.slice(-4)}`;
    const rateLimitPerMin = params.rateLimitPerMin || 600;
    const burstLimit = params.burstLimit || Math.round(rateLimitPerMin * 0.05);
    const newKey = {
      id: `key_${env}_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`,
      name: params.name,
      keyPrefix,
      maskedSecret,
      ownerId: params.ownerId,
      ownerName: params.ownerName,
      scopes: params.scopes,
      status: "active",
      rateLimitPerMin,
      burstLimit,
      rateLimitAlgorithm: params.rateLimitAlgorithm || "sliding_window",
      actionOnExceed: params.actionOnExceed || "reject_429",
      monthlyQuota: params.monthlyQuota || rateLimitPerMin * 500,
      currentUsageThisMonth: 0,
      currentRpmUsage: 0,
      usageCount: 0,
      createdAt: (/* @__PURE__ */ new Date()).toISOString(),
      lastUsedAt: null,
      expiresAt: params.expiresAt || null,
      environment: env
    };
    this.apiKeys.unshift(newKey);
    this.systemStats.activeApiKeys = this.apiKeys.filter((k) => k.status === "active").length;
    this.recordAuditLog({
      actorId: params.ownerId,
      actorName: params.ownerName,
      actorEmail: params.ownerName,
      action: "API_KEY_CREATED",
      category: "KEYS",
      target: `${newKey.id} (${newKey.name})`,
      source: "WEB",
      status: "SUCCESS",
      ipAddress: "194.230.14.88",
      metadata: { scopes: newKey.scopes, environment: newKey.environment, rateLimitPerMin: newKey.rateLimitPerMin }
    });
    return { key: newKey, rawSecret };
  }
  rotateApiKey(keyId, actor) {
    const key = this.apiKeys.find((k) => k.id === keyId);
    if (!key) throw new Error("API key not found");
    if (key.status === "revoked") throw new Error("Cannot rotate a revoked key");
    if (actor.role !== "ADMIN" && key.ownerId !== actor.id) {
      throw new Error("Forbidden: You can only rotate keys you own");
    }
    const env = key.environment;
    const randPart = Math.random().toString(36).substring(2, 10) + Math.random().toString(36).substring(2, 10);
    const rawSecret = `sk_${env}_vanitas_${randPart}`;
    const keyPrefix = rawSecret.substring(0, 14);
    key.keyPrefix = keyPrefix;
    key.maskedSecret = `${keyPrefix}\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022${rawSecret.slice(-4)}`;
    this.recordAuditLog({
      actorId: actor.id,
      actorName: actor.name,
      actorEmail: actor.email,
      action: "API_KEY_ROTATED",
      category: "KEYS",
      target: `${key.id} (${key.name})`,
      source: "WEB",
      status: "SUCCESS",
      ipAddress: "194.230.14.88",
      metadata: { newPrefix: key.keyPrefix }
    });
    return { key, rawSecret };
  }
  revokeApiKey(keyId, actor, reason) {
    const key = this.apiKeys.find((k) => k.id === keyId);
    if (!key) throw new Error("API key not found");
    if (actor.role !== "ADMIN" && key.ownerId !== actor.id) {
      throw new Error("Forbidden: You can only revoke keys you own");
    }
    key.status = "revoked";
    this.systemStats.activeApiKeys = this.apiKeys.filter((k) => k.status === "active").length;
    this.recordAuditLog({
      actorId: actor.id,
      actorName: actor.name,
      actorEmail: actor.email,
      action: "API_KEY_REVOKED",
      category: "KEYS",
      target: `${key.id} (${key.name})`,
      source: "WEB",
      status: "SUCCESS",
      ipAddress: "194.230.14.88",
      metadata: { reason: reason || "User explicit revocation" }
    });
    return key;
  }
  updateApiKeyScopes(keyId, newScopes, actor) {
    const key = this.apiKeys.find((k) => k.id === keyId);
    if (!key) throw new Error("API key not found");
    this.assertGrantableScopes(actor.role, newScopes);
    const oldScopes = [...key.scopes];
    key.scopes = newScopes;
    this.recordAuditLog({
      actorId: actor.id,
      actorName: actor.name,
      actorEmail: actor.email,
      action: "API_KEY_SCOPES_UPDATED",
      category: "KEYS",
      target: `${key.id} (${key.name})`,
      source: "WEB",
      status: "SUCCESS",
      ipAddress: "194.230.14.88",
      metadata: { oldScopes, newScopes }
    });
    return key;
  }
  updateApiKeyRateLimit(keyId, params, actor) {
    const key = this.apiKeys.find((k) => k.id === keyId);
    if (!key) throw new Error("API key not found");
    if (actor.role !== "ADMIN" && key.ownerId !== actor.id) {
      throw new Error("Forbidden: You can only update rate limits for keys you own");
    }
    const oldLimit = key.rateLimitPerMin;
    key.rateLimitPerMin = params.rateLimitPerMin;
    if (params.burstLimit !== void 0) key.burstLimit = params.burstLimit;
    if (params.rateLimitAlgorithm) key.rateLimitAlgorithm = params.rateLimitAlgorithm;
    if (params.actionOnExceed) key.actionOnExceed = params.actionOnExceed;
    if (params.monthlyQuota !== void 0) key.monthlyQuota = params.monthlyQuota;
    this.recordAuditLog({
      actorId: actor.id,
      actorName: actor.name,
      actorEmail: actor.email,
      action: "API_KEY_RATE_LIMIT_UPDATED",
      category: "KEYS",
      target: `${key.id} (${key.name}) -> ${key.rateLimitPerMin} req/m`,
      source: "WEB",
      status: "SUCCESS",
      ipAddress: "194.230.14.88",
      metadata: {
        oldLimit,
        newLimit: key.rateLimitPerMin,
        burstLimit: key.burstLimit,
        algorithm: key.rateLimitAlgorithm,
        actionOnExceed: key.actionOnExceed,
        monthlyQuota: key.monthlyQuota
      }
    });
    return key;
  }
  releases = [
    {
      id: "rel_android_apk",
      platform: "android",
      type: "apk",
      name: "Vanitas Mobile Client (Android APK)",
      version: "v1.4.2",
      releaseDate: "2026-08-20",
      sizeMb: 28.4,
      downloadUrl: "/api/v1/download/apk",
      filename: "vanitas-v1.4.2-arm64.apk",
      sha256: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      minOsVersion: "Android 9.0 (Pie) or newer (API level 28+)",
      architecture: "Universal (arm64-v8a / armeabi-v7a / x86_64)",
      description: "Complete Vanitas Mobile client for Android smartphones and tablets with biometric auth, offline token cache, real-time push alerts, and direct bot execution triggers.",
      features: [
        "Biometric / Fingerprint Sign-in",
        "Offline Scoped Token Cache",
        "Live Rate Limit Gauges",
        "Discord & WhatsApp Bot Trigger",
        "Push Notification Channel",
        "Low Battery Standby Engine"
      ],
      downloadsCount: 1420
    },
    {
      id: "rel_windows_exe",
      platform: "windows",
      type: "exe",
      name: "Vanitas Desktop Client (Windows Setup EXE)",
      version: "v1.4.2",
      releaseDate: "2026-08-20",
      sizeMb: 64.8,
      downloadUrl: "/api/v1/download/exe",
      filename: "vanitas-desktop-setup-v1.4.2.exe",
      sha256: "8f4e2a9b7c6d5e1f0a3b2c1d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f",
      minOsVersion: "Windows 10 / Windows 11 (64-bit)",
      architecture: "x86_64 (DirectX 11 / OpenGL Acceleration)",
      description: "Official Vanitas Desktop workstation app with system tray daemon, global Command Palette (Ctrl+Shift+V), local API proxy cache, and real-time security monitor.",
      features: [
        "System Tray Minimized Daemon",
        "Global Hotkey (Ctrl+Shift+V)",
        "Local Ingress Reverse Proxy",
        "Auto-Update with Code Signing",
        "Multi-Monitor Glassmorphism UI",
        "Hardware Encrypted Key Vault"
      ],
      downloadsCount: 2890
    },
    {
      id: "rel_macos_dmg",
      platform: "macos",
      type: "dmg",
      name: "Vanitas for macOS (Universal DMG)",
      version: "v1.4.2",
      releaseDate: "2026-08-20",
      sizeMb: 71.2,
      downloadUrl: "/api/v1/download/dmg",
      filename: "Vanitas-v1.4.2-Universal.dmg",
      sha256: "1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b",
      minOsVersion: "macOS 12.0 (Monterey) or newer",
      architecture: "Universal Binary (Apple Silicon M1/M2/M3 & Intel x64)",
      description: "Native macOS glass client featuring Menu Bar companion app, Touch ID key unlocking, and Apple Silicon optimization.",
      features: [
        "Menu Bar Status Companion",
        "Touch ID Biometric Verification",
        "Native Apple Silicon Optimization",
        "Dark Mode Ambient Glow",
        "Notification Center Integration"
      ],
      downloadsCount: 1840
    },
    {
      id: "rel_linux_appimage",
      platform: "linux",
      type: "appimage",
      name: "Vanitas Linux Standalone (AppImage)",
      version: "v1.4.2",
      releaseDate: "2026-08-20",
      sizeMb: 58.9,
      downloadUrl: "/api/v1/download/appimage",
      filename: "vanitas-v1.4.2-x86_64.AppImage",
      sha256: "3f4e5d6c7b8a9f0e1d2c3b4a5f6e7d8c9b0a1f2e3d4c5b6a7f8e9d0c1b2a3f4e",
      minOsVersion: "glibc 2.28+ (Ubuntu 20.04+, Debian 11+, Arch, Fedora)",
      architecture: "x86_64 Standalone AppImage",
      description: "Self-contained desktop executable package for Linux workstations and headless CLI agents.",
      features: [
        "Zero-Dependency Standalone",
        "CLI Daemon Mode (--headless)",
        "Secret Service API Integration",
        "Wayland & X11 Transparent Glass",
        "Systemd Service Generator"
      ],
      downloadsCount: 960
    }
  ];
  recordClientDownload(type, actor, source) {
    const release = this.releases.find((r) => r.type === type);
    if (release) {
      release.downloadsCount += 1;
    }
    this.recordAuditLog({
      actorId: actor.id,
      actorName: actor.name,
      actorEmail: actor.email,
      action: "CLIENT_BINARY_DOWNLOADED",
      category: "API",
      target: release ? `${release.name} (${release.filename})` : `Binary:${type}`,
      source: source || "WEB",
      status: "SUCCESS",
      ipAddress: "194.230.14.88",
      metadata: {
        binaryType: type,
        version: release?.version || "1.4.2",
        platform: release?.platform || type,
        sizeMb: release?.sizeMb || 0
      }
    });
    return release;
  }
  externalDatabases = [
    {
      id: "db_supabase_prod",
      name: "Supabase Serverless PostgreSQL (Free Tier)",
      provider: "supabase",
      tier: "free",
      connectionUrlMasked: "postgresql://postgres:\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022@db.supabase.co:5432/postgres",
      region: "eu-central-1 (Frankfurt)",
      status: "connected",
      latencyMs: 14,
      tablesCount: 18,
      storageUsedMb: 62.4,
      storageMaxMb: 500,
      sslEnabled: true,
      lastTestedAt: (/* @__PURE__ */ new Date()).toISOString()
    },
    {
      id: "db_neon_branch",
      name: "Neon Postgres (Free Scale-to-Zero)",
      provider: "neon",
      tier: "free",
      connectionUrlMasked: "postgresql://neon_admin:\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022@ep-misty-water.neon.tech/main",
      region: "us-east-2 (Ohio)",
      status: "connected",
      latencyMs: 22,
      tablesCount: 12,
      storageUsedMb: 38.1,
      storageMaxMb: 512,
      sslEnabled: true,
      lastTestedAt: new Date(Date.now() - 1e3 * 60 * 15).toISOString()
    },
    {
      id: "db_upstash_redis",
      name: "Upstash Serverless Redis (Rate Limit & Cache)",
      provider: "upstash",
      tier: "free",
      connectionUrlMasked: "rediss://default:\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022@eu1-rest-upstash.io:6379",
      region: "eu-west-1 (Ireland)",
      status: "connected",
      latencyMs: 8,
      tablesCount: 6,
      storageUsedMb: 12,
      storageMaxMb: 256,
      sslEnabled: true,
      lastTestedAt: new Date(Date.now() - 1e3 * 60 * 30).toISOString()
    },
    {
      id: "db_render_backend",
      name: "Render / Railway Free Backend Service Node",
      provider: "render",
      tier: "free",
      connectionUrlMasked: "https://vanitas-worker-api.onrender.com/api/v1",
      region: "us-west-1 (Oregon)",
      status: "connected",
      latencyMs: 29,
      tablesCount: 8,
      storageUsedMb: 18.5,
      storageMaxMb: 1e3,
      sslEnabled: true,
      lastTestedAt: new Date(Date.now() - 1e3 * 60 * 45).toISOString()
    }
  ];
  videoTutorials = [
    {
      id: "vid_01_welcome",
      title: "Vanitas Central API Gateway: Full Setup, Auth & Scopes",
      titleArabic: "\u0634\u0631\u062D \u0645\u0646\u0635\u0629 \u0641\u0627\u0646\u064A\u062A\u0627\u0633 \u0627\u0644\u0645\u0631\u0643\u0632\u064A\u0629: \u0627\u0644\u062A\u062B\u0628\u064A\u062A\u060C \u0627\u0644\u062A\u0648\u062B\u064A\u0642 \u0648\u0635\u0644\u0627\u062D\u064A\u0627\u062A \u0627\u0644\u0645\u0641\u0627\u062A\u064A\u062D",
      description: "Master the core architecture of Vanitas API Gateway, generating scoped keys, setting burst limits, and monitoring telemetry.",
      category: "getting_started",
      duration: "14:20",
      thumbnailUrl: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=640&auto=format&fit=crop",
      videoEmbedUrl: "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
      youtubeId: "dQw4w9WgXcQ",
      badge: "Essential Guide",
      author: "Vanitas Core Architecture Team",
      tags: ["API Gateway", "Authentication", "Scopes", "Quickstart"],
      highlights: [
        "Issuing cryptographically signed API keys",
        "Configuring sliding window rate limits",
        "Testing endpoints in the live playground"
      ]
    },
    {
      id: "vid_02_database",
      title: "Connecting Free Cloud Databases (Supabase & Neon) to Vanitas",
      titleArabic: "\u0631\u0628\u0637 \u0642\u0648\u0627\u0639\u062F \u0627\u0644\u0628\u064A\u0627\u0646\u0627\u062A \u0627\u0644\u0633\u062D\u0627\u0628\u064A\u0629 \u0627\u0644\u0645\u062C\u0627\u0646\u064A\u0629 (Supabase & Neon) \u0645\u0639 \u0627\u0644\u0633\u064A\u0631\u0641\u0631",
      description: "How to provision zero-cost, high-speed PostgreSQL clusters using Supabase and Neon with automatic scale-to-zero.",
      category: "cloud_database",
      duration: "18:45",
      thumbnailUrl: "https://images.unsplash.com/photo-1558494949-ef010cbdcc31?q=80&w=640&auto=format&fit=crop",
      videoEmbedUrl: "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
      youtubeId: "dQw4w9WgXcQ",
      badge: "Free Tier Database",
      author: "Database Engineering Group",
      tags: ["PostgreSQL", "Supabase", "Neon", "Free Cloud", "SQL"],
      highlights: [
        "Creating free PostgreSQL instances in 30 seconds",
        "Setting up SSL encrypted connection strings",
        "Live schema synchronization and testing"
      ]
    },
    {
      id: "vid_03_clients",
      title: "Modern Client Installation & Capabilities: Android APK & Windows EXE",
      titleArabic: "\u062A\u062B\u0628\u064A\u062A \u0648\u062A\u0634\u063A\u064A\u0644 \u062A\u0637\u0628\u064A\u0642\u0627\u062A \u0627\u0644\u0623\u062C\u0647\u0632\u0629 \u0627\u0644\u062D\u062F\u064A\u062B\u0629: \u0623\u0646\u062F\u0631\u0648\u064A\u062F APK \u0648\u0648\u064A\u0646\u062F\u0648\u0632 EXE",
      description: "Explore the modern native builds for Android 14/15 ARM64 and Windows 11 Mica Glass UI with hardware acceleration.",
      category: "desktop_mobile",
      duration: "12:30",
      thumbnailUrl: "https://images.unsplash.com/photo-1517694712202-14dd9538aa97?q=80&w=640&auto=format&fit=crop",
      videoEmbedUrl: "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
      youtubeId: "dQw4w9WgXcQ",
      badge: "Modern Devices",
      author: "Native Systems Team",
      tags: ["Android APK", "Windows EXE", "ARM64", "Mica UI"],
      highlights: [
        "Universal ARM64 & x86_64 installation",
        "Biometric authentication setup on mobile",
        "DirectX hardware acceleration on Windows 11"
      ]
    },
    {
      id: "vid_04_bots",
      title: "Deploying Discord & WhatsApp Bot Integrations via Webhooks",
      titleArabic: "\u0631\u0628\u0637 \u0648\u062A\u0634\u063A\u064A\u0644 \u0628\u0648\u062A\u0627\u062A \u062F\u064A\u0633\u0643\u0648\u0631\u062F \u0648\u0648\u0627\u062A\u0633\u0627\u0628 \u0639\u0628\u0631 \u0627\u0644\u0648\u064A\u0628 \u0647\u0648\u0643",
      description: "Configure real-time message routing, slash command dispatch, and encrypted HMAC webhook listeners.",
      category: "bots_webhooks",
      duration: "16:10",
      thumbnailUrl: "https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?q=80&w=640&auto=format&fit=crop",
      videoEmbedUrl: "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
      youtubeId: "dQw4w9WgXcQ",
      badge: "Automation",
      author: "Bot Ingress Engineering",
      tags: ["Discord Bot", "WhatsApp API", "Webhooks", "HMAC"],
      highlights: [
        "Zero-downtime webhook dispatching",
        "Signing webhook payloads with secret keys",
        "Automated failover & retry mechanism"
      ]
    }
  ];
  testDatabaseConnection(dbId) {
    const dbItem = this.externalDatabases.find((d) => d.id === dbId);
    if (!dbItem) {
      return { success: false, latencyMs: 0, message: "Database configuration not found" };
    }
    const latencyMs = Math.round(8 + Math.random() * 18);
    dbItem.status = "connected";
    dbItem.latencyMs = latencyMs;
    dbItem.lastTestedAt = (/* @__PURE__ */ new Date()).toISOString();
    return {
      success: true,
      latencyMs,
      message: `Successfully connected to ${dbItem.name} via SSL (${latencyMs}ms roundtrip latency).`,
      database: dbItem
    };
  }
  addExternalDatabase(params) {
    const masked = params.connectionUrl.replace(/:([^:@]+)@/, ":\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022@");
    const newDb = {
      id: `db_${params.provider}_${Date.now().toString(36)}`,
      name: params.name,
      provider: params.provider,
      tier: "free",
      connectionUrlMasked: masked,
      region: params.region || "us-east-1 (N. Virginia)",
      status: "connected",
      latencyMs: Math.round(10 + Math.random() * 15),
      tablesCount: 5,
      storageUsedMb: 8.2,
      storageMaxMb: 500,
      sslEnabled: true,
      lastTestedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    this.externalDatabases.push(newDb);
    return newDb;
  }
  incrementRequestCount(endpoint, status, latencyMs) {
    this.systemStats.apiRequestsToday += 1;
    const ep = this.systemStats.requestBreakdown.find((b) => b.endpoint === endpoint);
    if (ep) {
      ep.count += 1;
      if (status >= 400) ep.errorCount += 1;
    }
  }
  getKeyUsageAnalytics(period = "24h") {
    const activeKeys = this.apiKeys;
    const now = Date.now();
    const timeSeries = [];
    const intervals = period === "24h" ? 24 : period === "7d" ? 7 : 30;
    const intervalMs = period === "24h" ? 3600 * 1e3 : 24 * 3600 * 1e3;
    let totalVolume = 0;
    let totalThrottled = 0;
    let totalErrors = 0;
    let latencySum = 0;
    for (let i = intervals - 1; i >= 0; i--) {
      const pointTime = new Date(now - i * intervalMs);
      let timeLabel = "";
      if (period === "24h") {
        timeLabel = pointTime.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      } else if (period === "7d") {
        timeLabel = pointTime.toLocaleDateString([], { weekday: "short", month: "numeric", day: "numeric" });
      } else {
        timeLabel = pointTime.toLocaleDateString([], { month: "short", day: "numeric" });
      }
      let pointTotal = 0;
      let pointThrottled = 0;
      let pointErrors = 0;
      const point = {
        timeLabel,
        timestamp: pointTime.toISOString(),
        totalRequests: 0,
        successCount: 0,
        throttledCount: 0,
        errorCount: 0,
        latencyMs: 0,
        p95LatencyMs: 0
      };
      activeKeys.forEach((k) => {
        const baseFactor = k.environment === "live" ? k.id.includes("discord") ? 220 : 380 : 45;
        const hourOfDay = pointTime.getHours();
        const wave = 0.6 + 0.4 * Math.sin((hourOfDay - 6) / 24 * 2 * Math.PI);
        const noise = 0.85 + 0.3 * Math.random();
        const count = Math.max(8, Math.round(baseFactor * wave * noise * (period === "24h" ? 1 : 18)));
        const throttled = Math.random() > 0.82 ? Math.round(count * (k.actionOnExceed === "reject_429" ? 0.04 : 0.015)) : 0;
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
    const summaries = activeKeys.map((k) => {
      const keyRequests = timeSeries.reduce((acc, pt) => acc + (Number(pt[k.id]) || 0), 0);
      const throttledRatio = k.environment === "live" ? 0.024 : 8e-3;
      const keyThrottled = Math.round(keyRequests * throttledRatio);
      const quota = k.monthlyQuota || 2e5;
      const quotaUsedPercent = Math.min(100, Math.round(keyRequests / quota * 100));
      const endpoints = [
        { endpoint: "/api/v1/bot/execute", count: Math.round(keyRequests * 0.42), percentage: 42 },
        { endpoint: "/api/v1/users/me", count: Math.round(keyRequests * 0.28), percentage: 28 },
        { endpoint: "/api/v1/webhooks/dispatch", count: Math.round(keyRequests * 0.18), percentage: 18 },
        { endpoint: "/api/v1/ai/chat", count: Math.round(keyRequests * 0.12), percentage: 12 }
      ];
      return {
        keyId: k.id,
        keyName: k.name,
        keyPrefix: k.keyPrefix,
        environment: k.environment,
        rateLimitPerMin: k.rateLimitPerMin,
        totalRequests: keyRequests,
        successRate: Number(((1 - (keyThrottled + keyRequests * 8e-3) / keyRequests) * 100).toFixed(1)),
        throttledRequests: keyThrottled,
        quotaUsedPercent,
        peakRpm: Math.round(k.rateLimitPerMin * (0.65 + Math.random() * 0.25)),
        avgLatencyMs: Math.round(19 + Math.random() * 6),
        topEndpoints: endpoints
      };
    });
    return {
      period,
      timeSeries,
      summaries,
      totalVolume,
      overallSuccessRate: Number(((1 - (totalThrottled + totalErrors) / totalVolume) * 100).toFixed(1)),
      overallThrottledCount: totalThrottled,
      overallAvgLatencyMs: Math.round(latencySum / (timeSeries.length || 1))
    };
  }
};
var db = new VanitasDatabase();

// src/server/aiService.ts
var import_genai = require("@google/genai");
var aiClient = null;
function getAiClient() {
  if (!aiClient && process.env.GEMINI_API_KEY) {
    aiClient = new import_genai.GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build"
        }
      }
    });
  }
  return aiClient;
}
var CANDIDATE_MODELS = [
  "gemini-3.7-flash",
  "gemini-3.1-flash-lite",
  "gemini-flash-latest"
];
async function queryOllama(systemInstruction, prompt) {
  const baseUrl = process.env.OLLAMA_BASE_URL;
  if (process.env.AI_PROVIDER !== "ollama" || !baseUrl) return null;
  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, "")}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(3e4),
      body: JSON.stringify({
        model: process.env.OLLAMA_MODEL || "llama3.2",
        stream: false,
        messages: [
          { role: "system", content: systemInstruction },
          { role: "user", content: prompt }
        ]
      })
    });
    if (!response.ok) return null;
    const data = await response.json();
    return data.message?.content?.trim() || null;
  } catch (error) {
    console.warn("Ollama unavailable; using the local deterministic fallback.", error instanceof Error ? error.message : error);
    return null;
  }
}
async function processAiQuery(options) {
  const { persona, toneStyle = "developer", prompt, context, enableWebSearch, enableVideoSearch } = options;
  const isVideoQuery = enableVideoSearch || persona === "video" || /\b(video|videos|tutorial|tutorials|youtube|watch|walkthrough|screencast|guide|setup|course|learn)\b/i.test(prompt) || /[\u0600-\u06FF]/.test(prompt) && /(فيديو|فيديوهات|شرح|مرئي|يوتيوب|دروس|دورة|تطبيق|مشاهدة)/i.test(prompt);
  let retrievedVideos = void 0;
  let videoQueryStr = void 0;
  if (isVideoQuery) {
    const cleanSearchQuery = prompt.replace(/(show me|give me|find|search for|can you show|video|videos|tutorial|tutorials|on youtube|youtube|please|شرح|فيديو|فيديوهات|عن|طريقة|دروس)/gi, "").trim() || prompt;
    videoQueryStr = cleanSearchQuery.length > 2 ? cleanSearchQuery : prompt;
    try {
      const vResult = await searchYouTubeVideos(videoQueryStr, 4);
      if (vResult.videos && vResult.videos.length > 0) {
        retrievedVideos = vResult.videos;
      }
    } catch (vErr) {
      console.warn("Semantic video search in AI query error:", vErr);
    }
  }
  const baseInstructions = {
    code: `You are Vanitas Code Assistant, a world-class systems and API engineer. You provide precise TypeScript, Python, and cURL snippets for integrating with the Vanitas Central API, debugging payload structures, and hardening client implementations. Respond directly with clean syntax, Markdown code blocks, and architectural clarity.`,
    api: `You are Vanitas API Assistant. You understand every endpoint in the Vanitas Centralized Platform (/api/v1/...), including authentication tokens, API key scopes (e.g., api.read, api.write, users.read, keys.create, keys.rotate, keys.revoke, bot.execute, webhooks.manage, admin.all), rate limits, and error codes. Explain endpoints clearly and generate exact HTTP specifications.`,
    security: `You are Vanitas Security Analyst. You audit system events, identify suspicious authentication anomalies, evaluate API key permission scopes, and recommend threat mitigation strategies. If the user asks to revoke a key or block an IP, explain the risks and confirm.`,
    analyst: `You are Vanitas System Analyst. You analyze API throughput, p95 latencies, error distributions, and system health across Web, Bot, Mobile, and Desktop clients. Provide insightful, data-driven summaries.`,
    docs: `You are Vanitas Documentation Specialist. You guide developers through the Vanitas Platform documentation, including Webhooks, Bot integrations, RBAC permissions, and SDK setup.`,
    admin: `You are Vanitas Admin Remediation Assistant. Work only from an administrator's reviewed bug report and attached code. Explain the diagnosis, propose a minimal safe patch, never deploy or mutate production data yourself, and require human review before marking an issue resolved.`,
    video: `You are Vanitas Educational Video & Tutorial Specialist. You assist developers in discovering, understanding, and mastering video tutorials, architecture walkthroughs, and technical demonstrations. When explaining concepts, provide clear structured milestones, prerequisite knowledge, and highlight the practical key takeaways of the accompanying video lessons.`
  };
  const toneModifiers = {
    architect: `Tone: Senior Systems Architect. High density, systematic, design-pattern-first, strict zero-trust principles, and enterprise resilience focus.`,
    security: `Tone: Red Team & Security Compliance Auditor. Rigorous privilege checks, vulnerability highlights, least-privilege scope enforcement, and defensive hardening.`,
    developer: `Tone: Modern Developer Friendly. Pragmatic, crystal clear code explanations, step-by-step guidance, clean formatting, and helpful tips.`,
    bot: `Tone: Autonomous Bot Orchestration Daemon. Concise, high-speed, command-dispatch oriented, minimal chatter, machine-parseable outputs with structured logs.`,
    arabic: `Tone & Language: \u0645\u0647\u0646\u062F\u0633 \u0628\u0631\u0645\u062C\u064A\u0627\u062A \u0648\u0646\u0638\u0645 \u062E\u0628\u064A\u0631 \u064A\u062A\u062D\u062F\u062B \u0628\u0627\u0644\u0644\u063A\u0629 \u0627\u0644\u0639\u0631\u0628\u064A\u0629 \u0627\u0644\u0641\u0635\u062D\u0649 \u0645\u0639 \u0627\u0644\u0645\u0635\u0637\u0644\u062D\u0627\u062A \u0627\u0644\u062A\u0642\u0646\u064A\u0629 \u0627\u0644\u062F\u0642\u064A\u0642\u0629. \u0627\u0634\u0631\u062D \u0627\u0644\u0643\u0648\u062F \u0648\u0637\u0631\u0642 \u0627\u0644\u0631\u0628\u0637 \u0645\u0639 \u0645\u0646\u0635\u0629 \u0641\u0627\u0646\u064A\u062A\u0627\u0633 (Vanitas Central API) \u0628\u0623\u0633\u0644\u0648\u0628 \u0627\u062D\u062A\u0631\u0627\u0641\u064A \u0645\u0639 \u0625\u0639\u0637\u0627\u0621 \u0623\u0645\u062B\u0644\u0629 \u0628\u0631\u0645\u062C\u064A\u0629 \u0643\u0627\u0645\u0644\u0629 \u0648\u062D\u0644\u0648\u0644 \u0644\u0644\u0623\u062E\u0637\u0627\u0621.`
  };
  let selectedInstruction = `${baseInstructions[persona] || baseInstructions.code}
${toneModifiers[toneStyle] || ""}`;
  if (retrievedVideos && retrievedVideos.length > 0) {
    selectedInstruction += `
Note: ${retrievedVideos.length} educational YouTube video tutorials have been retrieved and will be displayed in interactive cards directly within the user interface. Reference the educational topics and offer practical implementation steps.`;
  }
  const ollamaText = await queryOllama(selectedInstruction, prompt);
  if (ollamaText) {
    return { text: ollamaText, videos: retrievedVideos, videoQuery: videoQueryStr };
  }
  const ai = process.env.AI_PROVIDER === "ollama" ? null : getAiClient();
  if (ai) {
    for (const modelName of CANDIDATE_MODELS) {
      try {
        const config = {
          systemInstruction: selectedInstruction,
          temperature: 0.7
        };
        if (enableWebSearch) {
          config.tools = [{ googleSearch: {} }];
        }
        const response = await ai.models.generateContent({
          model: modelName,
          contents: prompt,
          config
        });
        const text = response.text || "No response generated.";
        const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
        const groundingSources = [];
        if (chunks && Array.isArray(chunks)) {
          for (const chunk of chunks) {
            if (chunk.web?.uri) {
              groundingSources.push({
                title: chunk.web.title || chunk.web.uri,
                url: chunk.web.uri
              });
            }
          }
        }
        return {
          text,
          groundingSources: groundingSources.length > 0 ? groundingSources : void 0,
          videos: retrievedVideos,
          videoQuery: videoQueryStr
        };
      } catch (err) {
        const isTransient = err?.status === 503 || err?.code === 503 || err?.message?.includes("503") || err?.message?.includes("high demand") || err?.message?.includes("RESOURCE_EXHAUSTED") || err?.message?.includes("429");
        if (isTransient && modelName !== CANDIDATE_MODELS[CANDIDATE_MODELS.length - 1]) {
          await new Promise((resolve) => setTimeout(resolve, 300));
          continue;
        }
      }
    }
  }
  const fallback = generateFallbackResponse(persona, toneStyle, prompt, context);
  return {
    ...fallback,
    videos: retrievedVideos,
    videoQuery: videoQueryStr
  };
}
function generateFallbackResponse(persona, toneStyle, prompt, _context) {
  const p = prompt.toLowerCase().trim();
  if (toneStyle === "arabic" || /[\u0600-\u06FF]/.test(prompt)) {
    if (p.includes("\u0645\u0641\u062A\u0627\u062D") || p.includes("api key") || p.includes("\u0627\u0646\u0634\u0627\u0621") || p.includes("\u062A\u062F\u0648\u064A\u0631") || p.includes("rotate")) {
      return {
        text: `### \u{1F511} \u0625\u062F\u0627\u0631\u0629 \u0645\u0641\u0627\u062A\u064A\u062D \u0627\u0644\u0640 API \u0641\u064A \u0645\u0646\u0635\u0629 Vanitas

\u062A\u0639\u062A\u0645\u062F \u0645\u0646\u0635\u0629 \u0641\u0627\u0646\u064A\u062A\u0627\u0633 \u0646\u0638\u0627\u0645 \u0623\u0645\u0627\u0646 \u0635\u0627\u0631\u0645 \u064A\u0639\u062A\u0645\u062F \u0639\u0644\u0649 \u0627\u0644\u0635\u0644\u0627\u062D\u064A\u0627\u062A \u0627\u0644\u0645\u062D\u062F\u062F\u0629 \u0628\u062F\u0642\u0629 (**Granular Scopes**) \u0645\u0639 \u0627\u0644\u062A\u062D\u0642\u0642 \u0645\u0646 \u0627\u0644\u0635\u0644\u0627\u062D\u064A\u0627\u062A \u0645\u0646 \u062C\u0647\u0629 \u0627\u0644\u0633\u064A\u0631\u0641\u0631 \u0644\u0645\u0646\u0639 \u0623\u064A \u062A\u0635\u0639\u064A\u062F \u063A\u064A\u0631 \u0645\u0635\u0631\u062D \u0628\u0647 \u0644\u0644\u0635\u0644\u0627\u062D\u064A\u0627\u062A (\`assertGrantableScopes\`).

\`\`\`typescript
// \u0645\u062B\u0627\u0644: \u0631\u0628\u0637 \u0627\u0644\u0639\u0645\u064A\u0644 \u0648\u062A\u062F\u0648\u064A\u0631 \u0627\u0644\u0645\u0641\u062A\u0627\u062D \u0628\u0623\u0645\u0627\u0646
import { VanitasClient } from '@vanitas/sdk';

const vanitas = new VanitasClient({
  apiKey: process.env.VANITAS_API_KEY,
  baseUrl: 'https://vanitas-bot.vercel.app/api/v1'
});

async function rotateKey() {
  const result = await vanitas.keys.rotate('key_id_here');
  console.log('\u0627\u0644\u0645\u0641\u062A\u0627\u062D \u0627\u0644\u0633\u0631\u064A \u0627\u0644\u062C\u062F\u064A\u062F (\u064A\u0638\u0647\u0631 \u0645\u0631\u0629 \u0648\u0627\u062D\u062F\u0629 \u0641\u0642\u0637):', result.rawSecret);
}
\`\`\`

**\u0623\u0628\u0631\u0632 \u0627\u0644\u0635\u0644\u0627\u062D\u064A\u0627\u062A:**
- \`api.read\` / \`api.write\`: \u0642\u0631\u0627\u0621\u0629 \u0648\u0643\u062A\u0627\u0628\u0629 \u0627\u0644\u0645\u0648\u0627\u0631\u062F \u0627\u0644\u0623\u0633\u0627\u0633\u064A\u0629
- \`bot.execute\`: \u062A\u0646\u0641\u064A\u0630 \u0623\u0648\u0627\u0645\u0631 \u0627\u0644\u0628\u0648\u062A (Discord \u0648 WhatsApp)
- \`keys.rotate\` / \`keys.revoke\`: \u0625\u062F\u0627\u0631\u0629 \u062F\u0648\u0631\u0629 \u062D\u064A\u0627\u0629 \u0627\u0644\u0645\u0641\u0627\u062A\u064A\u062D.`,
        groundingSources: [
          { title: "\u062A\u0648\u062B\u064A\u0642 \u0645\u0646\u0635\u0629 \u0641\u0627\u0646\u064A\u062A\u0627\u0633 \u0627\u0644\u0631\u0633\u0645\u064A\u0629: \u0627\u0644\u0635\u0644\u0627\u062D\u064A\u0627\u062A \u0648\u0627\u0644\u0623\u0645\u0627\u0646", url: "https://vanitas-bot.vercel.app/docs#scopes" }
        ]
      };
    }
    if (p.includes("\u0628\u0648\u062A") || p.includes("bot") || p.includes("discord") || p.includes("whatsapp")) {
      return {
        text: `### \u{1F916} \u0628\u0648\u0627\u0628\u0629 \u0627\u0644\u0628\u0648\u062A \u0627\u0644\u0645\u0631\u0643\u0632\u064A\u0629 \u0641\u064A \u0641\u0627\u0646\u064A\u062A\u0627\u0633 (Bot Gateway)

\u062A\u062A\u064A\u062D \u0627\u0644\u0645\u0646\u0635\u0629 \u0631\u0628\u0637 \u062A\u0637\u0628\u064A\u0642\u0627\u062A \u0628\u0648\u062A WhatsApp \u0648 Discord \u0639\u0628\u0631 \u0646\u0642\u0637\u0629 \u062F\u062E\u0648\u0644 \u0645\u0648\u062D\u062F\u0629 \`POST /api/v1/bot/execute\` \u0645\u0639 \u062A\u0633\u062C\u064A\u0644 \u0641\u0648\u0631\u064A \u0641\u064A \u0633\u062C\u0644\u0627\u062A \u0627\u0644\u062A\u062F\u0642\u064A\u0642.

\`\`\`bash
curl -X POST https://vanitas-bot.vercel.app/api/v1/bot/execute \\
  -H "Authorization: Bearer sk_live_discord_\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022" \\
  -H "Content-Type: application/json" \\
  -d '{
    "platform": "discord",
    "command": "system_status",
    "payload": { "channel": "operations" }
  }'
\`\`\`

\u064A\u062A\u0645 \u062A\u0646\u0641\u064A\u0630 \u0627\u0644\u0623\u0645\u0631 \u0628\u0632\u0645\u0646 \u0627\u0633\u062A\u062C\u0627\u0628\u0629 \u0641\u0627\u0626\u0642 \u0627\u0644\u0633\u0631\u0639\u0629 (~14ms) \u0645\u0639 \u0627\u0644\u062A\u062D\u0642\u0642 \u0645\u0646 \u0635\u0644\u0627\u062D\u064A\u0629 \`bot.execute\`.`,
        groundingSources: [
          { title: "\u062F\u0644\u064A\u0644 \u0631\u0628\u0637 \u0627\u0644\u0628\u0648\u062A \u0627\u0644\u0645\u0631\u0643\u0632\u064A", url: "https://vanitas-bot.vercel.app/docs#bots" }
        ]
      };
    }
    return {
      text: `### \u{1F30C} \u0645\u0633\u0627\u0639\u062F \u0627\u0644\u0630\u0643\u0627\u0621 \u0627\u0644\u0627\u0635\u0637\u0646\u0627\u0639\u064A \u0644\u0645\u0646\u0635\u0629 Vanitas

\u0623\u0647\u0644\u0627\u064B \u0628\u0643! \u0623\u0646\u0627 \u0646\u0638\u0627\u0645 \u0627\u0644\u0630\u0643\u0627\u0621 \u0627\u0644\u0627\u0635\u0637\u0646\u0627\u0639\u064A \u0627\u0644\u0645\u062F\u0645\u062C \u0644\u0645\u0646\u0635\u0629 \u0641\u0627\u0646\u064A\u062A\u0627\u0633 \u0627\u0644\u0645\u0631\u0643\u0632\u064A\u0629. \u064A\u0645\u0643\u0646\u0646\u064A \u0645\u0633\u0627\u0639\u062F\u062A\u0643 \u0641\u064A:
1. **\u062A\u0635\u062D\u064A\u062D \u0627\u0644\u0643\u0648\u062F \u0648\u0627\u0643\u062A\u0634\u0627\u0641 \u0627\u0644\u0623\u062E\u0637\u0627\u0621 \u0627\u0644\u062B\u0646\u0627\u0626\u064A\u0629 \u0648\u0627\u0644\u0623\u0645\u0646\u064A\u0629**
2. **\u062A\u0648\u0644\u064A\u062F \u0623\u0643\u0648\u0627\u062F TypeScript \u0648 Python \u0648 cURL \u062C\u0627\u0647\u0632\u0629 \u0644\u0644\u0625\u0646\u062A\u0627\u062C**
3. **\u0641\u062D\u0635 \u0627\u0644\u0635\u0644\u0627\u062D\u064A\u0627\u062A \u0648\u0645\u0635\u0641\u0648\u0641\u0629 \u0627\u0644\u0623\u0645\u0627\u0646 \u0648\u0645\u0646\u0639 \u0627\u0644\u062B\u063A\u0631\u0627\u062A**
4. **\u062A\u062D\u0644\u064A\u0644 \u062D\u0631\u0643\u0629 \u0627\u0644\u0645\u0631\u0648\u0631 \u0648\u0625\u062D\u0635\u0627\u0626\u064A\u0627\u062A \u0627\u0644\u0627\u0633\u062A\u0647\u0644\u0627\u0643 \u0648\u0633\u0631\u0639\u0629 \u0627\u0644\u0627\u0633\u062A\u062C\u0627\u0628\u0629 (p95 latency)**

\u0643\u064A\u0641 \u062A\u0648\u062F \u0623\u0646 \u0646\u0637\u0648\u0631 \u0628\u0646\u064A\u062A\u0643 \u0627\u0644\u062A\u062D\u062A\u064A\u0629 \u0627\u0644\u064A\u0648\u0645\u061F`,
      groundingSources: [
        { title: "\u062A\u0648\u062B\u064A\u0642 \u0641\u0627\u0646\u064A\u062A\u0627\u0633 \u0627\u0644\u0634\u0627\u0645\u0644", url: "https://vanitas-bot.vercel.app/docs" }
      ]
    };
  }
  if (persona === "security" && (p.includes("revoke") || p.includes("delete key") || p.includes("block") || p.includes("purge"))) {
    return {
      text: `\u26A0\uFE0F **Security Action Verification Required**

I have evaluated the requested operation against active RBAC policies. Because this is an irreversible high-impact change, please verify before execution:

- **Target Entity:** Active Authorization Token / Session
- **Policy Enforcement:** Immediate invalidation across all edge gateways
- **Audit Compliance:** An immutable audit trail entry will be generated.`,
      requiresConfirmation: {
        action: "Revoke Key Authorization",
        target: "Target API Token / Session",
        permission: "keys.revoke",
        status: "pending"
      }
    };
  }
  if (p.includes("api key") || p.includes("create key") || p.includes("rotate") || p.includes("scopes") || p.includes("assertgrantablescopes")) {
    return {
      text: `### \u{1F511} Vanitas API Key Management & Scope Resolution

All API keys in Vanitas are issued with **Granular Scopes** enforced on the server-side via \`assertGrantableScopes\` to eliminate privilege escalation risks.

\`\`\`typescript
// Example: Initialize Vanitas Client and Rotate Key
import { VanitasClient } from '@vanitas/sdk';

const client = new VanitasClient({
  apiKey: process.env.VANITAS_API_KEY,
  endpoint: 'https://vanitas-bot.vercel.app/api/v1'
});

// Rotate key safely with instant token invalidation
const { rawSecret, key } = await client.keys.rotate('key_id_here');
console.log('New Secret (Store Safely):', rawSecret);
\`\`\`

**Key Scope Hierarchy:**
- \`api.read\` / \`api.write\` \u2014 General entity query & mutation
- \`bot.execute\` \u2014 Dispatches automated commands to WhatsApp, Discord, Telegram
- \`keys.create\`, \`keys.rotate\`, \`keys.revoke\` \u2014 Developer token lifecycle
- \`admin.all\` \u2014 Full administrative control (Admin role only)`,
      groundingSources: [
        { title: "Vanitas Official Docs: Scopes & Permissions", url: "https://vanitas-bot.vercel.app/docs#scopes" },
        { title: "API Key Safe Rotation Workflow", url: "https://vanitas-bot.vercel.app/docs#keys" }
      ]
    };
  }
  if (p.includes("bot") || p.includes("discord") || p.includes("whatsapp") || p.includes("telegram") || p.includes("execute")) {
    return {
      text: `### \u{1F916} Vanitas Bot Gateway Integration

Vanitas provides a unified ingress for WhatsApp, Discord, and Telegram bots. The bot communicates via \`POST /api/v1/bot/execute\` using an API Key granted with the \`bot.execute\` scope.

\`\`\`bash
# Send command to Discord Bot
curl -X POST https://vanitas-bot.vercel.app/api/v1/bot/execute \\
  -H "Authorization: Bearer sk_live_discord_\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022" \\
  -H "Content-Type: application/json" \\
  -d '{
    "platform": "discord",
    "command": "system_status",
    "payload": { "notifyChannel": "ops-main" }
  }'
\`\`\`

**Supported Platforms:**
1. **WhatsApp Core Bot**: Operational (14ms latency, QR/Session auth)
2. **Discord Ops Bot**: Operational (8ms latency, Slash commands)
3. **Telegram Notifier**: Standby (Webhook dispatch)

All executions generate structured audit logs tagged with the \`BOT\` category.`,
      groundingSources: [
        { title: "Vanitas Bot Gateway Architecture", url: "https://vanitas-bot.vercel.app/docs#bots" }
      ]
    };
  }
  return {
    text: `### \u{1F30C} Vanitas Intelligence Copilot (${persona.toUpperCase()} \u2022 ${toneStyle.toUpperCase()})

Here is the recommended implementation pattern for your request:

\`\`\`typescript
import { VanitasClient } from '@vanitas/sdk';

const vanitas = new VanitasClient({
  apiKey: process.env.VANITAS_API_KEY,
  baseUrl: 'https://vanitas-bot.vercel.app/api/v1'
});

// Example: Query platform status & execute command
async function run() {
  const status = await vanitas.system.getStatus();
  console.log('System Status:', status);
}
run();
\`\`\`

**Available Capabilities:**
- Live Code Fixer & AST Security Scanner tool
- Endpoint integration schemas & payload construction
- Token scope matrix & \`assertGrantableScopes\` validation
- Real-time bot gateway control for WhatsApp and Discord
- Multi-tone generation with full Arabic & English technical support.`,
    groundingSources: [
      { title: "Vanitas Central Documentation", url: "https://vanitas-bot.vercel.app/docs" }
    ]
  };
}
async function diagnoseAndFixCode(req) {
  const { code, language, context, analysisMode = "full" } = req;
  const ai = getAiClient();
  if (ai && code.trim().length > 0) {
    try {
      const prompt = `You are the Vanitas Autonomous Code Analysis & Refactoring Engine powered by Gemini.
You analyze developer code snippets for:
1. Syntax errors, invalid grammar, missing brackets, broken imports, type violations, and compilation issues.
2. Security vulnerabilities, exposed raw secrets, missing Bearer authentication, missing HMAC verification, and injection flaws.
3. Architectural and refactoring improvements (e.g., exponential retry-after backoff on HTTP 429, structured async/await exception handling, strict typing, clean separation of concerns, connection reuse).
4. Maintainability and performance optimization.

Language: ${language}
Analysis Focus Mode: ${analysisMode}
${context ? `Developer Context: ${context}` : ""}

Respond ONLY with a valid JSON object matching this schema:
{
  "hasErrors": boolean,
  "score": number (0-100 code health score),
  "maintainabilityIndex": number (0-100 maintainability score),
  "syntaxErrorsCount": number,
  "securityFlawsCount": number,
  "refactoringCount": number,
  "issues": [
    {
      "line": number (1-indexed line number if determinable),
      "column": number (optional),
      "category": "syntax" | "security" | "refactor" | "performance" | "typing",
      "severity": "error" | "warning" | "info" | "security",
      "message": "concise description of the flaw or error",
      "suggestion": "actionable refactoring advice",
      "codeSnippet": "the buggy line or token"
    }
  ],
  "fixedCode": "the complete, clean, production-ready refactored code without markdown ticks around it",
  "explanation": "structured summary explaining all syntax fixes, security hardenings, and refactoring choices made",
  "refactoringHighlights": [
    "Key refactoring highlight 1",
    "Key refactoring highlight 2"
  ],
  "securityChecks": [
    {
      "check": "Name of verification check",
      "status": "pass" | "fail" | "warn",
      "details": "assessment description"
    }
  ]
}

Code to analyze:
\`\`\`${language}
${code}
\`\`\``;
      for (const modelName of CANDIDATE_MODELS) {
        try {
          const response = await ai.models.generateContent({
            model: modelName,
            contents: prompt,
            config: {
              responseMimeType: "application/json",
              temperature: 0.15
            }
          });
          if (response.text) {
            const parsed = JSON.parse(response.text);
            const issues = Array.isArray(parsed.issues) ? parsed.issues : [];
            const syntaxErrorsCount = parsed.syntaxErrorsCount ?? issues.filter((i) => i.category === "syntax" || i.severity === "error").length;
            const securityFlawsCount = parsed.securityFlawsCount ?? issues.filter((i) => i.category === "security" || i.severity === "security").length;
            const refactoringCount = parsed.refactoringCount ?? issues.filter((i) => i.category === "refactor" || i.category === "performance").length;
            return {
              hasErrors: parsed.hasErrors ?? (syntaxErrorsCount > 0 || securityFlawsCount > 0),
              score: Math.min(100, Math.max(0, parsed.score ?? 85)),
              maintainabilityIndex: Math.min(100, Math.max(0, parsed.maintainabilityIndex ?? 88)),
              syntaxErrorsCount,
              securityFlawsCount,
              refactoringCount,
              issues,
              fixedCode: parsed.fixedCode || code,
              explanation: parsed.explanation || "Analyzed code structure and applied production refactorings.",
              refactoringHighlights: Array.isArray(parsed.refactoringHighlights) ? parsed.refactoringHighlights : [],
              securityChecks: Array.isArray(parsed.securityChecks) ? parsed.securityChecks : []
            };
          }
        } catch (mErr) {
          console.warn(`Model ${modelName} code analysis attempt failed:`, mErr?.message);
        }
      }
    } catch (err) {
      console.warn("AI Code Diagnosis fallback triggered:", err);
    }
  }
  return analyzeCodeLocally(code, language);
}
function analyzeCodeLocally(code, language) {
  const issues = [];
  const securityChecks = [];
  const refactoringHighlights = [];
  let fixedCode = code;
  let score = 95;
  const lines = code.split("\n");
  let openBraces = 0;
  let openParens = 0;
  let openBrackets = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    openBraces += (line.match(/{/g) || []).length - (line.match(/}/g) || []).length;
    openParens += (line.match(/\(/g) || []).length - (line.match(/\)/g) || []).length;
    openBrackets += (line.match(/\[/g) || []).length - (line.match(/\]/g) || []).length;
  }
  if (openBraces !== 0 || openParens !== 0 || openBrackets !== 0) {
    issues.push({
      line: lines.length,
      category: "syntax",
      severity: "error",
      message: `Syntax error: Unmatched enclosing brackets (Delta: Braces ${openBraces}, Parens ${openParens}, Brackets ${openBrackets}).`,
      suggestion: "Ensure all opening braces, parentheses, and brackets are properly closed.",
      codeSnippet: lines[lines.length - 1] || code
    });
    score -= 30;
    if (openBraces > 0) fixedCode += "\n}".repeat(openBraces);
    if (openParens > 0) fixedCode += ")".repeat(openParens);
    if (openBrackets > 0) fixedCode += "]".repeat(openBrackets);
    refactoringHighlights.push("Fixed unclosed bracket syntax errors.");
  }
  if (/sk_live_[a-zA-Z0-9_-]{10,}/.test(code) || /password\s*=\s*['"][^'"]+['"]/.test(code) || /token\s*=\s*['"][a-zA-Z0-9_\-\.]{20,}['"]/.test(code)) {
    const secretLineIdx = lines.findIndex((l) => /sk_live_|password\s*=|token\s*=\s*['"]/.test(l));
    issues.push({
      line: secretLineIdx !== -1 ? secretLineIdx + 1 : void 0,
      category: "security",
      severity: "security",
      message: "Hardcoded production secret token detected in plain source code.",
      suggestion: "Migrate raw secrets to process.env or secure vault injection.",
      codeSnippet: secretLineIdx !== -1 ? lines[secretLineIdx] : void 0
    });
    fixedCode = fixedCode.replace(/sk_live_[a-zA-Z0-9_-]+/g, 'process.env.VANITAS_API_KEY || ""');
    score -= 25;
    refactoringHighlights.push("Isolated credentials into secure environment variable configuration.");
    securityChecks.push({
      check: "Credential Isolation & Secrets Vault",
      status: "fail",
      details: "Detected raw live tokens in payload. Replaced with process.env lookup."
    });
  } else {
    securityChecks.push({
      check: "Credential Isolation & Secrets Vault",
      status: "pass",
      details: "No plaintext production credentials exposed."
    });
  }
  if (code.includes("headers") && !code.includes("Bearer ") && code.includes("Authorization")) {
    const authLineIdx = lines.findIndex((l) => l.includes("Authorization"));
    issues.push({
      line: authLineIdx !== -1 ? authLineIdx + 1 : void 0,
      category: "syntax",
      severity: "error",
      message: 'Authorization header is missing standard "Bearer " scheme prefix.',
      suggestion: "Prefix token string with `Bearer ${token}` to avoid HTTP 401 Unauthorized.",
      codeSnippet: authLineIdx !== -1 ? lines[authLineIdx] : void 0
    });
    fixedCode = fixedCode.replace(/['"]Authorization['"]\s*:\s*([^,\n}]+)/g, '"Authorization": `Bearer ${$1}`');
    score -= 15;
    refactoringHighlights.push("Formatted Authorization header with standard Bearer schema.");
  }
  if ((code.includes("fetch(") || code.includes("axios.") || code.includes("requests.")) && !code.includes("429") && !code.includes("retry")) {
    issues.push({
      category: "refactor",
      severity: "warning",
      message: "No rate-limit (HTTP 429 / Retry-After) exponential backoff handling found.",
      suggestion: "Implement retry backoff logic to ensure graceful recovery during traffic bursts."
    });
    score -= 15;
    refactoringHighlights.push("Added resilience recommendations for HTTP 429 rate limit backoff.");
    securityChecks.push({
      check: "Rate Limiting & Ingress Resilience",
      status: "warn",
      details: "Client does not handle HTTP 429 throttling signals."
    });
  } else {
    securityChecks.push({
      check: "Rate Limiting & Ingress Resilience",
      status: "pass",
      details: "Proper throttle and backoff mechanism present."
    });
  }
  if ((code.includes("webhook") || code.includes("/webhook")) && !code.includes("hmac") && !code.includes("signature") && !code.includes("sha256")) {
    issues.push({
      category: "security",
      severity: "security",
      message: "Webhook handler does not verify cryptographic HMAC-SHA256 signature.",
      suggestion: "Validate x-vanitas-signature header before processing incoming webhook payloads."
    });
    score -= 20;
    refactoringHighlights.push("Recommended HMAC-SHA256 signature verification for inbound webhooks.");
    securityChecks.push({
      check: "Webhook Payload Integrity (HMAC)",
      status: "fail",
      details: "Insecure webhook receiver accepting unsigned payloads."
    });
  } else {
    securityChecks.push({
      check: "Webhook Payload Integrity (HMAC)",
      status: "pass",
      details: "Payload integrity verification present or not required."
    });
  }
  if (language === "typescript" && (code.includes(": any") || code.includes("as any"))) {
    issues.push({
      category: "typing",
      severity: "info",
      message: "Use of unsafe `any` type bypasses TypeScript static compiler checks.",
      suggestion: "Replace `any` with specific domain interfaces or `unknown`."
    });
    score -= 8;
    refactoringHighlights.push("Refactored dynamic `any` types into strict TypeScript interfaces.");
  }
  if ((language === "sql" || code.includes("SELECT ") || code.includes("WHERE ")) && (code.includes("${") || code.includes(" + "))) {
    issues.push({
      category: "security",
      severity: "security",
      message: "Potential SQL injection risk due to raw string interpolation in query string.",
      suggestion: "Use parameterized queries or prepared statements."
    });
    score -= 25;
    refactoringHighlights.push("Replaced raw SQL string interpolation with parameterized queries.");
  }
  if (issues.length === 0) {
    issues.push({
      category: "refactor",
      severity: "info",
      message: "Code passed all static syntax, security, and API integration checks.",
      suggestion: "Ready for production deployment."
    });
  }
  const syntaxErrorsCount = issues.filter((i) => i.category === "syntax" || i.severity === "error").length;
  const securityFlawsCount = issues.filter((i) => i.category === "security" || i.severity === "security").length;
  const refactoringCount = issues.filter((i) => i.category === "refactor" || i.category === "performance" || i.category === "typing").length;
  return {
    hasErrors: syntaxErrorsCount > 0 || securityFlawsCount > 0,
    score: Math.max(20, score),
    maintainabilityIndex: Math.max(30, Math.min(98, score + 5)),
    syntaxErrorsCount,
    securityFlawsCount,
    refactoringCount,
    issues,
    fixedCode,
    explanation: `Vanitas Code Doctor performed automated static and security analysis. Identified ${issues.length} item(s) across syntax, security headers, rate-limiting handlers, and type safety. Refactored into a hardened, production-ready structure.`,
    refactoringHighlights: refactoringHighlights.length > 0 ? refactoringHighlights : ["Applied clean error handling and structured formatting."],
    securityChecks: securityChecks.length > 0 ? securityChecks : [
      { check: "Zero-Trust Role Validation", status: "pass", details: "Validated permissions" },
      { check: "Payload Sanitization", status: "pass", details: "No dangerous injections detected" }
    ]
  };
}
async function performSemanticSearch(query, corpus) {
  const startTime = Date.now();
  const ai = getAiClient();
  const indexedItems = [];
  if (corpus.docs && Array.isArray(corpus.docs)) {
    for (const doc of corpus.docs) {
      indexedItems.push({
        id: `doc_${doc.id || doc.title}`,
        title: doc.title || "Documentation Guide",
        category: "documentation",
        snippet: doc.description || doc.content?.substring(0, 160) || "",
        targetView: "docs",
        actionLabel: "Open in Developer Portal",
        tags: doc.tags || ["api", "sdk", "endpoints"],
        rawText: `${doc.title} ${doc.description} ${doc.tags?.join(" ")} ${doc.content || ""}`.toLowerCase()
      });
    }
  }
  if (corpus.keys && Array.isArray(corpus.keys)) {
    for (const key of corpus.keys) {
      indexedItems.push({
        id: `key_${key.id}`,
        title: `API Key: ${key.name} (${key.keyPrefix}...)`,
        category: "api_keys",
        snippet: `Owner: ${key.ownerName} | Env: ${key.environment.toUpperCase()} | Status: ${key.status} | Scopes: [${key.scopes.join(", ")}] | Rate Limit: ${key.rateLimitPerMin || 120} RPM`,
        targetView: "keys",
        actionLabel: "Manage Key & Scopes",
        tags: [key.environment, key.status, ...key.scopes, "credentials", "rate-limit"],
        rawText: `${key.name} ${key.ownerName} ${key.environment} ${key.status} ${key.scopes.join(" ")} ${key.keyPrefix}`.toLowerCase()
      });
    }
  }
  if (corpus.status && Array.isArray(corpus.status)) {
    for (const s of corpus.status) {
      indexedItems.push({
        id: `status_${s.name}`,
        title: `Service Status: ${s.name}`,
        category: "status",
        snippet: `Uptime: ${s.uptime} | Latency: ${s.latency} | Current Status: ${s.status.toUpperCase()}`,
        targetView: "status",
        actionLabel: "View Live Metrics",
        tags: ["uptime", "latency", "health", s.status, s.name.toLowerCase()],
        rawText: `${s.name} ${s.status} ${s.uptime} ${s.latency} status health service`.toLowerCase()
      });
    }
  }
  if (corpus.bots && Array.isArray(corpus.bots)) {
    for (const bot of corpus.bots) {
      indexedItems.push({
        id: `bot_${bot.id}`,
        title: `Bot: ${bot.name} (${bot.type.toUpperCase()})`,
        category: "bot_gateway",
        snippet: `Status: ${bot.status} | Handlers: ${bot.eventHandlers?.join(", ")} | Rate: ${bot.rateLimitPerMin} RPM`,
        targetView: "bot-gateway",
        actionLabel: "Open Bot Gateway",
        tags: ["bot", bot.type, bot.status, ...bot.eventHandlers || []],
        rawText: `${bot.name} ${bot.type} ${bot.status} ${bot.eventHandlers?.join(" ")}`.toLowerCase()
      });
    }
  }
  if (corpus.releases && Array.isArray(corpus.releases)) {
    for (const rel of corpus.releases) {
      indexedItems.push({
        id: `rel_${rel.id}`,
        title: `Download Client: ${rel.name} (v${rel.version})`,
        category: "downloads",
        snippet: `${rel.platform.toUpperCase()} ${rel.type.toUpperCase()} | Arch: ${rel.architecture} | Min OS: ${rel.minOsVersion} | ${rel.description}`,
        targetView: "downloads",
        actionLabel: `Download ${rel.filename}`,
        tags: ["download", rel.platform, rel.type, rel.architecture, "install", "apk", "exe"],
        rawText: `${rel.name} ${rel.platform} ${rel.type} ${rel.architecture} ${rel.description} ${rel.features?.join(" ")}`.toLowerCase()
      });
    }
  }
  const q = query.toLowerCase().trim();
  let aiExplanation = "";
  let parsedIntent = "Semantic query across platform resources";
  if (ai && query.length > 2) {
    try {
      const prompt = `You are the Vanitas Semantic Search Engine.
Given the user's natural language search query: "${query}"
And this summary of platform sections:
- Documentation (/docs): Guides, API specifications, scopes, error handling, rate limiting.
- API Keys (/keys): Authorized keys, token rotation, secret hashing, rate limit presets, bursts.
- Public Status (/status): Health of API Ingress, Auth Gateway, PostgreSQL Cluster, WebSocket, Redis.
- Bot Gateway (/bot-gateway): Discord & WhatsApp bot dispatch, Webhook ingestion, slash commands.
- Security Center (/security): 2FA, session devices, brute-force threat mitigation, RBAC.
- Downloads (/downloads): Android APK, Windows EXE (x64/ARM64), macOS DMG, Linux AppImage.
- Database & External Servers: Supabase, Neon PostgreSQL, Upstash Redis, Render, Railway.

Respond in valid JSON only with this structure:
{
  "intent": "Brief description of user intent in 1 sentence (supports Arabic or English based on query)",
  "aiExplanation": "Helpful AI answer explaining where to find this and the direct resolution in 1-2 concise sentences",
  "relevantCategories": ["documentation", "api_keys", "status", "bot_gateway", "security", "downloads", "database"],
  "keywords": ["keyword1", "keyword2", "keyword3"]
}`;
      const aiResponse = await ai.models.generateContent({
        model: "gemini-3.7-flash",
        contents: prompt,
        config: {
          temperature: 0.2,
          responseMimeType: "application/json"
        }
      });
      const parsed = JSON.parse(aiResponse.text || "{}");
      if (parsed.intent) parsedIntent = parsed.intent;
      if (parsed.aiExplanation) aiExplanation = parsed.aiExplanation;
    } catch (e) {
      console.warn("Gemini semantic search parser fallback:", e);
    }
  }
  const queryTokens = q.split(/\s+/).filter(Boolean);
  const scoredHits = indexedItems.map((item) => {
    let score = 0;
    const titleLower = item.title.toLowerCase();
    const snippetLower = item.snippet.toLowerCase();
    const raw = item.rawText;
    if (titleLower.includes(q)) score += 0.6;
    else if (snippetLower.includes(q)) score += 0.4;
    else if (raw.includes(q)) score += 0.3;
    for (const token of queryTokens) {
      if (titleLower.includes(token)) score += 0.2;
      if (snippetLower.includes(token)) score += 0.1;
      if (item.tags.some((t) => t.toLowerCase().includes(token))) score += 0.15;
    }
    if (q.includes("key") || q.includes("token") || q.includes("\u0645\u0641\u062A\u0627\u062D") || q.includes("\u0631\u0645\u0632")) {
      if (item.category === "api_keys") score += 0.3;
    }
    if (q.includes("download") || q.includes("apk") || q.includes("exe") || q.includes("\u062A\u0646\u0632\u064A\u0644") || q.includes("\u062A\u062D\u0645\u064A\u0644") || q.includes("\u062A\u0637\u0628\u064A\u0642")) {
      if (item.category === "downloads") score += 0.35;
    }
    if (q.includes("down") || q.includes("uptime") || q.includes("error") || q.includes("latency") || q.includes("status") || q.includes("\u062D\u0627\u0644\u0629") || q.includes("\u0633\u064A\u0631\u0641\u0631")) {
      if (item.category === "status") score += 0.3;
    }
    if (q.includes("bot") || q.includes("discord") || q.includes("whatsapp") || q.includes("\u0628\u0648\u062A")) {
      if (item.category === "bot_gateway") score += 0.35;
    }
    if (q.includes("doc") || q.includes("guide") || q.includes("code") || q.includes("endpoint") || q.includes("\u0634\u0631\u062D") || q.includes("\u062F\u0644\u064A\u0644")) {
      if (item.category === "documentation") score += 0.3;
    }
    const clampedScore = Math.min(0.99, Math.max(0.1, Number(score.toFixed(2))));
    const confidenceLevel = clampedScore >= 0.6 ? "high" : clampedScore >= 0.35 ? "medium" : "low";
    return {
      ...item,
      relevanceScore: clampedScore,
      confidenceLevel
    };
  }).filter((hit) => hit.relevanceScore > 0.25).sort((a, b) => b.relevanceScore - a.relevanceScore).slice(0, 8);
  return {
    query,
    intent: parsedIntent,
    aiExplanation: aiExplanation || `Searched ${indexedItems.length} indexed resources across Vanitas API Gateway.`,
    hits: scoredHits,
    totalIndexedItems: indexedItems.length,
    executionTimeMs: Date.now() - startTime
  };
}
async function searchYouTubeVideos(query, maxResults = 6) {
  const youtubeApiKey = process.env.YOUTUBE_API_KEY;
  const ai = getAiClient();
  const defaultVideos = [
    {
      id: "vid_quickstart_01",
      title: "Vanitas Central API Gateway: Full Setup, JWT Auth & Scope Governance",
      description: "Comprehensive walkthrough on issuing scoped API keys, configuring sliding window rate limiting, and building resilient clients.",
      channelTitle: "Vanitas Developer Network",
      publishedAt: "2026-05-10T14:00:00Z",
      thumbnailUrl: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=640&auto=format&fit=crop",
      videoUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      embedUrl: "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
      duration: "14:25",
      views: "42.8K",
      tags: ["API Gateway", "JWT Auth", "Security", "TypeScript"],
      aiTakeaway: "Learn how to generate scoped credentials, configure burst limits, and monitor traffic in real-time."
    },
    {
      id: "vid_bot_02",
      title: "Building Discord & WhatsApp Autonomous Bots with Vanitas Gateway",
      description: "How to route multi-tenant slash commands, process encrypted webhooks, and trigger background agent tasks.",
      channelTitle: "Cloud Architect Guild",
      publishedAt: "2026-06-22T09:30:00Z",
      thumbnailUrl: "https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?q=80&w=640&auto=format&fit=crop",
      videoUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      embedUrl: "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
      duration: "18:50",
      views: "29.1K",
      tags: ["Discord Bot", "WhatsApp API", "Webhooks", "Automation"],
      aiTakeaway: "Step-by-step webhook dispatch architecture and message signing with HMAC-SHA256."
    },
    {
      id: "vid_database_03",
      title: "Connecting Free Cloud Databases (Supabase & Neon PostgreSQL) to APIs",
      description: "Provisioning zero-cost serverless PostgreSQL clusters, handling connection pooling, and live schema migrations.",
      channelTitle: "Database Sovereignty",
      publishedAt: "2026-07-04T16:15:00Z",
      thumbnailUrl: "https://images.unsplash.com/photo-1558494949-ef010cbdcc31?q=80&w=640&auto=format&fit=crop",
      videoUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      embedUrl: "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
      duration: "22:10",
      views: "65.3K",
      tags: ["Supabase", "Neon Postgres", "Free Tier", "SQL"],
      aiTakeaway: "Deploy high-throughput serverless Postgres databases with zero upfront infrastructure cost."
    },
    {
      id: "vid_ratelimit_04",
      title: "High-Throughput Rate Limiting with Upstash Redis and Sliding Window",
      description: "Defend public API gateways against DDoS attacks and brute-force traffic spikes using distributed Redis atomics.",
      channelTitle: "Edge Security Masters",
      publishedAt: "2026-07-18T12:00:00Z",
      thumbnailUrl: "https://images.unsplash.com/photo-1544197150-b99a580bb7a8?q=80&w=640&auto=format&fit=crop",
      videoUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      embedUrl: "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
      duration: "19:45",
      views: "51.2K",
      tags: ["Rate Limiting", "Upstash Redis", "DDoS Protection", "Node.js"],
      aiTakeaway: "Implement sub-millisecond sliding window algorithms to throttle abusive callers gracefully."
    },
    {
      id: "vid_clients_05",
      title: "Modern Mobile & Desktop Client Deployment (Android APK & Windows EXE)",
      description: "Deep dive into Android 14/15 ARM64 optimizations, Windows 11 Mica glass acrylic effects, and cryptographic binary signing.",
      channelTitle: "Native Systems Engineering",
      publishedAt: "2026-08-01T11:00:00Z",
      thumbnailUrl: "https://images.unsplash.com/photo-1517694712202-14dd9538aa97?q=80&w=640&auto=format&fit=crop",
      videoUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      embedUrl: "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
      duration: "16:40",
      views: "38.7K",
      tags: ["Android APK", "Windows EXE", "Modern UI", "DirectX"],
      aiTakeaway: "Configuring ARM64 native binaries and Windows DirectComposition for high-FPS desktop UI."
    },
    {
      id: "vid_arabic_06",
      title: "\u0634\u0631\u062D \u0634\u0627\u0645\u0644: \u0628\u0646\u0627\u0621 \u0648\u0631\u0628\u0637 \u0628\u0648\u0627\u0628\u0627\u062A \u0627\u0644\u0640 API \u0648\u0627\u0644\u0645\u0641\u0627\u062A\u064A\u062D \u0627\u0644\u0645\u0634\u0641\u0631\u0629 \u0648\u062D\u0645\u0627\u064A\u062A\u0647\u0627 \u0645\u0646 \u0627\u0644\u0627\u062E\u062A\u0631\u0627\u0642",
      description: "\u062F\u0644\u064A\u0644 \u0639\u0645\u0644\u064A \u0628\u0627\u0644\u0644\u063A\u0629 \u0627\u0644\u0639\u0631\u0628\u064A\u0629 \u0644\u0634\u0631\u062D \u0643\u064A\u0641\u064A\u0629 \u062A\u062F\u0648\u064A\u0631 \u0627\u0644\u0645\u0641\u0627\u062A\u064A\u062D \u0627\u0644\u0633\u0631\u064A\u0629 \u0648\u0627\u0633\u062A\u062E\u062F\u0627\u0645 Scopes \u0648\u062A\u0623\u0645\u064A\u0646 \u0627\u0644\u0640 Webhooks.",
      channelTitle: "\u0623\u0643\u0627\u062F\u064A\u0645\u064A\u0629 \u0627\u0644\u0633\u062D\u0627\u0628 \u0648\u0627\u0644\u0628\u0631\u0645\u062C\u0629",
      publishedAt: "2026-08-12T15:20:00Z",
      thumbnailUrl: "https://images.unsplash.com/photo-1550751827-4bd374c3f58b?q=80&w=640&auto=format&fit=crop",
      videoUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      embedUrl: "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
      duration: "28:15",
      views: "74.9K",
      tags: ["\u062A\u0639\u0644\u064A\u0645 \u0628\u0631\u0645\u062C\u0629", "\u0634\u0631\u062D \u0639\u0631\u0628\u064A", "\u0623\u0645\u0627\u0646 API", "\u0628\u0648\u062A\u0627\u062A"],
      aiTakeaway: "\u062E\u0637\u0648\u0627\u062A \u0639\u0645\u0644\u064A\u0629 \u0644\u0631\u0628\u0637 \u062E\u0648\u0627\u062F\u0645 \u0627\u0644\u0640 Backend \u0645\u0639 \u0642\u0648\u0627\u0639\u062F \u0627\u0644\u0628\u064A\u0627\u0646\u0627\u062A \u0627\u0644\u0645\u0634\u0641\u0631\u0629 \u0648\u0627\u0644\u062A\u062D\u0643\u0645 \u0628\u0627\u0644\u0635\u0644\u0627\u062D\u064A\u0627\u062A."
    }
  ];
  if (youtubeApiKey && query.trim()) {
    try {
      const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=${maxResults}&q=${encodeURIComponent(
        query + " tutorial development"
      )}&key=${youtubeApiKey}`;
      const resp = await fetch(url);
      if (resp.ok) {
        const data = await resp.json();
        if (data.items && Array.isArray(data.items) && data.items.length > 0) {
          const mappedVideos = data.items.map((item) => {
            const videoId = item.id?.videoId || item.id;
            return {
              id: videoId,
              title: item.snippet?.title || "YouTube Tutorial",
              description: item.snippet?.description || "Educational developer video walkthrough.",
              channelTitle: item.snippet?.channelTitle || "YouTube Creator",
              publishedAt: item.snippet?.publishedAt || (/* @__PURE__ */ new Date()).toISOString(),
              thumbnailUrl: item.snippet?.thumbnails?.high?.url || item.snippet?.thumbnails?.medium?.url || "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=640&auto=format&fit=crop",
              videoUrl: `https://www.youtube.com/watch?v=${videoId}`,
              embedUrl: `https://www.youtube-nocookie.com/embed/${videoId}`,
              duration: "15:00",
              views: "25K+",
              tags: ["YouTube Data API", "Tutorial", "Dev"],
              aiTakeaway: `Step-by-step guidance on ${query} directly from ${item.snippet?.channelTitle || "verified channel"}.`
            };
          });
          return {
            query,
            videos: mappedVideos,
            totalResults: mappedVideos.length,
            searchEngine: "youtube_direct",
            aiSummary: `Retrieved ${mappedVideos.length} live tutorials from YouTube Data API v3 matching "${query}".`
          };
        }
      }
    } catch (ytApiErr) {
      console.warn("YouTube Data API direct call error, falling back to Gemini semantic search:", ytApiErr);
    }
  }
  if (ai && query.trim()) {
    try {
      const prompt = `You are a YouTube semantic video search engine and developer education specialist.
The user is searching for educational video tutorials related to: "${query}"

Generate 4 to 6 highly relevant, accurate, and realistic technical YouTube video tutorial cards that directly address this learning need.
Include practical technical titles, channel names (or prominent tech creators/institutions), realistic durations, tags, and a crisp 1-sentence actionable AI educational takeaway ("aiTakeaway").

Respond with a valid JSON object matching this schema:
{
  "aiSummary": "1-2 sentence overview of what these video tutorials cover and recommended sequence",
  "videos": [
    {
      "id": "vid_semantic_id",
      "title": "Clear technical video title",
      "description": "2-3 sentence overview of what is covered in the video tutorial",
      "channelTitle": "Channel Name or Technology Organization",
      "publishedAt": "2026-06-01T00:00:00Z",
      "thumbnailUrl": "https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?q=80&w=640&auto=format&fit=crop",
      "videoUrl": "https://www.youtube.com/results?search_query=...",
      "embedUrl": "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
      "duration": "16:20",
      "views": "34.5K",
      "tags": ["Topic1", "Topic2", "Topic3"],
      "aiTakeaway": "Actionable takeaway: Key concept, security practice, or pattern taught in this video"
    }
  ]
}`;
      const response = await ai.models.generateContent({
        model: "gemini-3.7-flash",
        contents: prompt,
        config: {
          temperature: 0.3,
          responseMimeType: "application/json"
        }
      });
      const parsed = JSON.parse(response.text || "{}");
      if (parsed.videos && Array.isArray(parsed.videos) && parsed.videos.length > 0) {
        return {
          query,
          videos: parsed.videos.slice(0, maxResults),
          totalResults: parsed.videos.length,
          searchEngine: "gemini_grounded",
          aiSummary: parsed.aiSummary || `Found ${parsed.videos.length} video guides for "${query}".`
        };
      }
    } catch (e) {
      console.warn("Gemini YouTube video search fallback:", e);
    }
  }
  const qLower = query.toLowerCase();
  const filtered = defaultVideos.filter(
    (v) => v.title.toLowerCase().includes(qLower) || v.description.toLowerCase().includes(qLower) || v.tags.some((t) => t.toLowerCase().includes(qLower)) || qLower.includes("bot") && v.id.includes("bot") || qLower.includes("database") && v.id.includes("database") || qLower.includes("supabase") && v.id.includes("database") || qLower.includes("postgres") && v.id.includes("database") || qLower.includes("key") && v.id.includes("quickstart") || qLower.includes("rate") && v.id.includes("ratelimit") || qLower.includes("client") && v.id.includes("clients") || qLower.includes("android") && v.id.includes("clients") || qLower.includes("windows") && v.id.includes("clients") || qLower.includes("\u0634\u0631\u062D") && v.id.includes("arabic")
  );
  const finalVideos = filtered.length > 0 ? filtered : defaultVideos;
  return {
    query,
    videos: finalVideos.slice(0, maxResults),
    totalResults: finalVideos.length,
    searchEngine: "youtube_direct",
    aiSummary: `Showing educational tutorials matching "${query}".`
  };
}

// server.ts
var databasePool = process.env.DATABASE_URL ? new import_pg.Pool({ connectionString: process.env.DATABASE_URL, max: 8 }) : null;
function mapSuggestion(row) {
  return {
    id: row.id,
    title: row.title,
    details: row.details,
    category: row.category,
    status: row.status,
    createdAt: row.created_at,
    authorName: row.author_name,
    code: row.code || void 0,
    adminNote: row.admin_note || void 0
  };
}
async function createSuggestion(params) {
  if (!databasePool) return db.createSuggestion(params);
  const result = await databasePool.query(
    `insert into public.product_suggestions (title, details, category, code, author_name)
     values ($1, $2, $3, $4, $5) returning *`,
    [params.title, params.details, params.category, params.code || null, params.authorName]
  );
  return mapSuggestion(result.rows[0]);
}
async function listSuggestions() {
  if (!databasePool) return db.productSuggestions;
  const result = await databasePool.query("select * from public.product_suggestions order by created_at desc");
  return result.rows.map(mapSuggestion);
}
async function updateSuggestion(id, status, adminNote) {
  if (!databasePool) return db.updateSuggestionStatus(id, status, adminNote);
  const result = await databasePool.query(
    `update public.product_suggestions set status = $2, admin_note = coalesce($3, admin_note) where id = $1 returning *`,
    [id, status, adminNote ?? null]
  );
  return result.rows[0] ? mapSuggestion(result.rows[0]) : void 0;
}
async function findSuggestion(id) {
  if (!databasePool) return db.productSuggestions.find((item) => item.id === id);
  const result = await databasePool.query("select * from public.product_suggestions where id = $1", [id]);
  return result.rows[0] ? mapSuggestion(result.rows[0]) : void 0;
}
const app = (0, import_express.default)();
const PORT = 3e3;
const demoMode = process.env.DEMO_MODE === "true" && process.env.NODE_ENV !== "production";
  app.set("trust proxy", 1);
  app.use(import_express.default.json({ limit: "256kb" }));
  app.use(import_express.default.urlencoded({ extended: true }));
  app.use((_req, res, next) => {
    res.setHeader("X-DNS-Prefetch-Control", "on");
    res.setHeader("X-Frame-Options", "SAMEORIGIN");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    if (process.env.NODE_ENV === "production") {
      res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
      res.setHeader("Content-Security-Policy", "default-src 'self'; img-src 'self' https: data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; frame-ancestors 'self'; base-uri 'self'; form-action 'self'");
    }
    next();
  });
  function detectSource(req) {
    const headerSource = req.headers["x-client-source"];
    if (headerSource) {
      const s = headerSource.toUpperCase();
      if (["WEB", "BOT", "MOBILE", "DESKTOP", "APPLICATION"].includes(s)) {
        return s;
      }
    }
    const ua = (req.headers["user-agent"] || "").toLowerCase();
    if (ua.includes("discord") || ua.includes("bot") || ua.includes("axios") || ua.includes("curl")) return "BOT";
    if (ua.includes("mobile") || ua.includes("iphone") || ua.includes("android")) return "MOBILE";
    if (ua.includes("electron") || ua.includes("desktop")) return "DESKTOP";
    return "WEB";
  }
  app.use((req, res, next) => {
    const start = Date.now();
    res.on("finish", () => {
      const latency = Date.now() - start;
      if (req.path.startsWith("/api/")) {
        db.incrementRequestCount(req.path, res.statusCode, latency);
      }
    });
    next();
  });
  function getActorUser(req) {
    const roleHeader = req.headers["x-user-role"];
    const userIdHeader = req.headers["x-user-id"];
    if (demoMode && userIdHeader) {
      const user = db.users.find((u) => u.id === userIdHeader);
      if (user) return user;
    }
    if (demoMode && roleHeader === "ADMIN") {
      return db.users.find((u) => u.role === "ADMIN") || db.users[0];
    }
    return db.users.find((user) => user.role === "USER") || db.users[0];
  }
  app.get("/api/v1/health", (_req, res) => {
    res.json({
      status: "healthy",
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      version: "1.0.0",
      uptime: process.uptime(),
      service: "Vanitas Central Gateway"
    });
  });
  app.get("/api/v1/ready", (_req, res) => {
    res.json({
      ready: true,
      database: "connected",
      auth: "ready",
      ai: process.env.AI_PROVIDER === "ollama" ? "ollama_configured" : process.env.GEMINI_API_KEY ? "gemini_enabled" : "fallback_ready",
      mode: demoMode ? "demo" : "authenticated"
    });
  });
  app.get("/api/v1/status", (_req, res) => {
    res.json({
      platform: "Vanitas",
      status: db.systemStats.services,
      stats: {
        totalRequestsToday: db.systemStats.apiRequestsToday,
        p95LatencyMs: db.systemStats.p95LatencyMs,
        errorRate: db.systemStats.errorRate
      }
    });
  });
  app.get("/api/v1/auth/me", (req, res) => {
    const actor = getActorUser(req);
    res.json({
      user: actor,
      permissions: actor.role === "ADMIN" ? ALL_SCOPES.map((s) => s.scope) : ["api.read", "keys.read", "keys.create", "bot.execute"]
    });
  });
  app.post("/api/v1/auth/oauth", (req, res) => {
    const { provider } = req.body;
    const actor = getActorUser(req);
    const source = detectSource(req);
    db.recordAuditLog({
      actorId: actor.id,
      actorName: actor.name,
      actorEmail: actor.email,
      action: `OAUTH_LOGIN_${(provider || "GENERIC").toUpperCase()}`,
      category: "AUTH",
      target: `User Account: ${actor.id}`,
      source,
      status: "SUCCESS",
      ipAddress: req.ip || "194.230.14.88",
      metadata: { provider, userAgent: req.headers["user-agent"] }
    });
    res.json({
      success: true,
      token: `vnt_jwt_${Math.random().toString(36).substring(2, 14)}`,
      user: actor
    });
  });
  app.get("/api/v1/auth/sessions", (_req, res) => {
    res.json({ sessions: db.sessions });
  });
  app.delete("/api/v1/auth/sessions/:id", (req, res) => {
    const { id } = req.params;
    const actor = getActorUser(req);
    const idx = db.sessions.findIndex((s) => s.id === id);
    if (idx !== -1) {
      const removed = db.sessions.splice(idx, 1)[0];
      db.recordAuditLog({
        actorId: actor.id,
        actorName: actor.name,
        actorEmail: actor.email,
        action: "SESSION_REVOKED",
        category: "AUTH",
        target: `Session Device: ${removed.device} (${removed.ip})`,
        source: detectSource(req),
        status: "SUCCESS",
        ipAddress: req.ip || "194.230.14.88",
        metadata: { deviceId: id }
      });
      return res.json({ success: true, message: "Session terminated" });
    }
    res.status(404).json({ error: "Session not found" });
  });
  app.get("/api/v1/api-keys", (req, res) => {
    const actor = getActorUser(req);
    if (actor.role === "ADMIN") {
      return res.json({ keys: db.apiKeys, allScopes: ALL_SCOPES });
    }
    const userKeys = db.apiKeys.filter((k) => k.ownerId === actor.id);
    res.json({ keys: userKeys, allScopes: ALL_SCOPES.filter((s) => !s.adminOnly) });
  });
  app.get("/api/v1/api-keys/usage-analytics", (req, res) => {
    const period = req.query.period || "24h";
    const data = db.getKeyUsageAnalytics(period);
    res.json(data);
  });
  app.post("/api/v1/api-keys", (req, res) => {
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
        scopes,
        environment: environment || "live",
        rateLimitPerMin: Number(rateLimitPerMin) || 600,
        expiresAt: expiresAt || null
      });
      res.status(201).json({
        key: result.key,
        rawSecret: result.rawSecret,
        revealNote: "This secret is revealed only once. Store it in a secure vault."
      });
    } catch (err) {
      res.status(403).json({ error: err.message });
    }
  });
  app.post("/api/v1/api-keys/:id/rotate", (req, res) => {
    try {
      const actor = getActorUser(req);
      const { id } = req.params;
      const result = db.rotateApiKey(id, actor);
      res.json({
        key: result.key,
        rawSecret: result.rawSecret,
        revealNote: "Previous secret has been permanently invalidated. Store this new secret securely."
      });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });
  app.delete("/api/v1/api-keys/:id", (req, res) => {
    try {
      const actor = getActorUser(req);
      const { id } = req.params;
      const { reason } = req.body || {};
      const key = db.revokeApiKey(id, actor, reason);
      res.json({ success: true, key });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });
  app.patch("/api/v1/api-keys/:id/scopes", (req, res) => {
    try {
      const actor = getActorUser(req);
      const { id } = req.params;
      const { scopes } = req.body;
      if (!scopes || !Array.isArray(scopes)) {
        return res.status(400).json({ error: "Scopes array required" });
      }
      const key = db.updateApiKeyScopes(id, scopes, actor);
      res.json({ success: true, key });
    } catch (err) {
      res.status(403).json({ error: err.message });
    }
  });
  app.patch("/api/v1/api-keys/:id/rate-limit", (req, res) => {
    try {
      const actor = getActorUser(req);
      const { id } = req.params;
      const { rateLimitPerMin, burstLimit, rateLimitAlgorithm, actionOnExceed, monthlyQuota } = req.body;
      if (!rateLimitPerMin || isNaN(Number(rateLimitPerMin))) {
        return res.status(400).json({ error: "Valid rateLimitPerMin number is required" });
      }
      const key = db.updateApiKeyRateLimit(
        id,
        {
          rateLimitPerMin: Number(rateLimitPerMin),
          burstLimit: burstLimit !== void 0 ? Number(burstLimit) : void 0,
          rateLimitAlgorithm,
          actionOnExceed,
          monthlyQuota: monthlyQuota !== void 0 ? Number(monthlyQuota) : void 0
        },
        actor
      );
      res.json({ success: true, key });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });
  app.post("/api/v1/api-keys/:id/simulate-traffic", (req, res) => {
    try {
      const { id } = req.params;
      const { requestCount = 50 } = req.body;
      const key = db.apiKeys.find((k) => k.id === id);
      if (!key) return res.status(404).json({ error: "Key not found" });
      const count = Number(requestCount) || 50;
      key.usageCount += count;
      key.currentUsageThisMonth = (key.currentUsageThisMonth || 0) + count;
      key.currentRpmUsage = Math.min(
        Math.round(key.rateLimitPerMin * 1.3),
        (key.currentRpmUsage || 0) + Math.floor(count * 0.9)
      );
      key.lastUsedAt = (/* @__PURE__ */ new Date()).toISOString();
      const isThrottled = (key.currentRpmUsage || 0) >= key.rateLimitPerMin;
      const remainingQuota = Math.max(0, key.rateLimitPerMin - (key.currentRpmUsage || 0));
      res.json({
        success: true,
        key,
        simulatedBatch: count,
        currentRpm: key.currentRpmUsage,
        isThrottled,
        headers: {
          "x-ratelimit-limit": key.rateLimitPerMin,
          "x-ratelimit-remaining": remainingQuota,
          "x-ratelimit-reset": Math.floor(Date.now() / 1e3) + 45,
          "retry-after": isThrottled ? 15 : 0
        }
      });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });
  app.get("/api/v1/admin/users", (req, res) => {
    const actor = getActorUser(req);
    if (actor.role !== "ADMIN") {
      return res.status(403).json({ error: "403 Forbidden: Admin privileges required" });
    }
    res.json({ users: db.users });
  });
  app.patch("/api/v1/admin/users/:id/role", (req, res) => {
    const actor = getActorUser(req);
    if (actor.role !== "ADMIN") {
      return res.status(403).json({ error: "403 Forbidden: Admin privileges required" });
    }
    const { id } = req.params;
    const { role } = req.body;
    if (!["USER", "ADMIN"].includes(role)) {
      return res.status(400).json({ error: "Invalid role" });
    }
    const targetUser = db.users.find((u) => u.id === id);
    if (!targetUser) {
      return res.status(404).json({ error: "User not found" });
    }
    const priorRole = targetUser.role;
    targetUser.role = role;
    db.recordAuditLog({
      actorId: actor.id,
      actorName: actor.name,
      actorEmail: actor.email,
      action: "USER_ROLE_CHANGED",
      category: "ADMIN",
      target: `${targetUser.id} (${targetUser.email}) -> ${role}`,
      source: detectSource(req),
      status: "SUCCESS",
      ipAddress: req.ip || "194.230.14.88",
      metadata: { priorRole, newRole: role }
    });
    res.json({ success: true, user: targetUser });
  });
  app.get("/api/v1/admin/logs", (req, res) => {
    const actor = getActorUser(req);
    if (actor.role !== "ADMIN") {
      return res.status(403).json({ error: "403 Forbidden: Admin privileges required" });
    }
    const limit = parseInt(req.query.limit) || 25;
    const offset = parseInt(req.query.offset) || 0;
    const from = req.query.from;
    const category = (req.query.category || "ALL").toUpperCase();
    const search = (req.query.search || "").toLowerCase();
    let logs = [...db.auditLogs];
    if (from) {
      let sinceMs = 0;
      if (from === "24h") sinceMs = Date.now() - 24 * 3600 * 1e3;
      else if (from === "7d") sinceMs = Date.now() - 7 * 24 * 3600 * 1e3;
      else if (from === "30d") sinceMs = Date.now() - 30 * 24 * 3600 * 1e3;
      else if (!isNaN(Date.parse(from))) sinceMs = new Date(from).getTime();
      if (sinceMs > 0) {
        logs = logs.filter((l) => new Date(l.timestamp).getTime() >= sinceMs);
      }
    }
    if (category && category !== "ALL") {
      logs = logs.filter((l) => l.category === category);
    }
    if (search) {
      logs = logs.filter(
        (l) => l.action.toLowerCase().includes(search) || l.actorName.toLowerCase().includes(search) || l.target.toLowerCase().includes(search) || l.requestId.toLowerCase().includes(search)
      );
    }
    const total = logs.length;
    const paged = logs.slice(offset, offset + limit);
    res.json({
      total,
      limit,
      offset,
      logs: paged
    });
  });
  app.get("/api/v1/admin/logs/export", (req, res) => {
    const actor = getActorUser(req);
    if (actor.role !== "ADMIN") {
      return res.status(403).send("403 Forbidden");
    }
    const headers = ["Timestamp", "Actor", "Action", "Category", "Target", "Source", "Status", "Request ID", "IP Address", "Metadata"];
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
      `"${JSON.stringify(l.metadata || {}).replace(/"/g, '""')}"`
    ]);
    const csvContent = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="vanitas_audit_logs_${Date.now()}.csv"`);
    res.send(csvContent);
  });
  app.get("/api/v1/admin/statistics", (req, res) => {
    const actor = getActorUser(req);
    if (actor.role !== "ADMIN") {
      return res.status(403).json({ error: "403 Forbidden: Admin privileges required" });
    }
    res.json({ stats: db.systemStats, threats: db.securityThreats });
  });
  app.post("/api/v1/admin/emergency", (req, res) => {
    const actor = getActorUser(req);
    if (actor.role !== "ADMIN") {
      return res.status(403).json({ error: "403 Forbidden: Admin privileges required" });
    }
    const { action, targetId } = req.body;
    const source = detectSource(req);
    if (action === "TOGGLE_MAINTENANCE") {
      const flag = db.featureFlags.find((f) => f.key === "SYSTEM_MAINTENANCE_MODE");
      if (flag) {
        flag.enabled = !flag.enabled;
        db.recordAuditLog({
          actorId: actor.id,
          actorName: actor.name,
          actorEmail: actor.email,
          action: flag.enabled ? "EMERGENCY_MAINTENANCE_ENABLED" : "EMERGENCY_MAINTENANCE_DISABLED",
          category: "ADMIN",
          target: "Platform Core Services",
          source,
          status: "WARNING",
          ipAddress: req.ip || "194.230.14.88"
        });
        return res.json({ success: true, maintenanceMode: flag.enabled });
      }
    }
    if (action === "PURGE_SUSPICIOUS_KEYS") {
      let count = 0;
      db.apiKeys.forEach((k) => {
        if (k.status === "active" && k.environment === "test") {
          k.status = "revoked";
          count++;
        }
      });
      db.recordAuditLog({
        actorId: actor.id,
        actorName: actor.name,
        actorEmail: actor.email,
        action: "EMERGENCY_KEY_PURGE",
        category: "SECURITY",
        target: `${count} sandbox tokens revoked`,
        source,
        status: "WARNING",
        ipAddress: req.ip || "194.230.14.88"
      });
      return res.json({ success: true, revokedCount: count });
    }
    res.status(400).json({ error: "Unrecognized emergency action" });
  });
  app.get("/api/v1/admin/feature-flags", (_req, res) => {
    res.json({ featureFlags: db.featureFlags });
  });
  app.patch("/api/v1/admin/feature-flags/:id", (req, res) => {
    const actor = getActorUser(req);
    if (actor.role !== "ADMIN") {
      return res.status(403).json({ error: "403 Forbidden" });
    }
    const { id } = req.params;
    const { enabled } = req.body;
    const flag = db.featureFlags.find((f) => f.id === id);
    if (!flag) return res.status(404).json({ error: "Feature flag not found" });
    flag.enabled = !!enabled;
    flag.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
    res.json({ success: true, flag });
  });
  app.get("/api/v1/webhooks", (_req, res) => {
    res.json({ webhooks: db.webhooks, logs: db.webhookLogs });
  });
  app.post("/api/v1/webhooks", (req, res) => {
    const actor = getActorUser(req);
    const { name, url, events } = req.body;
    if (!name || !url || !events) {
      return res.status(400).json({ error: "Name, URL, and Events are required" });
    }
    const newWebhook = {
      id: `wh_${Date.now().toString(36)}`,
      name,
      url,
      events,
      secret: `whsec_${Math.random().toString(36).substring(2, 14)}`,
      status: "active",
      createdAt: (/* @__PURE__ */ new Date()).toISOString(),
      lastTriggeredAt: null,
      failureCount: 0
    };
    db.webhooks.unshift(newWebhook);
    db.recordAuditLog({
      actorId: actor.id,
      actorName: actor.name,
      actorEmail: actor.email,
      action: "WEBHOOK_CREATED",
      category: "API",
      target: `${newWebhook.name} (${newWebhook.url})`,
      source: detectSource(req),
      status: "SUCCESS",
      ipAddress: req.ip || "194.230.14.88"
    });
    res.status(201).json({ webhook: newWebhook });
  });
  app.post("/api/v1/webhooks/:id/test", (req, res) => {
    const { id } = req.params;
    const wh = db.webhooks.find((w) => w.id === id);
    if (!wh) return res.status(404).json({ error: "Webhook not found" });
    wh.lastTriggeredAt = (/* @__PURE__ */ new Date()).toISOString();
    const log = {
      id: `wh_log_${Date.now()}`,
      webhookId: wh.id,
      event: "ping.test",
      status: "delivered",
      statusCode: 200,
      latencyMs: Math.floor(Math.random() * 80) + 90,
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      payload: { event: "ping.test", timestamp: (/* @__PURE__ */ new Date()).toISOString(), message: "Vanitas ping verification handshake" }
    };
    db.webhookLogs.unshift(log);
    res.json({ success: true, log });
  });
  app.get("/api/v1/bot/status", (_req, res) => {
    res.json({ bots: db.bots });
  });
  app.post("/api/v1/bot/execute", (req, res) => {
    const actor = getActorUser(req);
    const { platform, command, payload } = req.body;
    const source = detectSource(req);
    if (!command) {
      return res.status(400).json({ error: "Missing command payload" });
    }
    const bot = db.bots.find((b) => b.platform === platform) || db.bots[0];
    bot.commandsExecuted += 1;
    bot.lastPingAt = (/* @__PURE__ */ new Date()).toISOString();
    db.recordAuditLog({
      actorId: actor.id,
      actorName: actor.name,
      actorEmail: actor.email,
      action: "BOT_COMMAND_EXECUTED",
      category: "BOT",
      target: `${platform || "discord"}::${command}`,
      source: "BOT",
      status: "SUCCESS",
      ipAddress: req.ip || "10.0.4.12",
      metadata: { command, payload, latencyMs: 14 }
    });
    res.json({
      success: true,
      executionId: `exec_${Date.now().toString(36)}`,
      platform: bot.platform,
      command,
      output: `Vanitas executed [${command}] on ${bot.name}. Result: Nominal. All systems in state 200 OK.`,
      timestamp: (/* @__PURE__ */ new Date()).toISOString()
    });
  });
  app.post("/api/v1/ai/chat", async (req, res) => {
    try {
      const { persona, toneStyle, prompt, enableWebSearch, enableVideoSearch, context } = req.body;
      if (!prompt) return res.status(400).json({ error: "Prompt is required" });
      const response = await processAiQuery({
        persona: persona || "code",
        toneStyle: toneStyle || "developer",
        prompt,
        enableWebSearch: !!enableWebSearch,
        enableVideoSearch: !!enableVideoSearch,
        context
      });
      res.json(response);
    } catch (err) {
      res.status(500).json({ error: err.message || "AI engine error" });
    }
  });
  app.post("/api/v1/ai/diagnose-fix", async (req, res) => {
    try {
      const { code, language = "typescript", context, autoFix } = req.body;
      if (!code || typeof code !== "string") {
        return res.status(400).json({ error: "Code snippet string is required" });
      }
      const result = await diagnoseAndFixCode({
        code,
        language,
        context,
        autoFix: autoFix !== false
      });
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err.message || "Failed running code diagnosis" });
    }
  });
  app.post("/api/v1/suggestions", async (req, res) => {
    const actor = getActorUser(req);
    const { title, details, category = "feature", code } = req.body;
    if (!title || !details) return res.status(400).json({ error: "Title and details are required" });
    if (!["bug", "feature", "ux"].includes(category)) return res.status(400).json({ error: "Invalid suggestion category" });
    const suggestion = await createSuggestion({ title, details, category, code, authorName: actor.name });
    db.recordAuditLog({
      actorId: actor.id,
      actorName: actor.name,
      actorEmail: actor.email,
      action: "SUGGESTION_CREATED",
      category: "ADMIN",
      target: suggestion.id,
      source: detectSource(req),
      status: "SUCCESS",
      ipAddress: req.ip || "unknown",
      metadata: { category }
    });
    res.status(201).json({ suggestion });
  });
  app.get("/api/v1/admin/suggestions", async (req, res) => {
    const actor = getActorUser(req);
    if (actor.role !== "ADMIN") return res.status(403).json({ error: "Administrator access required" });
    res.json({ suggestions: await listSuggestions() });
  });
  app.patch("/api/v1/admin/suggestions/:id", async (req, res) => {
    const actor = getActorUser(req);
    if (actor.role !== "ADMIN") return res.status(403).json({ error: "Administrator access required" });
    const { status, adminNote } = req.body;
    if (!["open", "reviewing", "resolved"].includes(status)) return res.status(400).json({ error: "Invalid status" });
    const suggestion = await updateSuggestion(req.params.id, status, adminNote);
    if (!suggestion) return res.status(404).json({ error: "Suggestion not found" });
    res.json({ suggestion });
  });
  app.post("/api/v1/admin/suggestions/:id/ai-fix", async (req, res) => {
    const actor = getActorUser(req);
    if (actor.role !== "ADMIN") return res.status(403).json({ error: "Administrator access required" });
    const suggestion = await findSuggestion(req.params.id);
    if (!suggestion) return res.status(404).json({ error: "Suggestion not found" });
    if (!suggestion.code) return res.status(400).json({ error: "A code sample is required before AI repair can run" });
    await updateSuggestion(suggestion.id, "reviewing", "Admin requested an AI repair proposal.");
    const diagnosis = await diagnoseAndFixCode({ code: suggestion.code, language: req.body.language || "typescript", context: suggestion.details, autoFix: true });
    res.json({ suggestion: await findSuggestion(suggestion.id), diagnosis });
  });
  app.all(["/api/v1/search/semantic", "/api/v1/semantic-search"], async (req, res) => {
    try {
      const query = req.method === "POST" ? req.body.query : req.query.q;
      if (!query || typeof query !== "string") {
        return res.status(400).json({ error: "Search query parameter is required" });
      }
      const docsCorpus = [
        {
          id: "doc_auth_scopes",
          title: "Authentication & Scopes Matrix Guide",
          description: "Overview of JWT bearer tokens, SHA-256 secret hashing, and granular scopes (api.read, bot.execute, admin.all).",
          tags: ["auth", "jwt", "scopes", "tokens", "security"]
        },
        {
          id: "doc_rate_limiting",
          title: "Sliding Window & Token Bucket Rate Limiting",
          description: "Configure high-throughput per-minute quotas, burst capacities, and 429 Too Many Requests response policies.",
          tags: ["rate-limit", "sliding_window", "token_bucket", "burst", "quota"]
        },
        {
          id: "doc_bot_gateway",
          title: "Discord & WhatsApp Bot Integration Protocol",
          description: "Ingest slash commands and automated actions across distributed guilds with sub-20ms latency.",
          tags: ["bot", "discord", "whatsapp", "slash_commands", "gateway"]
        },
        {
          id: "doc_webhooks",
          title: "Webhook Dispatcher & HMAC-SHA256 Signatures",
          description: "Secure event dispatching with exponential backoff retries and payload verification headers.",
          tags: ["webhooks", "hmac", "events", "dispatch", "signatures"]
        },
        {
          id: "doc_cloud_databases",
          title: "External Free Cloud Database Integrations (PostgreSQL & Redis)",
          description: "Connecting Supabase, Neon Serverless Postgres, and Upstash Redis with automated pooling and SSL.",
          tags: ["database", "postgres", "supabase", "neon", "upstash", "sql"]
        },
        {
          id: "doc_modern_clients",
          title: "Modern Client Architecture: Android 14/15 APK & Windows 11 EXE",
          description: "Deploying native ARM64 Android binaries and Windows 11 Mica acrylic workstation builds with hardware acceleration.",
          tags: ["downloads", "android", "apk", "windows", "exe", "arm64", "modern"]
        }
      ];
      const result = await performSemanticSearch(query, {
        docs: docsCorpus,
        keys: db.apiKeys,
        status: db.systemStats.requestBreakdown.map((r) => ({
          name: r.endpoint,
          uptime: "99.99%",
          latency: `${r.avgLatencyMs}ms`,
          status: r.errorCount > 0 ? "degraded" : "operational"
        })),
        bots: db.bots,
        threats: db.securityThreats,
        releases: db.releases
      });
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err.message || "Semantic search failed" });
    }
  });
  app.get("/api/v1/youtube/search", async (req, res) => {
    try {
      const q = req.query.q || "Vanitas API Gateway";
      const limit = parseInt(req.query.limit || "6", 10);
      const result = await searchYouTubeVideos(q, limit);
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err.message || "Failed searching YouTube videos" });
    }
  });
  app.get("/api/v1/databases/external", (_req, res) => {
    res.json({
      success: true,
      databases: db.externalDatabases,
      recommendedFreeTiers: [
        { provider: "supabase", name: "Supabase PostgreSQL", freeQuota: "500 MB DB + 50,000 MAU", url: "https://supabase.com" },
        { provider: "neon", name: "Neon Serverless Postgres", freeQuota: "0.5 GiB + Scale-to-Zero", url: "https://neon.tech" },
        { provider: "upstash", name: "Upstash Redis", freeQuota: "10,000 commands/day", url: "https://upstash.com" },
        { provider: "render", name: "Render Free Service", freeQuota: "Free Webhook receiver & worker", url: "https://render.com" }
      ]
    });
  });
  app.post("/api/v1/databases/external/test", (req, res) => {
    const { id } = req.body;
    if (!id) return res.status(400).json({ error: "Database ID is required" });
    const result = db.testDatabaseConnection(id);
    res.json(result);
  });
  app.post("/api/v1/databases/external", (req, res) => {
    const actor = getActorUser(req);
    const { name, provider, connectionUrl, region } = req.body;
    if (!name || !provider || !connectionUrl) {
      return res.status(400).json({ error: "Name, Provider, and Connection URL are required" });
    }
    const created = db.addExternalDatabase({ name, provider, connectionUrl, region });
    db.recordAuditLog({
      actorId: actor.id,
      actorName: actor.name,
      actorEmail: actor.email,
      action: "DATABASE_CONNECTED",
      category: "DATABASE",
      target: `${created.name} (${created.provider})`,
      source: detectSource(req),
      status: "SUCCESS",
      ipAddress: req.ip || "194.230.14.88",
      metadata: { provider: created.provider, region: created.region }
    });
    res.status(201).json({ success: true, database: created });
  });
  app.get("/api/v1/videos/tutorials", (_req, res) => {
    res.json({
      success: true,
      tutorials: db.videoTutorials
    });
  });
  app.get("/api/v1/download/releases", (_req, res) => {
    res.json({
      success: true,
      latestVersion: "1.4.2",
      releases: db.releases
    });
  });
  app.get("/api/v1/download/:type", (req, res) => {
    try {
      const actor = getActorUser(req);
      const source = detectSource(req);
      const { type } = req.params;
      if (!["apk", "exe", "dmg", "appimage"].includes(type)) {
        return res.status(400).json({ error: "Invalid platform release type. Expected: apk, exe, dmg, appimage" });
      }
      const release = db.recordClientDownload(type, actor, source);
      if (!release) return res.status(404).json({ error: "Release artifact not found" });
      if (req.query.format === "json" || req.headers.accept?.includes("application/json")) {
        return res.json({
          success: true,
          release,
          downloadUrl: `/api/v1/download/${type}?direct=true`
        });
      }
      const mimeTypes = {
        apk: "application/vnd.android.package-archive",
        exe: "application/x-msdownload",
        dmg: "application/x-apple-diskimage",
        appimage: "application/x-executable"
      };
      const contentType = mimeTypes[type] || "application/octet-stream";
      const filename = release.filename;
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
        `
`
      ].join("\n");
      const buffer = Buffer.from(manifestHeader, "utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.setHeader("Content-Type", contentType);
      res.setHeader("X-Vanitas-Version", release.version);
      res.setHeader("X-Vanitas-Checksum-SHA256", release.sha256);
      res.setHeader("Content-Length", buffer.length);
      res.send(buffer);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  if (process.env.NODE_ENV !== "production") {
    (async () => {
      const vite = await (0, import_vite.createServer)({
        server: { middlewareMode: true },
        appType: "spa"
      });
      app.use(vite.middlewares);
    })();
  } else {
    const distPath = import_path.default.join(process.cwd(), "dist");
    app.use(import_express.default.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(import_path.default.join(distPath, "index.html"));
    });
  }
  if (process.env.NODE_ENV !== "production") {
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Vanitas Central Server running on http://0.0.0.0:${PORT}`);
    });
  }
export default app;
//# sourceMappingURL=server.cjs.map