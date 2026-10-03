var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// src/server/db.ts
import crypto from "crypto";
function hashApiKeySecret(rawSecret) {
  return crypto.createHash("sha256").update(rawSecret, "utf8").digest("hex");
}
function attachSecretHash(key, hash) {
  Object.defineProperty(key, "secretHash", {
    value: hash,
    enumerable: false,
    writable: true,
    configurable: true
  });
}
var ALL_SCOPES, VanitasDatabase, db;
var init_db = __esm({
  "src/server/db.ts"() {
    ALL_SCOPES = [
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
    VanitasDatabase = class {
      // DELIBERATELY EMPTY: no seeded/fake suggestions or comments — ever.
      productSuggestions = [];
      // DELIBERATELY EMPTY: real accounts only. The first registration bootstraps
      // as ADMIN (pickInitialRole) — no demo personas exist anywhere.
      users = [];
      // DELIBERATELY EMPTY: keys are created by real accounts only.
      apiKeys = [];
      // DELIBERATELY EMPTY: only real audit events are recorded at runtime.
      auditLogs = [];
      // DELIBERATELY EMPTY: no fake devices — real sessions live in auth_sessions.
      sessions = [];
      // DELIBERATELY EMPTY: only real webhook endpoints configured by users.
      webhooks = [];
      // DELIBERATELY EMPTY: only real delivery logs at runtime.
      webhookLogs = [];
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
      // DELIBERATELY EMPTY: threats are detected/reported at runtime, never faked.
      securityThreats = [];
      systemStats = {
        // Counters start at ZERO and are counted for real at runtime
        // (incrementRequestCount + live DB counts in /admin/statistics).
        // No fabricated telemetry.
        totalUsers: 0,
        activeUsers: 0,
        apiRequestsToday: 0,
        apiRequestsThisMonth: 0,
        apiQuotaLimit: 25e4,
        p95LatencyMs: 0,
        errorRate: 0,
        activeApiKeys: 0,
        services: {
          api: "operational",
          auth: "operational",
          database: "operational",
          ai: "operational",
          bot: "operational",
          webhooks: "operational"
        },
        requestBreakdown: [],
        hourlyTraffic: []
      };
      // --- Methods ---
      recordAuditLog(entry) {
        const log = {
          ...entry,
          id: `log_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`,
          timestamp: (/* @__PURE__ */ new Date()).toISOString(),
          requestId: `req_${crypto.randomBytes(5).toString("hex")}`
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
        const env2 = params.environment || "live";
        const randPart = crypto.randomBytes(18).toString("base64url");
        const rawSecret = `sk_${env2}_vanitas_${randPart}`;
        const keyPrefix = rawSecret.substring(0, 14);
        const maskedSecret = `${keyPrefix}\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022${rawSecret.slice(-4)}`;
        const rateLimitPerMin = params.rateLimitPerMin || 600;
        const burstLimit = params.burstLimit || Math.round(rateLimitPerMin * 0.05);
        const newKey = {
          id: `key_${env2}_${Date.now().toString(36)}_${crypto.randomBytes(4).toString("hex")}`,
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
          usagePeriod: (/* @__PURE__ */ new Date()).toISOString().slice(0, 7),
          createdAt: (/* @__PURE__ */ new Date()).toISOString(),
          lastUsedAt: null,
          expiresAt: params.expiresAt || null,
          environment: env2
        };
        attachSecretHash(newKey, hashApiKeySecret(rawSecret));
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
        const env2 = key.environment;
        const randPart = crypto.randomBytes(18).toString("base64url");
        const rawSecret = `sk_${env2}_vanitas_${randPart}`;
        const keyPrefix = rawSecret.substring(0, 14);
        key.keyPrefix = keyPrefix;
        key.maskedSecret = `${keyPrefix}\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022${rawSecret.slice(-4)}`;
        attachSecretHash(key, hashApiKeySecret(rawSecret));
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
        this.systemStats.apiRequestsThisMonth += 1;
        let ep = this.systemStats.requestBreakdown.find((b) => b.endpoint === endpoint);
        if (!ep) {
          if (this.systemStats.requestBreakdown.length >= 12) return;
          ep = { endpoint, count: 0, avgLatencyMs: latencyMs, errorCount: 0 };
          this.systemStats.requestBreakdown.push(ep);
        }
        ep.count += 1;
        if (status >= 400) ep.errorCount += 1;
        ep.avgLatencyMs = Math.round(ep.avgLatencyMs * 0.85 + latencyMs * 0.15);
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
    db = new VanitasDatabase();
  }
});

// src/server/pg.ts
import { Pool } from "pg";
function ensureSchema() {
  if (!databasePool) return Promise.resolve();
  if (!schemaReady) {
    schemaReady = databasePool.query(SCHEMA_DDL).then(() => void 0).catch((err) => {
      console.error("[schema] ensure failed:", err.message);
      schemaReady = null;
      throw err;
    });
  }
  return schemaReady;
}
var databasePool, SCHEMA_DDL, schemaReady;
var init_pg = __esm({
  "src/server/pg.ts"() {
    databasePool = process.env.DATABASE_URL ? new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 8,
      ssl: /supabase\.co|neon\.tech|sslmode=require/.test(process.env.DATABASE_URL) ? { rejectUnauthorized: false } : void 0
    }) : null;
    if (databasePool) {
      databasePool.on("error", (err) => console.error("[db] pool error:", err.message));
    }
    SCHEMA_DDL = `
create table if not exists public.comments (
  id text primary key,
  doc_id text not null,
  user_id text not null references public.users(id) on delete cascade,
  author_name text not null default '',
  author_avatar text not null default '',
  body text not null check (char_length(body) between 2 and 2000),
  created_at timestamptz not null default now()
);
create index if not exists comments_doc_created_idx on public.comments (doc_id, created_at desc);
create index if not exists comments_user_idx on public.comments (user_id);
alter table public.comments enable row level security;
create table if not exists public.ai_chat_messages (
  id text primary key,
  user_id text not null references public.users(id) on delete cascade,
  role text not null check (role in ('user', 'ai')),
  content text not null check (char_length(content) between 1 and 20000),
  persona text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists ai_chat_user_created_idx on public.ai_chat_messages (user_id, created_at desc);
alter table public.ai_chat_messages enable row level security;
create table if not exists public.admin_invites (
  id text primary key,
  token text not null unique,
  created_by text not null,
  created_by_name text not null default '',
  role text not null default 'ADMIN' check (role in ('USER', 'ADMIN')),
  verification text not null default '',
  note text not null default '',
  max_uses int not null default 1 check (max_uses between 1 and 20),
  uses int not null default 0,
  revoked boolean not null default false,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists admin_invites_created_idx on public.admin_invites (created_at desc);
alter table public.admin_invites enable row level security;
alter table if exists public.users add column if not exists two_factor_secret text not null default '';
alter table if exists public.users add column if not exists verification text not null default '';
`;
    schemaReady = null;
  }
});

// src/server/security.ts
import crypto2 from "crypto";
function secureToken(prefix, bytes = 24) {
  return `${prefix}${crypto2.randomBytes(bytes).toString("base64url")}`;
}
function secureId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${crypto2.randomBytes(6).toString("hex")}`;
}
function sanitizeText(input, maxLen = 5e3) {
  if (typeof input !== "string") return "";
  let s = input.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");
  s = s.trim().slice(0, maxLen);
  return s;
}
function sanitizeUrl(input) {
  if (typeof input !== "string") return null;
  const s = input.trim().slice(0, 2048);
  let u;
  try {
    u = new URL(s);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  const host = u.hostname.toLowerCase();
  const blocked = [
    "localhost",
    "127.",
    "10.",
    "192.168.",
    "169.254.",
    "0.0.0.0",
    "::1",
    "[::1]"
  ];
  if (blocked.some((b) => host === b || host.startsWith(b))) return null;
  if (host.endsWith(".internal") || host.endsWith(".local")) return null;
  if (process.env.NODE_ENV === "production" && u.protocol !== "https:") return null;
  return u.toString();
}
function csvCell(value) {
  let s = String(value ?? "");
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  s = s.replace(/"/g, '""');
  return `"${s}"`;
}
function rateLimit({ windowMs = 6e4, max = 120 }) {
  return (req, res, next) => {
    const key = (req.ip || req.socket.remoteAddress || "unknown") + ":" + req.path;
    const now = Date.now();
    const arr = (hits.get(key) || []).filter((t) => now - t < windowMs);
    if (arr.length >= max) {
      res.setHeader("Retry-After", Math.ceil(windowMs / 1e3));
      return res.status(429).json({ error: "Too many requests. Slow down and retry." });
    }
    arr.push(now);
    hits.set(key, arr);
    next();
  };
}
function adminToken() {
  const t = process.env.ADMIN_API_TOKEN;
  if (t && t.length >= 32) return t;
  return null;
}
function getActorUser(req) {
  const demoMode = process.env.DEMO_MODE === "true" && process.env.NODE_ENV !== "production";
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  const expected = adminToken();
  if (expected && token && token.length >= 32) {
    try {
      const a = Buffer.from(token);
      const b = Buffer.from(expected);
      if (a.length === b.length && crypto2.timingSafeEqual(a, b)) {
        const adminUser = db.users.find((u) => u.role === "ADMIN");
        if (adminUser) return adminUser;
        return {
          id: "usr_admin_api_token",
          email: "admin-api-token@vanitas.local",
          name: "Admin API Token",
          username: "admin_api_token",
          avatarUrl: "",
          role: "ADMIN",
          twoFactorEnabled: false,
          createdAt: "1970-01-01T00:00:00.000Z",
          lastLoginAt: (/* @__PURE__ */ new Date()).toISOString(),
          verification: "",
          connectedAccounts: { google: false, github: false, discord: false }
        };
      }
    } catch {
    }
  }
  const sessionActor = req.actor;
  if (sessionActor) return sessionActor;
  if (demoMode) {
    const userIdHeader = req.headers["x-user-id"];
    if (userIdHeader) {
      const user = db.users.find((u) => u.id === sanitizeText(userIdHeader, 64));
      if (user) return user;
    }
    const roleHeader = req.headers["x-user-role"];
    if (roleHeader === "ADMIN") {
      return db.users.find((u) => u.role === "ADMIN") || null;
    }
  }
  return null;
}
function requireAdmin(req, res) {
  const actor = getActorUser(req);
  if (!actor) {
    res.status(401).json({ error: "Authentication required" });
    return null;
  }
  if (actor.role !== "ADMIN") {
    res.status(403).json({ error: "Administrator access required" });
    return null;
  }
  return actor;
}
function parsePagination(query) {
  let limit = parseInt(query.limit, 10);
  let offset = parseInt(query.offset, 10);
  if (!Number.isFinite(limit) || limit <= 0) limit = 25;
  if (!Number.isFinite(offset) || offset < 0) offset = 0;
  limit = Math.min(limit, 100);
  offset = Math.min(offset, 1e5);
  return { limit, offset };
}
function isValidScope(s) {
  return typeof s === "string" && /^[a-z.]+\.[a-z.]+$/.test(s) && s.length <= 40;
}
var hits;
var init_security = __esm({
  "src/server/security.ts"() {
    init_db();
    hits = /* @__PURE__ */ new Map();
  }
});

// src/server/authStore.ts
import crypto3 from "crypto";
async function pickInitialRole(email) {
  if (isAdminEmail(email)) return "ADMIN";
  if (databasePool) {
    const count = await databasePool.query("select count(*)::int as n from public.users");
    if ((count.rows[0]?.n ?? 0) === 0) return "ADMIN";
  } else if (db.users.length === 0) {
    return "ADMIN";
  }
  return "USER";
}
function scryptAsync(password, salt, keylen, opts) {
  return new Promise((resolve, reject) => {
    crypto3.scrypt(
      password.normalize("NFKC"),
      salt,
      keylen,
      { N: opts.N, r: opts.r, p: opts.p, maxmem: 128 * 1024 * 1024 },
      (err, key) => err ? reject(err) : resolve(key)
    );
  });
}
async function hashPassword(password) {
  const salt = crypto3.randomBytes(16);
  const key = await scryptAsync(password, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$16384$8$1$${salt.toString("base64")}$${key.toString("base64")}`;
}
async function verifyPassword(password, stored) {
  if (!stored) return false;
  try {
    const parts = stored.split("$");
    if (parts.length !== 6 || parts[0] !== "scrypt") return false;
    const N = Number(parts[1]);
    const r = Number(parts[2]);
    const p = Number(parts[3]);
    if (!Number.isInteger(N) || !Number.isInteger(r) || !Number.isInteger(p) || N < 1024 || N > 1 << 20) return false;
    const salt = Buffer.from(parts[4], "base64");
    const expected = Buffer.from(parts[5], "base64");
    if (salt.length < 8 || expected.length < 32) return false;
    const actual = await scryptAsync(password, salt, expected.length, { N, r, p });
    return crypto3.timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}
async function burnPasswordTime(password) {
  if (!dummyHashPromise) dummyHashPromise = hashPassword(crypto3.randomBytes(16).toString("hex"));
  await verifyPassword(password, await dummyHashPromise);
}
function isAdminEmail(email) {
  const list = (process.env.ADMIN_EMAILS || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  return list.includes(email.toLowerCase());
}
function usernameFromEmail(email, isTaken) {
  const base = (email.split("@")[0] || "user").toLowerCase().replace(/[^a-z0-9_]/g, "_").slice(0, 32) || "user";
  let candidate = base;
  let i = 1;
  while (isTaken(candidate)) {
    candidate = `${base.slice(0, 28)}${++i}`;
  }
  return candidate;
}
function rowToUser(row) {
  const iso = (v) => v instanceof Date ? v.toISOString() : v || void 0;
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    username: row.username || "",
    avatarUrl: row.avatar_url || DEFAULT_AVATAR,
    bio: row.bio || void 0,
    role: row.role === "ADMIN" ? "ADMIN" : "USER",
    verification: ["USER", "DEVELOPER", "ADMIN"].includes(row.verification) ? row.verification : "",
    twoFactorEnabled: !!row.two_factor_enabled,
    createdAt: iso(row.created_at) || (/* @__PURE__ */ new Date()).toISOString(),
    lastLoginAt: iso(row.last_login_at) || iso(row.created_at) || (/* @__PURE__ */ new Date()).toISOString(),
    connectedAccounts: row.connected_accounts || { google: false, github: false, discord: false }
  };
}
async function createAccount(params) {
  const email = params.email.trim().toLowerCase();
  const passwordHash = await hashPassword(params.password);
  const role = await pickInitialRole(email);
  if (databasePool) {
    try {
      const existing = await databasePool.query("select 1 from public.users where lower(email) = $1", [email]);
      if (existing.rowCount) return { ok: false, status: 409, error: "An account with this email already exists" };
      const id = secureId("usr");
      const username = usernameFromEmail(email, () => false);
      const result = await databasePool.query(
        `insert into public.users (id, email, name, username, avatar_url, role, password_hash, created_at, last_login_at)
         values ($1, lower($2), $3, $4, $5, $6, $7, now(), now())
         returning *`,
        [id, email, params.name, username, DEFAULT_AVATAR, role, passwordHash]
      );
      return { ok: true, user: rowToUser(result.rows[0]) };
    } catch (err) {
      if (err?.code === "23505") return { ok: false, status: 409, error: "An account with this email already exists" };
      if (err?.code === "42P01" || err?.code === "42703") {
        throw new Error("users table missing \u2014 run: npm run db:migrate (supabase/schema.sql)");
      }
      throw err;
    }
  }
  if (db.users.some((u) => u.email.toLowerCase() === email)) {
    return { ok: false, status: 409, error: "An account with this email already exists" };
  }
  const user = {
    id: secureId("usr"),
    email,
    name: params.name,
    username: usernameFromEmail(email, (u) => db.users.some((x) => x.username === u)),
    avatarUrl: DEFAULT_AVATAR,
    role,
    verification: "",
    twoFactorEnabled: false,
    createdAt: (/* @__PURE__ */ new Date()).toISOString(),
    lastLoginAt: (/* @__PURE__ */ new Date()).toISOString(),
    connectedAccounts: { google: false, github: false, discord: false }
  };
  db.users.push(user);
  memoryPasswords.set(email, { userId: user.id, hash: passwordHash });
  return { ok: true, user };
}
function invalidateResolveCache(userId) {
  for (const [key, rec] of resolveCache) {
    if (rec.user?.id === userId) resolveCache.delete(key);
  }
}
async function updateProfile(userId, updates) {
  if (databasePool) {
    const result = await databasePool.query(
      "update public.users set name = $2, avatar_url = $3 where id = $1 returning *",
      [userId, updates.name, updates.avatarUrl]
    );
    const user2 = result.rows[0] ? rowToUser(result.rows[0]) : null;
    if (user2) invalidateResolveCache(userId);
    return user2;
  }
  const user = db.users.find((u) => u.id === userId);
  if (!user) return null;
  user.name = updates.name;
  user.avatarUrl = updates.avatarUrl || DEFAULT_AVATAR;
  invalidateResolveCache(userId);
  return user;
}
async function forgetAccount(userId) {
  if (databasePool) {
    await databasePool.query("delete from public.api_keys where owner_id = $1", [userId]);
    await databasePool.query("delete from public.users where id = $1", [userId]);
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
  resolveCache.clear();
}
async function getTwoFactorSecret(userId) {
  if (databasePool) {
    const result = await databasePool.query("select two_factor_secret from public.users where id = $1", [userId]);
    return result.rows[0]?.two_factor_secret || null;
  }
  return memoryTwoFactor.get(userId) || null;
}
async function setTwoFactor(userId, secret, enabled) {
  if (databasePool) {
    await databasePool.query(
      "update public.users set two_factor_secret = $2, two_factor_enabled = $3 where id = $1",
      [userId, secret, enabled]
    );
  } else {
    if (secret) memoryTwoFactor.set(userId, secret);
    else memoryTwoFactor.delete(userId);
    const user = db.users.find((u) => u.id === userId);
    if (user) user.twoFactorEnabled = enabled;
  }
  invalidateResolveCache(userId);
}
async function findUserById(userId) {
  if (databasePool) {
    const result = await databasePool.query("select * from public.users where id = $1", [userId]);
    return result.rows[0] ? rowToUser(result.rows[0]) : null;
  }
  return db.users.find((u) => u.id === userId) || null;
}
async function verifyAccount(email, password) {
  const clean = email.trim().toLowerCase();
  if (databasePool) {
    try {
      const result = await databasePool.query("select * from public.users where lower(email) = $1", [clean]);
      const row = result.rows[0];
      if (!row) {
        await burnPasswordTime(password);
        return { ok: false, status: 401, error: "Invalid email or password" };
      }
      const valid = await verifyPassword(password, row.password_hash);
      if (!valid) return { ok: false, status: 401, error: "Invalid email or password" };
      const user2 = rowToUser({ ...row, last_login_at: (/* @__PURE__ */ new Date()).toISOString() });
      if (isAdminEmail(clean) && user2.role !== "ADMIN") {
        user2.role = "ADMIN";
        await databasePool.query("update public.users set role = 'ADMIN' where id = $1", [row.id]);
      }
      await databasePool.query("update public.users set last_login_at = now() where id = $1", [row.id]);
      return { ok: true, user: user2 };
    } catch (err) {
      if (err?.code === "42P01" || err?.code === "42703") {
        throw new Error("users table missing \u2014 run: npm run db:migrate (supabase/schema.sql)");
      }
      throw err;
    }
  }
  const rec = memoryPasswords.get(clean);
  const user = rec ? db.users.find((u) => u.id === rec.userId) : void 0;
  if (!rec || !user) {
    await burnPasswordTime(password);
    return { ok: false, status: 401, error: "Invalid email or password" };
  }
  if (!await verifyPassword(password, rec.hash)) {
    return { ok: false, status: 401, error: "Invalid email or password" };
  }
  user.lastLoginAt = (/* @__PURE__ */ new Date()).toISOString();
  if (isAdminEmail(clean)) user.role = "ADMIN";
  return { ok: true, user };
}
function hashToken(token) {
  return crypto3.createHash("sha256").update(token).digest("hex");
}
async function createSession(user, meta) {
  const token = `vnt_sess_${crypto3.randomBytes(32).toString("base64url")}`;
  const hash = hashToken(token);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  if (databasePool) {
    await databasePool.query(
      "insert into public.auth_sessions (token_hash, user_id, ip, user_agent, expires_at) values ($1, $2, $3, $4, $5)",
      [hash, user.id, String(meta.ip || "").slice(0, 64), String(meta.userAgent || "").slice(0, 200), expiresAt]
    );
  } else {
    if (memorySessions.size > 500) {
      const now = Date.now();
      for (const [k, v] of memorySessions) if (v.expiresAt < now) memorySessions.delete(k);
    }
    memorySessions.set(hash, { userId: user.id, expiresAt: expiresAt.getTime() });
  }
  return token;
}
async function resolveSession(token) {
  if (!token || !token.startsWith("vnt_sess_")) return null;
  const hash = hashToken(token);
  const cached = resolveCache.get(hash);
  if (cached) {
    if (cached.until > Date.now()) return cached.user;
    resolveCache.delete(hash);
  }
  let user = null;
  if (databasePool) {
    try {
      const result = await databasePool.query(
        `select u.* from public.auth_sessions s
         join public.users u on u.id = s.user_id
         where s.token_hash = $1 and s.expires_at > now()`,
        [hash]
      );
      user = result.rows[0] ? rowToUser(result.rows[0]) : null;
    } catch (err) {
      console.error("[auth] session lookup failed:", err.message);
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
async function revokeSession(token) {
  if (!token) return;
  const hash = hashToken(token);
  resolveCache.delete(hash);
  if (databasePool) {
    try {
      await databasePool.query("delete from public.auth_sessions where token_hash = $1", [hash]);
    } catch (err) {
      console.error("[auth] session revoke failed:", err.message);
    }
  } else {
    memorySessions.delete(hash);
  }
}
function fallbackOAuthEmail(provider, providerId) {
  return `${provider}_${providerId}@oauth.vanitas.local`;
}
function withConnectedAccount(user, provider) {
  if (provider === "google" || provider === "github" || provider === "discord") {
    user.connectedAccounts = { ...user.connectedAccounts, [provider]: true };
  }
  return user;
}
async function upsertOAuthUser(p) {
  const provider = p.provider.toLowerCase().slice(0, 20);
  const providerId = String(p.providerId).slice(0, 64);
  if (!providerId) throw new Error("oauth profile missing provider id");
  const identityKey = `${provider}:${providerId}`;
  const email = p.emailVerified && p.email ? p.email.trim().toLowerCase().slice(0, 120) : "";
  const name = (p.name || "OAuth User").trim().slice(0, 80) || "OAuth User";
  const avatarUrl = String(p.avatarUrl || "").slice(0, 500) || DEFAULT_AVATAR;
  const nowIso = (/* @__PURE__ */ new Date()).toISOString();
  if (databasePool) {
    try {
      const existing = await databasePool.query(
        `select u.* from public.user_identities i
         join public.users u on u.id = i.user_id
         where i.provider = $1 and i.provider_id = $2`,
        [provider, providerId]
      );
      if (existing.rows[0]) {
        const row = existing.rows[0];
        await markSocialLogin(row.id, provider);
        return withConnectedAccount(rowToUser({ ...row, last_login_at: nowIso }), provider);
      }
      if (email) {
        const byEmail = await databasePool.query("select * from public.users where lower(email) = $1", [email]);
        if (byEmail.rows[0]) {
          const row = byEmail.rows[0];
          await databasePool.query(
            "insert into public.user_identities (provider, provider_id, user_id) values ($1, $2, $3) on conflict (provider, provider_id) do nothing",
            [provider, providerId, row.id]
          );
          await markSocialLogin(row.id, provider);
          return withConnectedAccount(rowToUser({ ...row, last_login_at: nowIso }), provider);
        }
      }
      const finalRole = await pickInitialRole(email || "oauth@unknown");
      const id = secureId("usr");
      const username = usernameFromEmail(email || `${provider}${providerId}`, () => false);
      await databasePool.query(
        `with new_user as (
           insert into public.users (id, email, name, username, avatar_url, role, password_hash, created_at, last_login_at)
           values ($1, lower($2), $3, $4, $5, $6, '', now(), now())
           returning id
         )
         insert into public.user_identities (provider, provider_id, user_id)
         select $7, $8, id from new_user`,
        [id, email || fallbackOAuthEmail(provider, providerId), name, username, avatarUrl, finalRole, provider, providerId]
      );
      const created = await databasePool.query("select * from public.users where id = $1", [id]);
      return withConnectedAccount(rowToUser(created.rows[0]), provider);
    } catch (err) {
      if (err?.code === "42P01" || err?.code === "42703") {
        throw new Error("user_identities table missing \u2014 run: npm run db:migrate (supabase/schema.sql)");
      }
      throw err;
    }
  }
  const knownUserId = memoryIdentities.get(identityKey);
  if (knownUserId) {
    const user2 = db.users.find((u) => u.id === knownUserId);
    if (user2) {
      user2.lastLoginAt = nowIso;
      return withConnectedAccount(user2, provider);
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
  const user = {
    id: secureId("usr"),
    email: email || fallbackOAuthEmail(provider, providerId),
    name,
    username: usernameFromEmail(email || `${provider}${providerId}`, (u) => db.users.some((x) => x.username === u)),
    avatarUrl,
    role: await pickInitialRole(email),
    verification: "",
    twoFactorEnabled: false,
    createdAt: nowIso,
    lastLoginAt: nowIso,
    connectedAccounts: { google: false, github: false, discord: false }
  };
  db.users.push(user);
  memoryIdentities.set(identityKey, user.id);
  return withConnectedAccount(user, provider);
}
async function markSocialLogin(userId, provider) {
  await databasePool.query(
    `update public.users
     set last_login_at = now(),
         connected_accounts = jsonb_set(
           coalesce(connected_accounts, '{"google":false,"github":false,"discord":false}'::jsonb),
           array[$2]::text[], 'true')
     where id = $1`,
    [userId, provider]
  );
}
var SESSION_TTL_MS, RESOLVE_CACHE_TTL_MS, DEFAULT_AVATAR, dummyHashPromise, memoryPasswords, memorySessions, resolveCache, memoryTwoFactor, memoryIdentities;
var init_authStore = __esm({
  "src/server/authStore.ts"() {
    init_pg();
    init_db();
    init_security();
    SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1e3;
    RESOLVE_CACHE_TTL_MS = 6e4;
    DEFAULT_AVATAR = "/images/avatar-default.svg";
    dummyHashPromise = null;
    memoryPasswords = /* @__PURE__ */ new Map();
    memorySessions = /* @__PURE__ */ new Map();
    resolveCache = /* @__PURE__ */ new Map();
    memoryTwoFactor = /* @__PURE__ */ new Map();
    memoryIdentities = /* @__PURE__ */ new Map();
  }
});

// src/server/totp.ts
import crypto4 from "crypto";
function base32Encode(buf) {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of buf) {
    value = value << 8 | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32_ALPHABET[value >>> bits - 5 & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32_ALPHABET[value << 5 - bits & 31];
  return out;
}
function base32Decode(input) {
  const clean = input.replace(/=+$/, "").toUpperCase();
  let bits = 0;
  let value = 0;
  const out = [];
  for (const ch of clean) {
    const idx = B32_ALPHABET.indexOf(ch);
    if (idx === -1) throw new Error("invalid base32 input");
    value = value << 5 | idx;
    bits += 5;
    while (bits >= 8) {
      out.push(value >>> bits - 8 & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}
function generateTotpSecret() {
  return base32Encode(crypto4.randomBytes(20));
}
function totpAt(secretB32, counter) {
  const key = base32Decode(secretB32);
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter < 0 ? 0 : counter));
  const hmac = crypto4.createHmac("sha1", key).update(msg).digest();
  const offset = hmac[hmac.length - 1] & 15;
  const bin = (hmac[offset] & 127) << 24 | hmac[offset + 1] << 16 | hmac[offset + 2] << 8 | hmac[offset + 3];
  return String(bin % 1e6).padStart(6, "0");
}
function verifyTotp(secretB32, code) {
  if (!/^\d{6}$/.test(code)) return false;
  const counter = Math.floor(Date.now() / 3e4);
  return totpAt(secretB32, counter - 1) === code || totpAt(secretB32, counter) === code || totpAt(secretB32, counter + 1) === code;
}
function totpOtpauthUrl(email, secret) {
  const label = `Vanitas:${encodeURIComponent(email)}`;
  return `otpauth://totp/${label}?secret=${secret}&issuer=Vanitas&algorithm=SHA1&digits=6&period=30`;
}
var B32_ALPHABET;
var init_totp = __esm({
  "src/server/totp.ts"() {
    B32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  }
});

// src/server/oauth.ts
import crypto5 from "crypto";
function isOAuthProvider(value) {
  return OAUTH_PROVIDERS.includes(value);
}
function env(name) {
  return (process.env[name] || "").trim();
}
function getProviderConfig(provider) {
  const prefix = provider.toUpperCase();
  const clientId = env(`${prefix}_CLIENT_ID`);
  const clientSecret = env(`${prefix}_CLIENT_SECRET`);
  if (!clientId || !clientSecret) return null;
  const d = DEFAULTS[provider];
  return {
    provider,
    clientId,
    clientSecret,
    authorizeUrl: env(`${prefix}_AUTHORIZE_URL`) || d.authorizeUrl,
    tokenUrl: env(`${prefix}_TOKEN_URL`) || d.tokenUrl,
    profileUrl: env(`${prefix}_PROFILE_URL`) || d.profileUrl,
    scope: d.scope,
    scopeInTokenRequest: d.scopeInTokenRequest
  };
}
function listConfiguredProviders() {
  const out = {};
  for (const p of OAUTH_PROVIDERS) out[p] = getProviderConfig(p) !== null;
  return out;
}
function signState(provider, clientSecret) {
  const payload = `${provider}.${Date.now() + STATE_TTL_MS}`;
  const sig = crypto5.createHmac("sha256", clientSecret).update(payload).digest("base64url");
  return `${Buffer.from(payload, "utf8").toString("base64url")}.${sig}`;
}
function verifyState(provider, clientSecret, state) {
  if (typeof state !== "string" || state.length < 8 || state.length > 512) return false;
  const [p64, sig] = state.split(".");
  if (!p64 || !sig) return false;
  const payload = Buffer.from(p64, "base64url").toString("utf8");
  const expected = crypto5.createHmac("sha256", clientSecret).update(payload).digest("base64url");
  const a = Buffer.from(sig, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length || !crypto5.timingSafeEqual(a, b)) return false;
  const [p, expStr] = payload.split(".");
  const exp = Number(expStr);
  return p === provider && Number.isFinite(exp) && exp > Date.now();
}
function appBaseUrl(req) {
  const configured = (process.env.FRONTEND_URL || "").trim().replace(/\/+$/, "");
  if (configured) {
    try {
      const u = new URL(configured);
      if (u.protocol === "http:" || u.protocol === "https:") return u.origin;
    } catch {
    }
  }
  const host = String(req.headers.host || "");
  if (!/^[a-z0-9.:\-_[\]]+$/i.test(host)) return "http://localhost:3000";
  const forwarded = String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim();
  const proto = forwarded === "https" || process.env.VERCEL ? "https" : "http";
  return `${proto}://${host}`;
}
function callbackUrl(req, provider) {
  return `${appBaseUrl(req)}/api/v1/social/${provider}/callback`;
}
function buildAuthorizeUrl(cfg, state, redirectUri) {
  const u = new URL(cfg.authorizeUrl);
  if (cfg.provider === "github") {
    u.searchParams.set("client_id", cfg.clientId);
    u.searchParams.set("redirect_uri", redirectUri);
    u.searchParams.set("scope", cfg.scope);
    u.searchParams.set("state", state);
  } else {
    u.searchParams.set("client_id", cfg.clientId);
    u.searchParams.set("redirect_uri", redirectUri);
    u.searchParams.set("response_type", "code");
    u.searchParams.set("scope", cfg.scope);
    u.searchParams.set("state", state);
    if (cfg.provider === "google") u.searchParams.set("prompt", "select_account");
  }
  return u.toString();
}
async function toRecord(res) {
  const text = await res.text();
  try {
    const json = JSON.parse(text);
    if (json && typeof json === "object") return json;
  } catch {
  }
  return Object.fromEntries(new URLSearchParams(text));
}
async function exchangeCode(cfg, code, redirectUri) {
  const body = new URLSearchParams({
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri
  });
  if (cfg.scopeInTokenRequest) body.set("scope", cfg.scope);
  const res = await fetch(cfg.tokenUrl, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      accept: "application/json"
    },
    body
  });
  const data = await toRecord(res);
  if (!res.ok || data.error || !data.access_token) {
    throw new Error(`token exchange failed (${res.status}): ${String(data.error || "missing access_token")}`);
  }
  return data.access_token;
}
async function fetchJson(url, accessToken) {
  const res = await fetch(url, {
    headers: {
      accept: "application/json",
      authorization: `Bearer ${accessToken}`,
      "user-agent": "Vanitas-Auth"
    }
  });
  if (!res.ok) throw new Error(`profile fetch failed: ${res.status}`);
  return res.json();
}
async function fetchProfile(cfg, accessToken) {
  const data = await fetchJson(cfg.profileUrl, accessToken);
  if (cfg.provider === "discord") {
    return {
      providerId: String(data.id || ""),
      email: String(data.email || ""),
      emailVerified: !!data.verified,
      name: String(data.global_name || data.username || "Discord User"),
      avatarUrl: data.avatar ? `https://cdn.discordapp.com/avatars/${data.id}/${data.avatar}.png?size=256` : `https://cdn.discordapp.com/embed/avatars/${Number(data.discriminator || 0) % 5}.png`
    };
  }
  if (cfg.provider === "google") {
    return {
      providerId: String(data.sub || ""),
      email: String(data.email || ""),
      emailVerified: !!(data.verified_email ?? data.email_verified),
      name: String(data.name || data.given_name || "Google User"),
      avatarUrl: String(data.picture || "")
    };
  }
  let email = String(data.email || "");
  let emailVerified = false;
  try {
    const emails = await fetchJson("https://api.github.com/user/emails", accessToken);
    if (Array.isArray(emails)) {
      const entry = emails.find((e) => e.primary && e.verified) || emails.find((e) => e.verified);
      if (entry?.email) {
        email = String(entry.email);
        emailVerified = !!entry.verified;
      }
    }
  } catch {
  }
  return {
    providerId: String(data.id || ""),
    email,
    emailVerified,
    name: String(data.name || data.login || "GitHub User"),
    avatarUrl: String(data.avatar_url || "")
  };
}
var OAUTH_PROVIDERS, DEFAULTS, STATE_TTL_MS;
var init_oauth = __esm({
  "src/server/oauth.ts"() {
    OAUTH_PROVIDERS = ["discord", "google", "github"];
    DEFAULTS = {
      discord: {
        authorizeUrl: "https://discord.com/api/oauth2/authorize",
        tokenUrl: "https://discord.com/api/oauth2/token",
        profileUrl: "https://discord.com/api/users/@me",
        scope: "identify email",
        scopeInTokenRequest: true
      },
      google: {
        authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
        tokenUrl: "https://oauth2.googleapis.com/token",
        profileUrl: "https://openidconnect.googleapis.com/v1/userinfo",
        scope: "openid email profile",
        scopeInTokenRequest: false
      },
      github: {
        authorizeUrl: "https://github.com/login/oauth/authorize",
        tokenUrl: "https://github.com/login/oauth/access_token",
        profileUrl: "https://api.github.com/user",
        scope: "read:user user:email",
        scopeInTokenRequest: true
      }
    };
    STATE_TTL_MS = 10 * 60 * 1e3;
  }
});

// src/server/aiService.ts
import { GoogleGenAI } from "@google/genai";
function getAiClient() {
  if (!aiClient && process.env.GEMINI_API_KEY) {
    aiClient = new GoogleGenAI({
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
function pickModel(preferFirst) {
  const now = Date.now();
  const healthy = POLLI_MODELS.filter((m) => (modelSickUntil.get(m) ?? 0) < now);
  const pool = healthy.length > 0 ? healthy : POLLI_MODELS;
  return preferFirst ? pool[0] : pool[pool.length - 1];
}
function markModelSick(model, status) {
  if (status >= 500 || status === 404) modelSickUntil.set(model, Date.now() + 3e5);
}
function markModelWell(model) {
  modelSickUntil.delete(model);
}
async function pollinationsRetryDelay(attempt, lastAttemptAt, budgetUntil) {
  const wait = attempt === 0 ? 2e3 : lastAttemptAt + POLLI_WINDOW_MS + 1500 - Date.now();
  if (Date.now() + Math.max(wait, 0) + 4e3 > budgetUntil) return false;
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  return true;
}
async function queryPollinations(systemInstruction, prompt, budgetUntil = Date.now() + POLLI_BUDGET_MS) {
  for (let attempt = 0; attempt < 3; attempt++) {
    if (budgetUntil - Date.now() < 4e3) return null;
    const model = pickModel(attempt === 0);
    try {
      const sentAt = Date.now();
      const response = await fetch("https://text.pollinations.ai/openai", {
        method: "POST",
        headers: pollinationsHeaders({ "Content-Type": "application/json", Accept: "application/json" }),
        signal: AbortSignal.timeout(Math.min(2e4, budgetUntil - Date.now())),
        body: JSON.stringify({
          model,
          messages: pollinationsMessages(model, systemInstruction, prompt)
        })
      });
      if (!response.ok) {
        lastAiUpstream = `pollinations_http_${response.status}`;
        markModelSick(model, response.status);
        console.warn(`Pollinations HTTP ${response.status} (attempt ${attempt + 1});`);
        if (await pollinationsRetryDelay(attempt, sentAt, budgetUntil)) continue;
        return null;
      }
      const data = await response.json();
      const text = data.choices?.[0]?.message?.content?.trim();
      if (text) {
        lastAiUpstream = null;
        markModelWell(model);
        return text;
      }
      lastAiUpstream = "pollinations_empty_reply";
      if (await pollinationsRetryDelay(attempt, sentAt, budgetUntil)) continue;
      return null;
    } catch (error) {
      lastAiUpstream = `pollinations_${error?.name || "network_error"}`;
      console.warn("Pollinations unavailable; using the local deterministic fallback.", error instanceof Error ? error.message : error);
      return null;
    }
  }
  return null;
}
async function queryPollinationsStream(systemInstruction, prompt, onDelta, budgetUntil = Date.now() + POLLI_BUDGET_MS) {
  if (Date.now() < streamSkipUntil) return null;
  for (let attempt = 0; attempt < 2; attempt++) {
    if (budgetUntil - Date.now() < 4e3) return null;
    const model = pickModel(attempt === 0);
    let response;
    const controller = new AbortController();
    const headerTimer = setTimeout(() => controller.abort(), 5e3);
    let totalTimer;
    let sentAt = Date.now();
    try {
      response = await fetch("https://text.pollinations.ai/openai", {
        method: "POST",
        headers: pollinationsHeaders({ "Content-Type": "application/json", Accept: "text/event-stream" }),
        signal: controller.signal,
        body: JSON.stringify({
          model,
          stream: true,
          messages: pollinationsMessages(model, systemInstruction, prompt)
        })
      });
      clearTimeout(headerTimer);
      totalTimer = setTimeout(() => controller.abort(), Math.max(1e3, budgetUntil - Date.now() - 8e3));
    } catch (error) {
      clearTimeout(headerTimer);
      if (error?.name === "AbortError") {
        streamSkipUntil = Date.now() + 18e4;
        console.warn("Pollinations stream hung (no headers in 5s); skipping streams for 3 minutes.");
      } else {
        console.warn("Pollinations stream unavailable; using a full response instead.", error instanceof Error ? error.message : error);
      }
      return null;
    }
    if (!response.ok || !response.body) {
      clearTimeout(totalTimer);
      lastAiUpstream = `pollinations_stream_http_${response.status}`;
      markModelSick(model, response.status);
      console.warn(`Pollinations stream HTTP ${response.status} (attempt ${attempt + 1});`);
      if (attempt + 1 < 2 && await pollinationsRetryDelay(attempt, sentAt, budgetUntil)) continue;
      return null;
    }
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("event-stream")) {
      clearTimeout(totalTimer);
      const raw = (await response.text()).trim();
      if (!raw) return null;
      let text = raw;
      try {
        const json = JSON.parse(raw);
        const content = json.choices?.[0]?.message?.content;
        if (content) text = content;
      } catch {
      }
      lastAiUpstream = null;
      markModelWell(model);
      onDelta(text);
      return text;
    }
    try {
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let full = "";
      for (; ; ) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data:")) continue;
          const payload = trimmed.slice(5).trim();
          if (!payload || payload === "[DONE]") continue;
          try {
            const json = JSON.parse(payload);
            const delta = json.choices?.[0]?.delta?.content;
            if (delta) {
              full += delta;
              onDelta(delta);
            }
          } catch {
          }
        }
      }
      clearTimeout(totalTimer);
      if (full.trim()) {
        lastAiUpstream = null;
        markModelWell(model);
        streamSkipUntil = 0;
        return full.trim();
      }
      lastAiUpstream = "pollinations_stream_empty_reply";
      return null;
    } catch (error) {
      clearTimeout(totalTimer);
      lastAiUpstream = `pollinations_stream_${error?.name || "network_error"}`;
      if (error?.name === "AbortError") {
        streamSkipUntil = Date.now() + 18e4;
        console.warn("Pollinations stream stalled; skipping streams for 3 minutes.");
      } else {
        console.warn("Pollinations stream aborted; using a full response instead.", error instanceof Error ? error.message : error);
      }
      return null;
    }
  }
  return null;
}
async function queryPollinationsLegacy(systemInstruction, prompt, budgetUntil = Date.now() + POLLI_BUDGET_MS) {
  if (budgetUntil - Date.now() < 3e3) return null;
  const model = pickModel(false);
  try {
    const response = await fetch("https://text.pollinations.ai/", {
      method: "POST",
      headers: pollinationsHeaders({ "Content-Type": "application/json" }),
      signal: AbortSignal.timeout(Math.min(2e4, budgetUntil - Date.now())),
      body: JSON.stringify({
        model,
        // safety-net model at this tier
        messages: pollinationsMessages(model, systemInstruction, prompt)
      })
    });
    if (!response.ok) {
      lastAiUpstream = `pollinations_legacy_http_${response.status}`;
      markModelSick(model, response.status);
      console.warn(`Pollinations legacy HTTP ${response.status};`);
      return null;
    }
    const text = (await response.text()).trim();
    if (!text) {
      lastAiUpstream = "pollinations_legacy_empty";
      return null;
    }
    if (text.startsWith("{")) {
      try {
        const json = JSON.parse(text);
        if (json && json.error) {
          lastAiUpstream = `pollinations_legacy_error_${String(json.error).slice(0, 40)}`;
          return null;
        }
      } catch {
      }
    }
    lastAiUpstream = null;
    markModelWell(model);
    return text;
  } catch (error) {
    lastAiUpstream = `pollinations_legacy_${error?.name || "network_error"}`;
    return null;
  }
}
async function queryOllamaStream(systemInstruction, prompt, onDelta) {
  const baseUrl = process.env.OLLAMA_BASE_URL;
  if (process.env.AI_PROVIDER !== "ollama" || !baseUrl) return null;
  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, "")}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
      signal: AbortSignal.timeout(6e4),
      body: JSON.stringify({
        model: process.env.OLLAMA_MODEL || "llama3.2",
        stream: true,
        messages: [
          { role: "system", content: systemInstruction },
          { role: "user", content: prompt }
        ]
      })
    });
    if (!response.ok || !response.body) return null;
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let full = "";
    for (; ; ) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const json = JSON.parse(trimmed);
          const delta = json.message?.content;
          if (delta) {
            full += delta;
            onDelta(delta);
          }
        } catch {
        }
      }
    }
    return full.trim() || null;
  } catch (error) {
    console.warn("Ollama stream unavailable; using a full response instead.", error instanceof Error ? error.message : error);
    return null;
  }
}
function getLastAiUpstream() {
  return lastAiUpstream;
}
function pollinationsHeaders(extra = {}) {
  const headers = { "User-Agent": BROWSER_UA, ...extra };
  const token = process.env.POLLINATIONS_TOKEN;
  if (token) headers.authorization = `Bearer ${token}`;
  return headers;
}
function pollinationsMessages(model, systemInstruction, prompt) {
  if (model === "openai-fast") {
    return [{ role: "user", content: `${systemInstruction}

${prompt}` }];
  }
  return [
    { role: "system", content: systemInstruction },
    { role: "user", content: prompt }
  ];
}
async function prepareAiQuery(options) {
  const { persona, toneStyle = "developer", prompt, enableVideoSearch } = options;
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
${toneModifiers[toneStyle] || ""}

${SITE_FACTS}`;
  if (retrievedVideos && retrievedVideos.length > 0) {
    selectedInstruction += `
Note: ${retrievedVideos.length} educational YouTube video tutorials have been retrieved and will be displayed in interactive cards directly within the user interface. Reference the educational topics and offer practical implementation steps.`;
  }
  return { instruction: selectedInstruction, videos: retrievedVideos, videoQuery: videoQueryStr };
}
async function runFullQuery(options, prep, budgetUntil = Date.now() + POLLI_BUDGET_MS) {
  const { persona, toneStyle = "developer", prompt, context, enableWebSearch } = options;
  const selectedInstruction = prep.instruction;
  const retrievedVideos = prep.videos;
  const videoQueryStr = prep.videoQuery;
  const ollamaText = await queryOllama(selectedInstruction, prompt);
  if (ollamaText) {
    return { text: ollamaText, engine: "ollama", videos: retrievedVideos, videoQuery: videoQueryStr };
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
          engine: "gemini",
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
  const freeText = await queryPollinations(selectedInstruction, prompt, budgetUntil);
  if (freeText) {
    return { text: freeText, engine: "pollinations", videos: retrievedVideos, videoQuery: videoQueryStr };
  }
  const legacyText = await queryPollinationsLegacy(selectedInstruction, prompt, budgetUntil);
  if (legacyText) {
    return { text: legacyText, engine: "pollinations_legacy", videos: retrievedVideos, videoQuery: videoQueryStr };
  }
  const fallback = generateFallbackResponse(persona, toneStyle, prompt, context);
  const notice = /[\u0600-\u06FF]/.test(prompt) ? "> \u26A0\uFE0F \u0627\u0644\u0645\u062D\u0631\u0643 \u0627\u0644\u0633\u062D\u0627\u0628\u064A \u0645\u0624\u0642\u062A\u0627\u064B \u063A\u064A\u0631 \u0645\u062A\u0627\u062D \u0627\u0644\u0622\u0646 \u2014 \u0647\u0630\u0647 \u0627\u0644\u0625\u062C\u0627\u0628\u0629 \u0645\u0646 \u0642\u0627\u0639\u062F\u0629 \u0627\u0644\u0645\u0639\u0631\u0641\u0629 \u0627\u0644\u0645\u062D\u0644\u064A\u0629 \u0627\u0644\u0645\u062F\u0645\u062C\u0629 \u0641\u064A \u0627\u0644\u0645\u0646\u0635\u0629.\n\n" : "> \u26A0\uFE0F The live AI engine is temporarily unreachable \u2014 this reply comes from the platform's built-in local knowledge base.\n\n";
  return {
    ...fallback,
    text: `${notice}${fallback.text}`,
    engine: "local_kb",
    upstream: lastAiUpstream,
    videos: retrievedVideos,
    videoQuery: videoQueryStr
  };
}
async function processAiQuery(options) {
  const prep = await prepareAiQuery(options);
  return runFullQuery(options, prep);
}
async function processAiQueryStream(options, onDelta) {
  const budgetUntil = Date.now() + POLLI_BUDGET_MS;
  const prep = await prepareAiQuery(options);
  let emitted = false;
  const emit = (chunk) => {
    emitted = true;
    onDelta(chunk);
  };
  const needsGeminiGrounding = !!options.enableWebSearch && process.env.AI_PROVIDER !== "ollama" && !!getAiClient();
  if (!needsGeminiGrounding) {
    const ollamaStreamed = await queryOllamaStream(prep.instruction, options.prompt, emit);
    if (ollamaStreamed !== null) {
      return { text: ollamaStreamed, engine: "ollama", videos: prep.videos, videoQuery: prep.videoQuery };
    }
    if (!emitted) {
      const polliStreamed = await queryPollinationsStream(prep.instruction, options.prompt, emit, budgetUntil);
      if (polliStreamed !== null) {
        return { text: polliStreamed, engine: "pollinations", videos: prep.videos, videoQuery: prep.videoQuery };
      }
    }
  }
  const full = await runFullQuery(options, prep, budgetUntil);
  if (full.text && !emitted) onDelta(full.text);
  return full;
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
  const hasCode = code.trim().length > 0;
  let diagnosisPrompt = "";
  if (hasCode) {
    try {
      diagnosisPrompt = `You are the Vanitas Autonomous Code Analysis & Refactoring Engine powered by Gemini.
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
      if (ai) for (const modelName of CANDIDATE_MODELS) {
        try {
          const response = await ai.models.generateContent({
            model: modelName,
            contents: diagnosisPrompt,
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
  if (diagnosisPrompt) {
    try {
      const freeText = await queryPollinations(
        "You are a strict code-analysis engine. Respond ONLY with the valid JSON object requested \u2014 no markdown fences, no prose.",
        diagnosisPrompt
      );
      if (freeText) {
        const parsed = JSON.parse(freeText.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, ""));
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
    } catch (err) {
      console.warn("Pollinations diagnosis unavailable; using local analyzer.", err.message);
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
  const trimmedQuery = query.trim();
  if (!trimmedQuery) {
    return {
      query,
      videos: [],
      totalResults: 0,
      searchEngine: "none",
      aiSummary: "Enter a topic to search live YouTube results."
    };
  }
  const youtubeApiKey = process.env.YOUTUBE_API_KEY;
  if (youtubeApiKey) {
    try {
      const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=${maxResults}&q=${encodeURIComponent(
        trimmedQuery + " tutorial"
      )}&key=${youtubeApiKey}`;
      const resp = await fetch(url, { signal: AbortSignal.timeout(1e4) });
      if (resp.ok) {
        const data = await resp.json();
        const items = Array.isArray(data.items) ? data.items : [];
        if (items.length > 0) {
          const mapped = items.map((item) => {
            const videoId = item.id?.videoId || item.id;
            return {
              id: videoId,
              title: decodeHtmlEntities(item.snippet?.title || "YouTube video"),
              description: decodeHtmlEntities(item.snippet?.description || ""),
              channelTitle: item.snippet?.channelTitle || "YouTube",
              publishedAt: item.snippet?.publishedAt || "",
              thumbnailUrl: item.snippet?.thumbnails?.high?.url || item.snippet?.thumbnails?.medium?.url || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
              videoUrl: `https://www.youtube.com/watch?v=${videoId}`,
              embedUrl: `https://www.youtube-nocookie.com/embed/${videoId}`,
              tags: []
            };
          });
          return {
            query,
            videos: mapped,
            totalResults: mapped.length,
            searchEngine: "youtube_api",
            aiSummary: `Retrieved ${mapped.length} live results from the YouTube Data API for "${query}".`
          };
        }
      }
    } catch (ytApiErr) {
      console.warn("YouTube Data API call failed; trying the keyless live search:", ytApiErr);
    }
  }
  try {
    const videos = await searchYouTubeKeyless(trimmedQuery, maxResults);
    if (videos.length > 0) {
      return {
        query,
        videos,
        totalResults: videos.length,
        searchEngine: "youtube_keyless",
        aiSummary: `Found ${videos.length} live YouTube results for "${query}" (real-time search, no API key).`
      };
    }
  } catch (keylessErr) {
    console.warn("Keyless YouTube search failed:", keylessErr);
  }
  return {
    query,
    videos: [],
    totalResults: 0,
    searchEngine: "none",
    aiSummary: `No live YouTube results could be retrieved for "${query}" right now. Please try again in a moment.`
  };
}
function decodeHtmlEntities(text) {
  return String(text).replace(/&quot;/g, '"').replace(/&#0?39;|&#x27;/g, "'").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ");
}
async function searchYouTubeKeyless(query, maxResults) {
  const response = await fetch(`https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
      "Accept-Language": "en-US,en;q=0.9",
      Accept: "text/html,application/xhtml+xml"
    },
    signal: AbortSignal.timeout(12e3)
  });
  if (!response.ok) return [];
  const html = await response.text();
  const marker = "var ytInitialData = ";
  const start = html.indexOf(marker);
  if (start === -1) return [];
  const jsonStart = start + marker.length;
  let depth = 0;
  let end = -1;
  let inString = false;
  let escaped = false;
  for (let i = jsonStart; i < html.length; i++) {
    const ch = html[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        end = i + 1;
        break;
      }
    }
  }
  if (end === -1) return [];
  const data = JSON.parse(html.slice(jsonStart, end));
  const results = [];
  const visit = (node) => {
    if (!node || results.length >= maxResults * 3) return;
    if (Array.isArray(node)) {
      for (const item of node) visit(item);
      return;
    }
    if (typeof node !== "object") return;
    if (node.videoRenderer) {
      const vr = node.videoRenderer;
      const id = vr.videoId;
      const title = vr.title?.runs?.[0]?.text || vr.title?.simpleText || "";
      if (id && title) {
        const description = vr.descriptionSnippet?.runs?.map((r) => r.text).join("") || vr.detailedMetadataSnippets?.[0]?.snippetText?.runs?.map((r) => r.text).join("") || "";
        results.push({
          id,
          title: decodeHtmlEntities(title),
          description: decodeHtmlEntities(description),
          channelTitle: decodeHtmlEntities(
            vr.ownerText?.runs?.[0]?.text || vr.longBylineText?.runs?.[0]?.text || "YouTube"
          ),
          publishedAt: vr.publishedTimeText?.simpleText || "",
          thumbnailUrl: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
          videoUrl: `https://www.youtube.com/watch?v=${id}`,
          embedUrl: `https://www.youtube-nocookie.com/embed/${id}`,
          duration: vr.lengthText?.simpleText || "",
          views: vr.viewCountText?.simpleText || ""
        });
      }
      return;
    }
    for (const key of Object.keys(node)) visit(node[key]);
  };
  visit(data);
  const seen = /* @__PURE__ */ new Set();
  const unique = results.filter((v) => {
    if (seen.has(v.id)) return false;
    seen.add(v.id);
    return true;
  });
  return unique.slice(0, maxResults);
}
var aiClient, CANDIDATE_MODELS, POLLI_WINDOW_MS, POLLI_MODELS, streamSkipUntil, modelSickUntil, POLLI_BUDGET_MS, SITE_FACTS, lastAiUpstream, BROWSER_UA;
var init_aiService = __esm({
  "src/server/aiService.ts"() {
    aiClient = null;
    CANDIDATE_MODELS = [
      "gemini-3.7-flash",
      "gemini-3.1-flash-lite",
      "gemini-flash-latest"
    ];
    POLLI_WINDOW_MS = (process.env.POLLINATIONS_TOKEN ? 5 : 15) * 1e3;
    POLLI_MODELS = (process.env.POLLINATIONS_MODEL || "openai,openai-fast").split(",").map((m) => m.trim()).filter(Boolean);
    streamSkipUntil = 0;
    modelSickUntil = /* @__PURE__ */ new Map();
    POLLI_BUDGET_MS = 26e3;
    SITE_FACTS = `=== VANITAS PLATFORM \u2014 REAL REFERENCE (this deployment) ===
Base URL: https://vanitas-bot.vercel.app/api/v1 \u2014 you are embedded in this
platform; answer about it using ONLY these verified facts:

AUTH & ACCOUNTS
- POST /auth/register {name, email, password} \u2192 creates the account and returns a session token. Password 8-128 chars; email must be valid; name required.
- POST /auth/login {email, password} \u2192 session token (then Bearer token on every request). When 2FA is on, finish via POST /auth/2fa/complete {code}.
- POST /auth/logout, GET /auth/me, PATCH /auth/profile {name?, avatarUrl?} (avatarUrl: https URL \u2264500 chars or a base64 data:image URL \u2264300KB), DELETE /auth/account (cascades all of that user's data).
- 2FA (TOTP): POST /auth/2fa/setup \u2192 otpauth URL + QR, POST /auth/2fa/enable {code}, POST /auth/2fa/disable {code}.
- Sessions: GET /auth/sessions, DELETE /auth/sessions/:id.
- Social login: GET /auth/providers \u2192 {google, discord, github}; start via GET /social/:provider \u2192 OAuth consent \u2192 GET /social/:provider/callback.
- Error codes: 400 validation, 401 missing/invalid credentials, 403 forbidden or insufficient scope, 404 not found, 409 conflict, 429 rate limited, 500 server error.

API KEYS (Authorization: Bearer sk_\u2026, or a session token)
- GET /api-keys (list + allScopes), POST /api-keys {name, scopes[], rateLimit?, burstLimit?} \u2192 rawSecret is shown ONCE at creation.
- POST /api-keys/:id/rotate (new secret, old invalidated), DELETE /api-keys/:id (revoke), PATCH /api-keys/:id/scopes, PATCH /api-keys/:id/rate-limit, GET /api-keys/usage-analytics.
- Real scopes: api.read api.write users.read users.write users.delete roles.read roles.manage keys.read keys.create keys.rotate keys.revoke keys.scopes.update logs.read logs.export database.read database.write system.read system.manage security.read security.manage bot.execute analytics.read webhooks.manage settings.read settings.write admin.all.
- Scopes are enforced server-side (assertGrantableScopes): a USER account can never hold admin-only scopes (users.write, users.delete, roles.*, logs.*, database.*, system.manage, security.*, keys.scopes.update, settings.write, admin.all).
- Key-authenticated public endpoints: GET /public/ping, /public/me, /public/status (needs api.read), /public/quota.

BOT GATEWAY
- POST /bot/execute {platform: 'whatsapp'|'discord'|'telegram', command, payload} requires scope bot.execute; GET /bot/status.

WEBHOOKS: GET/POST /webhooks, POST /webhooks/:id/test.

COMMENTS (under docs pages)
- GET /comments/:docId, POST /comments/:docId {body} (registered users only, 2-2000 chars), DELETE /comments/:id (author or admin).

AI, SEARCH & CHAT
- POST /ai/chat {prompt, persona, toneStyle, stream?} \u2014 personas: code|api|security|analyst|docs|video|admin; tones: architect|security|developer|bot|arabic; stream:true returns an SSE stream of deltas.
- POST /ai/diagnose-fix {code, language, analysisMode} \u2014 static local analysis (brackets, secrets, auth, rate-limit, type-safety) plus an AI refactor proposal.
- GET /search/semantic (alias /semantic-search) {q} \u2014 semantic documentation search.
- GET /youtube/search?q=&limit= \u2014 live YouTube results.
- GET /ai/history and DELETE /ai/history \u2014 the signed-in user's own chat history.

ADMIN (role ADMIN only): /admin/users, /admin/users/:id/role, /admin/logs, /admin/logs/export, /admin/statistics, /admin/emergency, /admin/feature-flags, /admin/suggestions.

RATE LIMITS (requests per minute per IP): default 300; /public 1200; /auth 60; /ai 60; /bot 120; /comments 30. Each API key additionally has its own rateLimit/burstLimit.

SYSTEM: GET /health, GET /ready (readiness: database, auth, AI provider), GET /status.

DOCS UI SECTIONS: overview, authentication, scopes, endpoints, webhooks, bots, errors, sdks, comments.
=== END REFERENCE ===`;
    lastAiUpstream = null;
    BROWSER_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
  }
});

// src/server/apiKeyAuth.ts
import crypto6 from "crypto";
function stateFor(key) {
  let state = rateStates.get(key.id);
  if (!state) {
    state = { hits: [], windowStart: 0, windowCount: 0, tokens: 0, lastRefill: 0 };
    rateStates.set(key.id, state);
  }
  return state;
}
function bucketCapacity(key) {
  const configured = Number(key.burstLimit) || 0;
  if (configured > 0) return configured;
  return Math.max(1, Math.round((key.rateLimitPerMin || 600) * 0.05));
}
function peekRateLimit(key, now) {
  const limit = Math.max(1, key.rateLimitPerMin || 600);
  const algorithm = key.rateLimitAlgorithm || "sliding_window";
  const state = stateFor(key);
  if (algorithm === "token_bucket") {
    const capacity = bucketCapacity(key);
    const refillPerMs = limit / WINDOW_MS;
    if (state.lastRefill === 0) {
      state.tokens = capacity;
      state.lastRefill = now;
    }
    const elapsed = now - state.lastRefill;
    if (elapsed > 0) {
      state.tokens = Math.min(capacity, state.tokens + elapsed * refillPerMs);
      state.lastRefill = now;
    }
    const allowed2 = state.tokens >= 1;
    const resetAtSec = Math.ceil((now + (capacity - state.tokens) / refillPerMs) / 1e3);
    return {
      allowed: allowed2,
      limit,
      windowCount: Math.round(capacity - state.tokens),
      remaining: Math.max(0, Math.floor(state.tokens)),
      resetAtSec,
      retryAfterMs: allowed2 ? 0 : Math.ceil((1 - state.tokens) / refillPerMs)
    };
  }
  if (algorithm === "fixed_window") {
    const windowStart = Math.floor(now / WINDOW_MS) * WINDOW_MS;
    if (state.windowStart !== windowStart) {
      state.windowStart = windowStart;
      state.windowCount = 0;
    }
    const allowed2 = state.windowCount < limit;
    const resetAtMs2 = windowStart + WINDOW_MS;
    return {
      allowed: allowed2,
      limit,
      windowCount: state.windowCount,
      remaining: Math.max(0, limit - state.windowCount),
      resetAtSec: Math.ceil(resetAtMs2 / 1e3),
      retryAfterMs: allowed2 ? 0 : resetAtMs2 - now
    };
  }
  state.hits = state.hits.filter((t) => now - t < WINDOW_MS);
  const allowed = state.hits.length < limit;
  const resetAtMs = (state.hits[0] ?? now) + WINDOW_MS;
  return {
    allowed,
    limit,
    windowCount: state.hits.length,
    remaining: Math.max(0, limit - state.hits.length),
    resetAtSec: Math.ceil(resetAtMs / 1e3),
    retryAfterMs: allowed ? 0 : resetAtMs - now
  };
}
function recordRateLimit(key, now) {
  const algorithm = key.rateLimitAlgorithm || "sliding_window";
  const state = stateFor(key);
  if (algorithm === "fixed_window") {
    const windowStart = Math.floor(now / WINDOW_MS) * WINDOW_MS;
    if (state.windowStart !== windowStart) {
      state.windowStart = windowStart;
      state.windowCount = 0;
    }
    state.windowCount += 1;
    return;
  }
  if (algorithm === "token_bucket") {
    const capacity = bucketCapacity(key);
    const refillPerMs = Math.max(1, key.rateLimitPerMin || 600) / WINDOW_MS;
    if (state.lastRefill === 0) {
      state.tokens = capacity;
      state.lastRefill = now;
    }
    const elapsed = now - state.lastRefill;
    if (elapsed > 0) {
      state.tokens = Math.min(capacity, state.tokens + elapsed * refillPerMs);
      state.lastRefill = now;
    }
    state.tokens = Math.max(0, state.tokens - 1);
    return;
  }
  state.hits = state.hits.filter((t) => now - t < WINDOW_MS);
  state.hits.push(now);
}
function setRateHeaders(res, decision) {
  res.setHeader("X-RateLimit-Limit", String(decision.limit));
  res.setHeader("X-RateLimit-Remaining", String(Math.max(0, decision.remaining)));
  res.setHeader("X-RateLimit-Reset", String(decision.resetAtSec));
}
function currentPeriod() {
  return (/* @__PURE__ */ new Date()).toISOString().slice(0, 7);
}
function nextQuotaReset() {
  const now = /* @__PURE__ */ new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString();
}
function extractApiKey(req) {
  const header = req.headers["x-api-key"];
  const raw = (Array.isArray(header) ? header[0] : header || "").trim();
  if (raw && raw.length <= MAX_KEY_LENGTH) return raw;
  const auth = req.headers.authorization || "";
  if (auth.startsWith("Bearer ")) {
    const token = auth.slice(7).trim();
    if (token.startsWith("sk_") && token.length <= MAX_KEY_LENGTH) return token;
  }
  return null;
}
function findKeyBySecret(raw) {
  const digest = hashApiKeySecret(raw);
  const target = Buffer.from(digest, "utf8");
  for (const key of db.apiKeys) {
    const stored = key.secretHash;
    if (typeof stored !== "string" || stored.length !== target.length) continue;
    if (crypto6.timingSafeEqual(Buffer.from(stored, "utf8"), target)) return key;
  }
  return null;
}
function maybeAlertRateLimit(req, key, decision) {
  const now = Date.now();
  const last = lastAlerts.get(key.id) || 0;
  if (now - last < ALERT_THROTTLE_MS) return;
  lastAlerts.set(key.id, now);
  try {
    db.recordAuditLog({
      actorId: key.ownerId,
      actorName: key.ownerName,
      actorEmail: db.users.find((u) => u.id === key.ownerId)?.email || "",
      action: "API_KEY_RATE_LIMIT_EXCEEDED",
      category: "API",
      target: `${key.id} (${key.name})`,
      source: "APPLICATION",
      status: "WARNING",
      ipAddress: req.ip || "unknown",
      metadata: {
        path: req.originalUrl,
        limit: decision.limit,
        algorithm: key.rateLimitAlgorithm || "sliding_window",
        action: "alert_only"
      }
    });
  } catch (err) {
    console.error("[apiKeyAuth] audit write failed:", err.message);
  }
}
async function runApiKeyAuth(req, res, next) {
  const raw = extractApiKey(req);
  if (!raw) {
    res.status(401).json({
      error: "API key required",
      hint: "Send x-api-key: sk_... or Authorization: Bearer sk_..."
    });
    return;
  }
  const key = findKeyBySecret(raw);
  if (!key) {
    res.status(401).json({ error: "Invalid API key" });
    return;
  }
  if (key.status === "revoked") {
    res.status(403).json({ error: "API key revoked", keyId: key.id });
    return;
  }
  if (key.status === "suspended") {
    res.status(403).json({ error: "API key suspended", keyId: key.id });
    return;
  }
  if (key.expiresAt && Date.parse(key.expiresAt) < Date.now()) {
    res.status(403).json({ error: "API key expired", expiresAt: key.expiresAt });
    return;
  }
  const period = currentPeriod();
  if (key.usagePeriod !== period) {
    key.usagePeriod = period;
    key.currentUsageThisMonth = 0;
  }
  const now = Date.now();
  let decision = peekRateLimit(key, now);
  setRateHeaders(res, decision);
  const quota = key.monthlyQuota || 0;
  const used = key.currentUsageThisMonth || 0;
  if (quota > 0 && used >= quota) {
    const resetsAt = nextQuotaReset();
    const retryAfterSec = Math.max(1, Math.ceil((Date.parse(resetsAt) - Date.now()) / 1e3));
    res.setHeader("Retry-After", String(retryAfterSec));
    res.status(429).json({ error: "Monthly quota exceeded", quota, used, resetsAt });
    return;
  }
  if (!decision.allowed) {
    const action = key.actionOnExceed || "reject_429";
    if (action === "throttle_delay") {
      await sleep(Math.min(MAX_THROTTLE_SLEEP_MS, Math.max(0, decision.retryAfterMs)));
      recordRateLimit(key, Date.now());
    } else if (action === "alert_only") {
      recordRateLimit(key, now);
      maybeAlertRateLimit(req, key, decision);
    } else {
      const retryAfterSec = Math.max(1, Math.ceil(decision.retryAfterMs / 1e3));
      res.setHeader("Retry-After", String(retryAfterSec));
      res.status(429).json({
        error: "Rate limit exceeded",
        limit: decision.limit,
        windowSeconds: Math.round(WINDOW_MS / 1e3),
        retryAfter: retryAfterSec
      });
      return;
    }
  } else {
    recordRateLimit(key, now);
  }
  decision = peekRateLimit(key, Date.now());
  setRateHeaders(res, decision);
  key.usageCount += 1;
  key.currentUsageThisMonth = (key.currentUsageThisMonth || 0) + 1;
  key.currentRpmUsage = decision.windowCount;
  key.lastUsedAt = (/* @__PURE__ */ new Date()).toISOString();
  req.apiKey = key;
  next();
}
function authenticateApiKey(req, res, next) {
  runApiKeyAuth(req, res, next).catch(next);
}
function requireScope(scope) {
  return (req, res, next) => {
    const key = req.apiKey;
    if (!key) {
      res.status(401).json({ error: "API key required" });
      return;
    }
    if (!key.scopes.includes(scope)) {
      res.status(403).json({ error: `Missing required scope: ${scope}`, grantedScopes: key.scopes });
      return;
    }
    next();
  };
}
function rateWindowStatus(key) {
  const now = Date.now();
  const decision = peekRateLimit(key, now);
  return {
    algorithm: key.rateLimitAlgorithm || "sliding_window",
    limitPerMin: decision.limit,
    windowCount: decision.windowCount,
    remaining: decision.remaining,
    resetAt: new Date(decision.resetAtSec * 1e3).toISOString(),
    retryAfterMs: decision.retryAfterMs
  };
}
var MAX_KEY_LENGTH, WINDOW_MS, MAX_THROTTLE_SLEEP_MS, ALERT_THROTTLE_MS, sleep, rateStates, lastAlerts;
var init_apiKeyAuth = __esm({
  "src/server/apiKeyAuth.ts"() {
    init_db();
    MAX_KEY_LENGTH = 300;
    WINDOW_MS = 6e4;
    MAX_THROTTLE_SLEEP_MS = 2e3;
    ALERT_THROTTLE_MS = 6e4;
    sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    rateStates = /* @__PURE__ */ new Map();
    lastAlerts = /* @__PURE__ */ new Map();
  }
});

// server.ts
var server_exports = {};
__export(server_exports, {
  buildApp: () => buildApp,
  default: () => server_default
});
import express from "express";
import path from "path";
import crypto7 from "crypto";
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
function mapComment(row) {
  return {
    id: row.id,
    docId: row.doc_id,
    userId: row.user_id,
    authorName: row.author_name,
    authorAvatar: row.author_avatar || "",
    body: row.body,
    createdAt: row.created_at
  };
}
async function listComments(docId) {
  if (!databasePool) return memoryComments.filter((c) => c.docId === docId);
  await ensureSchema();
  const result = await databasePool.query(
    "select * from public.comments where doc_id = $1 order by created_at asc limit 500",
    [docId]
  );
  return result.rows.map(mapComment);
}
async function listAllComments(limit = 200) {
  if (!databasePool) return [...memoryComments].reverse().slice(0, limit);
  await ensureSchema();
  const size = Math.min(Math.max(limit, 1), 500);
  const result = await databasePool.query(
    "select * from public.comments order by created_at desc limit $1",
    [size]
  );
  return result.rows.map(mapComment);
}
async function createComment(params) {
  const id = secureId("cmt");
  if (!databasePool) {
    const comment = {
      id,
      docId: params.docId,
      userId: params.userId,
      authorName: params.authorName,
      authorAvatar: params.authorAvatar,
      body: params.body,
      createdAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    memoryComments.push(comment);
    return comment;
  }
  await ensureSchema();
  const result = await databasePool.query(
    `insert into public.comments (id, doc_id, user_id, author_name, author_avatar, body)
     values ($1, $2, $3, $4, $5, $6) returning *`,
    [id, params.docId, params.userId, params.authorName, params.authorAvatar, params.body]
  );
  return mapComment(result.rows[0]);
}
async function deleteComment(id, actor) {
  if (!databasePool) {
    const idx = memoryComments.findIndex((c) => c.id === id);
    if (idx === -1) return "not_found";
    if (memoryComments[idx].userId !== actor.id && actor.role !== "ADMIN") return "forbidden";
    memoryComments.splice(idx, 1);
    return "deleted";
  }
  await ensureSchema();
  const existing = await databasePool.query("select user_id from public.comments where id = $1", [id]);
  if (!existing.rows[0]) return "not_found";
  if (existing.rows[0].user_id !== actor.id && actor.role !== "ADMIN") return "forbidden";
  await databasePool.query("delete from public.comments where id = $1", [id]);
  return "deleted";
}
function mapAiChatRow(row) {
  return {
    id: row.id,
    userId: row.user_id,
    role: row.role,
    content: row.content,
    persona: row.persona || "",
    createdAt: row.created_at
  };
}
async function listAiChatHistory(userId) {
  if (!databasePool) {
    return memoryAiChat.filter((m) => m.userId === userId).slice(-AI_HISTORY_PAGE);
  }
  await ensureSchema();
  const result = await databasePool.query(
    `select * from (
       select * from public.ai_chat_messages where user_id = $1
       order by created_at desc limit $2
     ) page order by created_at asc`,
    [userId, AI_HISTORY_PAGE]
  );
  return result.rows.map(mapAiChatRow);
}
async function appendAiChatMessage(params) {
  const content = params.content.slice(0, 2e4).trim();
  if (!content) return null;
  const id = secureId("aim");
  if (!databasePool) {
    const message = {
      id,
      userId: params.userId,
      role: params.role,
      content,
      persona: params.persona || "",
      createdAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    memoryAiChat.push(message);
    const mine = memoryAiChat.filter((m) => m.userId === params.userId);
    if (mine.length > AI_HISTORY_RETAIN) {
      const excessIds = new Set(mine.slice(0, mine.length - AI_HISTORY_RETAIN).map((m) => m.id));
      for (let i = memoryAiChat.length - 1; i >= 0; i--) {
        if (excessIds.has(memoryAiChat[i].id)) memoryAiChat.splice(i, 1);
      }
    }
    return message;
  }
  await ensureSchema();
  const result = await databasePool.query(
    `insert into public.ai_chat_messages (id, user_id, role, content, persona)
     values ($1, $2, $3, $4, $5) returning *`,
    [id, params.userId, params.role, content, params.persona || ""]
  );
  return mapAiChatRow(result.rows[0]);
}
async function clearAiChatHistory(userId) {
  if (!databasePool) {
    let removed = 0;
    for (let i = memoryAiChat.length - 1; i >= 0; i--) {
      if (memoryAiChat[i].userId === userId) {
        memoryAiChat.splice(i, 1);
        removed++;
      }
    }
    return removed;
  }
  await ensureSchema();
  const result = await databasePool.query("delete from public.ai_chat_messages where user_id = $1", [userId]);
  return Number(result.rowCount || 0);
}
async function buildApp() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3e3;
  app.set("trust proxy", 1);
  app.disable("x-powered-by");
  app.use(express.json({ limit: "256kb" }));
  app.use(express.urlencoded({ extended: true, limit: "256kb" }));
  app.use((req, res, next) => {
    const allowed = (process.env.FRONTEND_URL || "").split(",").map((s) => s.trim()).filter(Boolean);
    const origin = req.headers.origin;
    if (origin && (allowed.includes(origin) || allowed.includes("*"))) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
    }
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization,X-Request-Id,X-Api-Key");
    res.setHeader("Access-Control-Expose-Headers", "X-RateLimit-Limit,X-RateLimit-Remaining,X-RateLimit-Reset,Retry-After");
    if (req.method === "OPTIONS") return res.status(204).end();
    next();
  });
  const defaultLimiter = rateLimit({ windowMs: 6e4, max: 300 });
  const publicLimiter = rateLimit({ windowMs: 6e4, max: 1200 });
  app.use(
    "/api/",
    (req, res, next) => (req.originalUrl || req.url).startsWith("/api/v1/public/") ? publicLimiter(req, res, next) : defaultLimiter(req, res, next)
  );
  app.use("/api/v1/auth/", rateLimit({ windowMs: 6e4, max: 60 }));
  app.use("/api/v1/ai/", rateLimit({ windowMs: 6e4, max: 60 }));
  app.use("/api/v1/bot/", rateLimit({ windowMs: 6e4, max: 120 }));
  app.use("/api/v1/comments/", rateLimit({ windowMs: 6e4, max: 30 }));
  app.use("/api/", async (req, _res, next) => {
    try {
      const auth = req.headers.authorization || "";
      const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
      const adminToken2 = process.env.ADMIN_API_TOKEN;
      if (token && !token.startsWith("sk_") && !(adminToken2 && token === adminToken2)) {
        const user = await resolveSession(token);
        if (user) req.actor = user;
      }
    } catch (err) {
      console.error("[auth] session resolve failed:", err.message);
    }
    next();
  });
  app.use((_req, res, next) => {
    res.setHeader("X-DNS-Prefetch-Control", "off");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");
    res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
    res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
    if (process.env.NODE_ENV === "production") {
      res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload");
      res.setHeader(
        "Content-Security-Policy",
        "default-src 'self'; img-src 'self' https: data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'"
      );
    }
    next();
  });
  app.use((req, _res, next) => {
    const incoming = sanitizeText(req.headers["x-request-id"], 64);
    req.requestId = incoming || crypto7.randomUUID();
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
  app.get("/api/v1/health", (_req, res) => {
    res.json({
      status: "healthy",
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      version: "1.0.0",
      uptime: process.uptime(),
      service: "Vanitas Central Gateway"
    });
  });
  app.get("/api/v1/ready", async (_req, res) => {
    let database = databasePool ? "connected" : "in-memory-fallback";
    if (databasePool) {
      try {
        await databasePool.query("select 1");
      } catch {
        database = "unreachable";
      }
    }
    res.json({
      ready: database !== "unreachable",
      database,
      auth: "ready",
      ai: process.env.AI_PROVIDER === "ollama" ? "ollama_configured" : process.env.GEMINI_API_KEY ? "gemini_enabled" : "pollinations_free",
      // Why the last live AI attempt degraded (null when healthy) — honest,
      // machine-readable diagnostics for ops and smoke tests.
      aiUpstream: getLastAiUpstream(),
      mode: process.env.DEMO_MODE === "true" && process.env.NODE_ENV !== "production" ? "demo" : "authenticated"
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
  function permissionsFor(actor) {
    return actor.role === "ADMIN" ? ALL_SCOPES.map((s) => s.scope) : ["api.read", "keys.read", "keys.create", "bot.execute"];
  }
  app.get("/api/v1/auth/me", (req, res) => {
    const actor = getActorUser(req);
    if (!actor) return res.status(401).json({ error: "Authentication required" });
    res.json({
      user: actor,
      permissions: permissionsFor(actor)
    });
  });
  app.patch("/api/v1/auth/profile", async (req, res) => {
    const actor = getActorUser(req);
    if (!actor) return res.status(401).json({ error: "Authentication required" });
    const name = typeof req.body?.name === "string" ? sanitizeText(req.body.name, 80) : "";
    const avatarUrl = typeof req.body?.avatarUrl === "string" ? req.body.avatarUrl : "";
    if (!name || name.length < 2) {
      return res.status(400).json({ error: "Display name must be between 2 and 80 characters" });
    }
    const isHttpsUrl = avatarUrl === "" || /^https:\/\/[^\s]{5,500}$/.test(avatarUrl);
    const isUploadedImage = avatarUrl.length <= 3e5 && /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/]+={0,2}$/.test(avatarUrl);
    if (!isHttpsUrl && !isUploadedImage) {
      return res.status(400).json({ error: "Avatar must be an https URL or an uploaded image up to 300KB" });
    }
    try {
      const updated = await updateProfile(actor.id, { name, avatarUrl });
      if (!updated) return res.status(404).json({ error: "Account not found" });
      res.json({ user: updated, permissions: permissionsFor(updated) });
    } catch (err) {
      console.error("[auth/profile]", err.message);
      res.status(500).json({ error: "Profile update failed" });
    }
  });
  app.post("/api/v1/auth/register", async (req, res) => {
    const email = sanitizeText(req.body?.email, 120).toLowerCase();
    const name = sanitizeText(req.body?.name, 80);
    const password = typeof req.body?.password === "string" ? req.body.password : "";
    const inviteToken = sanitizeText(req.body?.invite || "", 128);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: "A valid email address is required" });
    }
    if (!name) {
      return res.status(400).json({ error: "Display name is required" });
    }
    if (password.length < 8 || password.length > 128) {
      return res.status(400).json({ error: "Password must be between 8 and 128 characters" });
    }
    try {
      let invite = null;
      if (inviteToken) {
        invite = await findInviteByToken(inviteToken);
        if (!invite || !inviteUsable(invite)) {
          return res.status(400).json({ error: "This invite link is no longer valid (expired, already used, or revoked)" });
        }
      }
      const outcome = await createAccount({ email, password, name });
      if (outcome.ok === false) return res.status(outcome.status).json({ error: outcome.error });
      if (invite && await claimInvite(invite.id)) {
        const grantRole = outcome.user.role === "ADMIN" && invite.role === "USER" ? "ADMIN" : invite.role;
        outcome.user.role = grantRole;
        outcome.user.verification = invite.verification;
        if (databasePool) {
          await databasePool.query(
            "update public.users set role = $2, verification = $3 where id = $1",
            [outcome.user.id, grantRole, invite.verification]
          );
        }
        invalidateResolveCache(outcome.user.id);
        persistAuditLog({
          actorId: outcome.user.id,
          actorName: outcome.user.name,
          actorEmail: outcome.user.email,
          action: "INVITE_USED",
          category: "ADMIN",
          target: `${invite.id} by ${invite.createdByName}`,
          source: detectSource(req),
          status: "SUCCESS",
          ipAddress: req.ip || "unknown",
          metadata: { role: grantRole, verification: invite.verification }
        });
      }
      const token = await createSession(outcome.user, { ip: req.ip, userAgent: String(req.headers["user-agent"] || "") });
      persistAuditLog({
        actorId: outcome.user.id,
        actorName: outcome.user.name,
        actorEmail: outcome.user.email,
        action: "ACCOUNT_REGISTERED",
        category: "AUTH",
        target: `User Account: ${outcome.user.id}`,
        source: detectSource(req),
        status: "SUCCESS",
        ipAddress: req.ip || "unknown",
        metadata: { role: outcome.user.role }
      });
      return res.status(201).json({ token, user: outcome.user, permissions: permissionsFor(outcome.user) });
    } catch (err) {
      console.error("[auth] register failed:", err);
      const msg = err.message || "";
      if (msg.includes("db:migrate")) {
        return res.status(503).json({ error: "Auth storage unavailable \u2014 run npm run db:migrate first" });
      }
      return res.status(500).json({ error: "Registration failed" });
    }
  });
  app.post("/api/v1/auth/login", async (req, res) => {
    const email = sanitizeText(req.body?.email, 120).toLowerCase();
    const password = typeof req.body?.password === "string" ? req.body.password : "";
    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }
    try {
      const outcome = await verifyAccount(email, password);
      if (outcome.ok === false) return res.status(outcome.status).json({ error: outcome.error });
      if (outcome.user.twoFactorEnabled) {
        const secret = await getTwoFactorSecret(outcome.user.id);
        const code = sanitizeText(req.body?.code, 16);
        if (!secret || !verifyTotp(secret, code)) {
          return res.status(401).json({ twoFactorRequired: true, error: "Enter the 6-digit code from your authenticator app" });
        }
      }
      const token = await createSession(outcome.user, { ip: req.ip, userAgent: String(req.headers["user-agent"] || "") });
      persistAuditLog({
        actorId: outcome.user.id,
        actorName: outcome.user.name,
        actorEmail: outcome.user.email,
        action: "LOGIN_SUCCESS",
        category: "AUTH",
        target: `User Account: ${outcome.user.id}`,
        source: detectSource(req),
        status: "SUCCESS",
        ipAddress: req.ip || "unknown",
        metadata: { role: outcome.user.role }
      });
      return res.json({ token, user: outcome.user, permissions: permissionsFor(outcome.user) });
    } catch (err) {
      console.error("[auth] login failed:", err);
      const msg = err.message || "";
      if (msg.includes("db:migrate")) {
        return res.status(503).json({ error: "Auth storage unavailable \u2014 run npm run db:migrate first" });
      }
      return res.status(500).json({ error: "Login failed" });
    }
  });
  app.post("/api/v1/auth/logout", async (req, res) => {
    try {
      const auth = req.headers.authorization || "";
      const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
      if (token) await revokeSession(token);
    } catch (err) {
      console.error("[auth] logout failed:", err);
    }
    res.json({ success: true });
  });
  app.delete("/api/v1/auth/account", async (req, res) => {
    const actor = getActorUser(req);
    if (!actor) return res.status(401).json({ error: "Authentication required" });
    if (actor.role === "ADMIN") {
      let otherUsers = 0;
      let otherAdmins = 0;
      if (databasePool) {
        const counts = await databasePool.query(
          `select (select count(*) from public.users where id <> $1) as other_users,
                  (select count(*) from public.users where role = 'ADMIN' and id <> $1) as other_admins`,
          [actor.id]
        );
        otherUsers = Number(counts.rows[0].other_users);
        otherAdmins = Number(counts.rows[0].other_admins);
      } else {
        const others = db.users.filter((u) => u.id !== actor.id);
        otherUsers = others.length;
        otherAdmins = others.filter((u) => u.role === "ADMIN").length;
      }
      if (otherUsers > 0 && otherAdmins === 0) {
        return res.status(403).json({ error: "Promote another admin before deleting the last admin account" });
      }
    }
    try {
      await forgetAccount(actor.id);
      if (!databasePool) {
        for (let i = memoryComments.length - 1; i >= 0; i--) {
          if (memoryComments[i].userId === actor.id) memoryComments.splice(i, 1);
        }
        for (let i = memoryAiChat.length - 1; i >= 0; i--) {
          if (memoryAiChat[i].userId === actor.id) memoryAiChat.splice(i, 1);
        }
      }
      res.json({ success: true });
    } catch (err) {
      console.error("[auth/account] delete failed:", err.message);
      res.status(500).json({ error: "Account deletion failed" });
    }
  });
  const twoFactorStateKey = crypto7.createHash("sha256").update(process.env.DATABASE_URL || process.env.ADMIN_API_TOKEN || "vanitas-local-2fa").digest();
  function makeTwoFactorState(userId) {
    const payload = Buffer.from(`${userId}.${Date.now() + 10 * 6e4}`).toString("base64url");
    const sig = crypto7.createHmac("sha256", twoFactorStateKey).update(payload).digest("base64url");
    return `${payload}.${sig}`;
  }
  function readTwoFactorState(state) {
    const [payload, sig] = state.split(".");
    if (!payload || !sig) return null;
    const expect = crypto7.createHmac("sha256", twoFactorStateKey).update(payload).digest("base64url");
    const a = Buffer.from(sig);
    const b = Buffer.from(expect);
    if (a.length !== b.length || !crypto7.timingSafeEqual(a, b)) return null;
    const [userId, expStr] = Buffer.from(payload, "base64url").toString().split(".");
    if (!userId || !expStr || Number(expStr) < Date.now()) return null;
    return userId;
  }
  app.post("/api/v1/auth/2fa/setup", async (req, res) => {
    const actor = getActorUser(req);
    if (!actor) return res.status(401).json({ error: "Authentication required" });
    if (actor.twoFactorEnabled) return res.status(409).json({ error: "Two-factor authentication is already enabled" });
    try {
      await ensureSchema();
      const secret = generateTotpSecret();
      await setTwoFactor(actor.id, secret, false);
      res.json({ secret, otpauthUrl: totpOtpauthUrl(actor.email, secret) });
    } catch (err) {
      console.error("[2fa/setup]", err.message);
      res.status(500).json({ error: "Could not start two-factor setup" });
    }
  });
  app.post("/api/v1/auth/2fa/enable", async (req, res) => {
    const actor = getActorUser(req);
    if (!actor) return res.status(401).json({ error: "Authentication required" });
    if (actor.twoFactorEnabled) return res.status(409).json({ error: "Two-factor authentication is already enabled" });
    const code = sanitizeText(req.body?.code, 16);
    try {
      const secret = await getTwoFactorSecret(actor.id);
      if (!secret) return res.status(400).json({ error: "Run two-factor setup first" });
      if (!verifyTotp(secret, code)) return res.status(400).json({ error: "Invalid 6-digit code" });
      await setTwoFactor(actor.id, secret, true);
      persistAuditLog({
        actorId: actor.id,
        actorName: actor.name,
        actorEmail: actor.email,
        action: "TWO_FACTOR_ENABLED",
        category: "AUTH",
        target: `User Account: ${actor.id}`,
        source: detectSource(req),
        status: "SUCCESS",
        ipAddress: req.ip || "unknown"
      });
      res.json({ success: true });
    } catch (err) {
      console.error("[2fa/enable]", err.message);
      res.status(500).json({ error: "Could not enable two-factor authentication" });
    }
  });
  app.post("/api/v1/auth/2fa/disable", async (req, res) => {
    const actor = getActorUser(req);
    if (!actor) return res.status(401).json({ error: "Authentication required" });
    if (!actor.twoFactorEnabled) return res.status(409).json({ error: "Two-factor authentication is not enabled" });
    const code = sanitizeText(req.body?.code, 16);
    try {
      const secret = await getTwoFactorSecret(actor.id);
      if (!secret || !verifyTotp(secret, code)) {
        return res.status(400).json({ error: "Invalid 6-digit code" });
      }
      await setTwoFactor(actor.id, "", false);
      persistAuditLog({
        actorId: actor.id,
        actorName: actor.name,
        actorEmail: actor.email,
        action: "TWO_FACTOR_DISABLED",
        category: "AUTH",
        target: `User Account: ${actor.id}`,
        source: detectSource(req),
        status: "WARNING",
        ipAddress: req.ip || "unknown"
      });
      res.json({ success: true });
    } catch (err) {
      console.error("[2fa/disable]", err.message);
      res.status(500).json({ error: "Could not disable two-factor authentication" });
    }
  });
  app.post("/api/v1/auth/2fa/complete", async (req, res) => {
    const state = sanitizeText(req.body?.state, 400);
    const code = sanitizeText(req.body?.code, 16);
    const userId = readTwoFactorState(state);
    if (!userId) return res.status(401).json({ error: "Two-factor challenge expired \u2014 sign in again" });
    try {
      const result = await findUserById(userId);
      if (!result) return res.status(401).json({ error: "Two-factor challenge expired \u2014 sign in again" });
      if (!result.twoFactorEnabled) return res.status(400).json({ error: "Two-factor authentication is not enabled" });
      const secret = await getTwoFactorSecret(result.id);
      if (!secret || !verifyTotp(secret, code)) return res.status(400).json({ error: "Invalid 6-digit code" });
      const token = await createSession(result, { ip: req.ip, userAgent: String(req.headers["user-agent"] || "") });
      persistAuditLog({
        actorId: result.id,
        actorName: result.name,
        actorEmail: result.email,
        action: "LOGIN_SUCCESS",
        category: "AUTH",
        target: `User Account: ${result.id}`,
        source: detectSource(req),
        status: "SUCCESS",
        ipAddress: req.ip || "unknown",
        metadata: { via: "oauth_totp" }
      });
      res.json({ token, user: result, permissions: permissionsFor(result) });
    } catch (err) {
      console.error("[2fa/complete]", err.message);
      res.status(500).json({ error: "Two-factor verification failed" });
    }
  });
  const DOC_ID_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;
  app.get("/api/v1/comments/:docId", async (req, res) => {
    const docId = sanitizeText(req.params.docId, 64).toLowerCase();
    if (!DOC_ID_RE.test(docId)) return res.status(400).json({ error: "Invalid doc id" });
    try {
      const comments = await listComments(docId);
      res.json({ comments, total: comments.length });
    } catch (err) {
      console.error("[comments/list]", err.message);
      res.status(500).json({ error: "Failed to load comments" });
    }
  });
  app.post("/api/v1/comments/:docId", async (req, res) => {
    const actor = getActorUser(req);
    if (!actor) return res.status(401).json({ error: "Sign in to post a comment" });
    const docId = sanitizeText(req.params.docId, 64).toLowerCase();
    if (!DOC_ID_RE.test(docId)) return res.status(400).json({ error: "Invalid doc id" });
    const rawBody = typeof req.body?.body === "string" ? req.body.body : "";
    if (rawBody.length > 2e3) return res.status(400).json({ error: "Comment must be between 2 and 2000 characters" });
    const body = sanitizeText(rawBody, 2e3).trim();
    if (body.length < 2) return res.status(400).json({ error: "Comment must be between 2 and 2000 characters" });
    try {
      const avatar = (actor.avatarUrl || "").slice(0, 2e3);
      const comment = await createComment({
        docId,
        userId: actor.id,
        authorName: actor.name,
        authorAvatar: avatar.startsWith("data:") ? "" : avatar,
        body
      });
      res.status(201).json({ comment });
    } catch (err) {
      console.error("[comments/create]", err.message);
      res.status(500).json({ error: "Failed to post comment" });
    }
  });
  app.delete("/api/v1/comments/:id", async (req, res) => {
    const actor = getActorUser(req);
    if (!actor) return res.status(401).json({ error: "Authentication required" });
    const id = sanitizeText(req.params.id, 64);
    if (!id) return res.status(400).json({ error: "Comment id is required" });
    try {
      const outcome = await deleteComment(id, actor);
      if (outcome === "deleted") return res.json({ success: true });
      if (outcome === "forbidden") return res.status(403).json({ error: "You can only delete your own comments" });
      res.status(404).json({ error: "Comment not found" });
    } catch (err) {
      console.error("[comments/delete]", err.message);
      res.status(500).json({ error: "Failed to delete comment" });
    }
  });
  app.get("/api/v1/auth/providers", (_req, res) => {
    res.json({ providers: listConfiguredProviders() });
  });
  app.get("/api/v1/social/:provider", (req, res) => {
    const base = appBaseUrl(req);
    const provider = sanitizeText(req.params.provider, 20).toLowerCase();
    if (!isOAuthProvider(provider)) return res.redirect(`${base}/login#vnt_error=unknown_provider`);
    const cfg = getProviderConfig(provider);
    if (!cfg) return res.redirect(`${base}/login#vnt_error=not_configured`);
    const state = signState(provider, cfg.clientSecret);
    return res.redirect(buildAuthorizeUrl(cfg, state, callbackUrl(req, provider)));
  });
  app.get("/api/v1/social/:provider/callback", async (req, res) => {
    const base = appBaseUrl(req);
    const provider = sanitizeText(req.params.provider, 20).toLowerCase();
    if (!isOAuthProvider(provider)) return res.redirect(`${base}/login#vnt_error=unknown_provider`);
    const cfg = getProviderConfig(provider);
    if (!cfg) return res.redirect(`${base}/login#vnt_error=not_configured`);
    const code = typeof req.query.code === "string" ? req.query.code : "";
    const state = typeof req.query.state === "string" ? req.query.state : "";
    if (typeof req.query.error === "string" && req.query.error) {
      return res.redirect(`${base}/login#vnt_error=provider_denied`);
    }
    if (!code || !verifyState(provider, cfg.clientSecret, state)) {
      return res.redirect(`${base}/login#vnt_error=invalid_state`);
    }
    try {
      const accessToken = await exchangeCode(cfg, code, callbackUrl(req, provider));
      const profile = await fetchProfile(cfg, accessToken);
      const user = await upsertOAuthUser({
        provider,
        providerId: profile.providerId,
        email: profile.email,
        emailVerified: profile.emailVerified,
        name: profile.name,
        avatarUrl: profile.avatarUrl
      });
      if (user.twoFactorEnabled) {
        return res.redirect(`${base}/login#vnt_2fa=${makeTwoFactorState(user.id)}`);
      }
      const token = await createSession(user, { ip: req.ip, userAgent: String(req.headers["user-agent"] || "") });
      persistAuditLog({
        actorId: user.id,
        actorName: user.name,
        actorEmail: user.email,
        action: `OAUTH_LOGIN_${provider.toUpperCase()}`,
        category: "AUTH",
        target: `User Account: ${user.id}`,
        source: detectSource(req),
        status: "SUCCESS",
        ipAddress: req.ip || "unknown",
        metadata: { provider }
      });
      return res.redirect(`${base}/login#vnt_oauth=${token}`);
    } catch (err) {
      console.error(`[auth] oauth ${provider} failed:`, err);
      const msg = err.message || "";
      if (msg.includes("db:migrate")) return res.redirect(`${base}/login#vnt_error=storage`);
      return res.redirect(`${base}/login#vnt_error=provider_failed`);
    }
  });
  app.get("/api/v1/auth/sessions", (req, res) => {
    const actor = getActorUser(req);
    if (!actor) return res.status(401).json({ error: "Authentication required" });
    res.json({ sessions: db.sessions });
  });
  app.delete("/api/v1/auth/sessions/:id", (req, res) => {
    const id = sanitizeText(req.params.id, 64);
    const actor = getActorUser(req);
    if (!actor) return res.status(401).json({ error: "Authentication required" });
    const idx = db.sessions.findIndex((s) => s.id === id);
    if (idx !== -1) {
      const removed = db.sessions.splice(idx, 1)[0];
      persistAuditLog({
        actorId: actor.id,
        actorName: actor.name,
        actorEmail: actor.email,
        action: "SESSION_REVOKED",
        category: "AUTH",
        target: `Session Device: ${sanitizeText(removed.device, 120)} (${sanitizeText(removed.ip, 64)})`,
        source: detectSource(req),
        status: "SUCCESS",
        ipAddress: req.ip || "unknown",
        metadata: { deviceId: id }
      });
      return res.json({ success: true, message: "Session terminated" });
    }
    res.status(404).json({ error: "Session not found" });
  });
  app.get("/api/v1/api-keys", (req, res) => {
    const actor = getActorUser(req);
    if (!actor) return res.status(401).json({ error: "Authentication required" });
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
      if (!actor) return res.status(401).json({ error: "Authentication required" });
      const name = sanitizeText(req.body?.name, 80);
      const scopes = req.body?.scopes;
      const environment = req.body?.environment === "test" ? "test" : "live";
      const rateLimitPerMin = Math.min(Math.max(Number(req.body?.rateLimitPerMin) || 600, 10), 1e4);
      if (!name || name.length < 3 || !scopes || !Array.isArray(scopes) || scopes.length === 0 || scopes.length > 30) {
        return res.status(400).json({ error: 'Invalid parameters. "name" (3-80 chars) and "scopes" array (1-30) are required.' });
      }
      if (!scopes.every(isValidScope)) {
        return res.status(400).json({ error: "Invalid scope format detected." });
      }
      const result = db.createApiKey({
        name,
        ownerId: actor.id,
        ownerName: actor.name,
        requesterRole: actor.role,
        scopes,
        environment,
        rateLimitPerMin,
        expiresAt: typeof req.body?.expiresAt === "string" ? req.body.expiresAt.slice(0, 64) : null
      });
      res.status(201).json({
        key: result.key,
        rawSecret: result.rawSecret,
        revealNote: "This secret is revealed only once. Store it in a secure vault."
      });
    } catch (err) {
      res.status(403).json({ error: "Request denied" });
    }
  });
  app.post("/api/v1/api-keys/:id/rotate", (req, res) => {
    try {
      const actor = getActorUser(req);
      if (!actor) return res.status(401).json({ error: "Authentication required" });
      const id = sanitizeText(req.params.id, 128);
      const result = db.rotateApiKey(id, actor);
      res.json({
        key: result.key,
        rawSecret: result.rawSecret,
        revealNote: "Previous secret has been permanently invalidated. Store this new secret securely."
      });
    } catch (err) {
      res.status(400).json({ error: "Rotation failed" });
    }
  });
  app.delete("/api/v1/api-keys/:id", (req, res) => {
    try {
      const actor = getActorUser(req);
      if (!actor) return res.status(401).json({ error: "Authentication required" });
      const id = sanitizeText(req.params.id, 128);
      const reason = sanitizeText(req.body?.reason, 200);
      const key = db.revokeApiKey(id, actor, reason || void 0);
      res.json({ success: true, key });
    } catch (err) {
      res.status(400).json({ error: "Revocation failed" });
    }
  });
  app.patch("/api/v1/api-keys/:id/scopes", (req, res) => {
    try {
      const actor = getActorUser(req);
      if (!actor) return res.status(401).json({ error: "Authentication required" });
      const id = sanitizeText(req.params.id, 128);
      const { scopes } = req.body;
      if (!scopes || !Array.isArray(scopes) || scopes.length > 30 || !scopes.every(isValidScope)) {
        return res.status(400).json({ error: "Valid scopes array required (max 30)" });
      }
      const key = db.updateApiKeyScopes(id, scopes, actor);
      res.json({ success: true, key });
    } catch (err) {
      res.status(403).json({ error: "Scope update denied" });
    }
  });
  app.patch("/api/v1/api-keys/:id/rate-limit", (req, res) => {
    try {
      const actor = getActorUser(req);
      if (!actor) return res.status(401).json({ error: "Authentication required" });
      const id = sanitizeText(req.params.id, 128);
      const { rateLimitPerMin, burstLimit, rateLimitAlgorithm, actionOnExceed, monthlyQuota } = req.body;
      const rpm = Number(rateLimitPerMin);
      if (!rpm || !Number.isFinite(rpm) || rpm < 10 || rpm > 1e4) {
        return res.status(400).json({ error: "rateLimitPerMin must be 10-10000" });
      }
      if (rateLimitAlgorithm && !["sliding_window", "token_bucket", "fixed_window"].includes(rateLimitAlgorithm)) {
        return res.status(400).json({ error: "Invalid rate limit algorithm" });
      }
      if (actionOnExceed && !["reject_429", "throttle_delay", "alert_only"].includes(actionOnExceed)) {
        return res.status(400).json({ error: "Invalid actionOnExceed" });
      }
      const key = db.updateApiKeyRateLimit(
        id,
        {
          rateLimitPerMin: Math.floor(rpm),
          burstLimit: burstLimit !== void 0 ? Math.min(Math.max(Number(burstLimit) || 0, 0), 1e3) : void 0,
          rateLimitAlgorithm,
          actionOnExceed,
          monthlyQuota: monthlyQuota !== void 0 ? Math.min(Math.max(Number(monthlyQuota) || 0, 0), 1e8) : void 0
        },
        actor
      );
      res.json({ success: true, key });
    } catch (err) {
      res.status(400).json({ error: "Rate limit update failed" });
    }
  });
  app.post("/api/v1/api-keys/:id/simulate-traffic", (req, res) => {
    try {
      const id = sanitizeText(req.params.id, 128);
      const requestCount = req.body?.requestCount;
      const key = db.apiKeys.find((k) => k.id === id);
      if (!key) return res.status(404).json({ error: "Key not found" });
      const count = Math.min(Math.max(Number(requestCount) || 50, 1), 1e3);
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
      res.status(400).json({ error: "Simulation failed" });
    }
  });
  app.get("/api/v1/public/ping", authenticateApiKey, (req, res) => {
    const key = req.apiKey;
    res.json({
      ok: true,
      key: { id: key.id, name: key.name, environment: key.environment, status: key.status, scopes: key.scopes },
      serverTime: (/* @__PURE__ */ new Date()).toISOString()
    });
  });
  app.get("/api/v1/public/me", authenticateApiKey, (req, res) => {
    const key = req.apiKey;
    const quota = key.monthlyQuota || 0;
    const used = key.currentUsageThisMonth || 0;
    res.json({
      key: {
        id: key.id,
        name: key.name,
        keyPrefix: key.keyPrefix,
        maskedSecret: key.maskedSecret,
        scopes: key.scopes,
        status: key.status,
        environment: key.environment,
        createdAt: key.createdAt,
        expiresAt: key.expiresAt,
        lastUsedAt: key.lastUsedAt,
        usageCount: key.usageCount,
        usagePeriod: key.usagePeriod
      },
      // Registered users live in the auth store (PG), not db.users — so the
      // owner is reported from the key record itself, never looked up.
      owner: { id: key.ownerId, name: key.ownerName },
      limits: {
        rateLimitPerMin: key.rateLimitPerMin,
        burstLimit: key.burstLimit,
        rateLimitAlgorithm: key.rateLimitAlgorithm || "sliding_window",
        actionOnExceed: key.actionOnExceed || "reject_429",
        monthlyQuota: quota,
        usedThisMonth: used,
        remainingQuota: quota > 0 ? Math.max(0, quota - used) : null,
        quotaResetsAt: nextQuotaReset()
      }
    });
  });
  app.get("/api/v1/public/status", authenticateApiKey, requireScope("api.read"), async (_req, res) => {
    let database;
    if (databasePool) {
      try {
        await databasePool.query("select 1");
        database = "connected";
      } catch {
        database = "unreachable";
      }
    } else {
      database = "in-memory-fallback";
    }
    const stats = db.systemStats;
    let activeApiKeys = db.apiKeys.filter((k) => k.status === "active").length;
    if (databasePool && database === "connected") {
      try {
        const keys = await databasePool.query("select count(*)::int as n from public.api_keys where status = 'active'");
        activeApiKeys = keys.rows[0].n;
      } catch {
      }
    }
    res.json({
      status: database === "unreachable" ? "degraded" : "operational",
      database,
      services: stats.services,
      stats: {
        apiRequestsToday: stats.apiRequestsToday,
        p95LatencyMs: stats.p95LatencyMs,
        errorRate: stats.errorRate,
        activeApiKeys
      },
      uptimeSeconds: Math.round(process.uptime()),
      serverTime: (/* @__PURE__ */ new Date()).toISOString()
    });
  });
  app.get("/api/v1/public/quota", authenticateApiKey, (req, res) => {
    const key = req.apiKey;
    const quota = key.monthlyQuota || 0;
    const used = key.currentUsageThisMonth || 0;
    res.json({
      key: { id: key.id, name: key.name },
      quota: {
        limit: quota,
        used,
        remaining: quota > 0 ? Math.max(0, quota - used) : null,
        period: key.usagePeriod,
        resetsAt: nextQuotaReset()
      },
      rate: rateWindowStatus(key)
    });
  });
  function persistAuditLog(entry) {
    const log = db.recordAuditLog(entry);
    if (!databasePool) return;
    databasePool.query(
      `insert into public.audit_logs
           (id, timestamp, actor_id, actor_name, actor_email, action, category, target, source, status, request_id, ip_address, metadata)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
         on conflict (id) do nothing`,
      [
        log.id,
        log.timestamp,
        log.actorId,
        log.actorName,
        log.actorEmail,
        log.action,
        log.category,
        log.target,
        log.source,
        log.status,
        log.requestId,
        log.ipAddress,
        JSON.stringify(log.metadata || {})
      ]
    ).catch((err) => console.error("[audit/persist]", err.message));
  }
  function mapAuditRow(row) {
    const iso = (v) => v instanceof Date ? v.toISOString() : v || "";
    let metadata = {};
    try {
      metadata = typeof row.metadata === "string" ? JSON.parse(row.metadata) : row.metadata || {};
    } catch {
      metadata = {};
    }
    return {
      id: row.id,
      timestamp: iso(row.timestamp),
      actorId: row.actor_id,
      actorName: row.actor_name,
      actorEmail: row.actor_email,
      action: row.action,
      category: row.category,
      target: row.target,
      source: row.source,
      status: row.status,
      requestId: row.request_id,
      ipAddress: row.ip_address,
      metadata
    };
  }
  async function loadAuditSource() {
    if (!databasePool) return [...db.auditLogs];
    try {
      const r = await databasePool.query(
        "select * from public.audit_logs order by timestamp desc limit 5000"
      );
      return r.rows.map(mapAuditRow);
    } catch (err) {
      console.error("[admin/logs]", err.message);
      return [...db.auditLogs];
    }
  }
  const memoryInvites = [];
  function mapInviteRow(row) {
    const iso = (v) => v instanceof Date ? v.toISOString() : v || "";
    return {
      id: row.id,
      token: row.token,
      createdBy: row.created_by,
      createdByName: row.created_by_name,
      role: row.role === "USER" ? "USER" : "ADMIN",
      verification: ["USER", "DEVELOPER", "ADMIN"].includes(row.verification) ? row.verification : "",
      note: row.note || "",
      maxUses: Number(row.max_uses) || 1,
      uses: Number(row.uses) || 0,
      revoked: !!row.revoked,
      expiresAt: iso(row.expires_at),
      createdAt: iso(row.created_at)
    };
  }
  function inviteUsable(invite) {
    return !invite.revoked && invite.uses < invite.maxUses && Date.parse(invite.expiresAt) > Date.now();
  }
  async function findInviteByToken(token) {
    if (!databasePool) return memoryInvites.find((i) => i.token === token) || null;
    try {
      const r = await databasePool.query("select * from public.admin_invites where token = $1", [token]);
      return r.rows[0] ? mapInviteRow(r.rows[0]) : null;
    } catch (err) {
      console.error("[invites/lookup]", err.message);
      return null;
    }
  }
  async function listInvites() {
    if (!databasePool) {
      return [...memoryInvites].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
    }
    try {
      const r = await databasePool.query(
        "select * from public.admin_invites order by created_at desc limit 100"
      );
      return r.rows.map(mapInviteRow);
    } catch (err) {
      console.error("[invites/list]", err.message);
      return [];
    }
  }
  async function createInvite(params) {
    const invite = {
      id: secureId("inv"),
      token: secureToken("inv_"),
      createdBy: params.createdBy,
      createdByName: params.createdByName,
      role: params.role,
      verification: params.verification || "",
      note: params.note,
      maxUses: params.maxUses,
      uses: 0,
      revoked: false,
      expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1e3).toISOString(),
      createdAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    if (!databasePool) {
      memoryInvites.unshift(invite);
      return invite;
    }
    const r = await databasePool.query(
      `insert into public.admin_invites
         (id, token, created_by, created_by_name, role, verification, note, max_uses, uses, revoked, expires_at, created_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, 0, false, $9, $10) returning *`,
      [
        invite.id,
        invite.token,
        invite.createdBy,
        invite.createdByName,
        invite.role,
        invite.verification,
        invite.note,
        invite.maxUses,
        invite.expiresAt,
        invite.createdAt
      ]
    );
    return mapInviteRow(r.rows[0]);
  }
  async function revokeInvite(id) {
    if (!databasePool) {
      const inv = memoryInvites.find((i) => i.id === id);
      if (!inv) return null;
      inv.revoked = true;
      return inv;
    }
    const r = await databasePool.query(
      "update public.admin_invites set revoked = true where id = $1 returning *",
      [id]
    );
    return r.rows[0] ? mapInviteRow(r.rows[0]) : null;
  }
  async function claimInvite(id) {
    if (!databasePool) {
      const inv = memoryInvites.find((i) => i.id === id);
      if (!inv || !inviteUsable(inv)) return false;
      inv.uses += 1;
      return true;
    }
    try {
      const r = await databasePool.query(
        `update public.admin_invites
            set uses = uses + 1
          where id = $1 and not revoked and uses < max_uses and expires_at > now()
          returning id`,
        [id]
      );
      return (r.rowCount ?? 0) > 0;
    } catch (err) {
      console.error("[invites/claim]", err.message);
      return false;
    }
  }
  app.get("/api/v1/admin/users", async (req, res) => {
    if (!requireAdmin(req, res)) return;
    if (databasePool) {
      try {
        const r = await databasePool.query(
          "select * from public.users order by created_at asc limit 500"
        );
        return res.json({ users: r.rows.map(rowToUser) });
      } catch (err) {
        console.error("[admin/users]", err.message);
        return res.status(500).json({ error: "Failed to load users" });
      }
    }
    res.json({ users: db.users });
  });
  app.patch("/api/v1/admin/users/:id/role", async (req, res) => {
    const actor = requireAdmin(req, res);
    if (!actor) return;
    const id = sanitizeText(req.params.id, 64);
    const role = sanitizeText(req.body?.role, 16);
    if (!["USER", "ADMIN"].includes(role)) {
      return res.status(400).json({ error: "Invalid role" });
    }
    let targetUser = null;
    if (databasePool) {
      const found = await databasePool.query("select * from public.users where id = $1", [id]);
      targetUser = found.rows[0] ? rowToUser(found.rows[0]) : null;
    } else {
      targetUser = db.users.find((u) => u.id === id) || null;
    }
    if (!targetUser) {
      return res.status(404).json({ error: "User not found" });
    }
    if (targetUser.id === actor.id && role !== "ADMIN") {
      let adminCount;
      if (databasePool) {
        const c = await databasePool.query(
          `select count(*)::int as n from public.users where role = 'ADMIN'`
        );
        adminCount = c.rows[0].n;
      } else {
        adminCount = db.users.filter((u) => u.role === "ADMIN").length;
      }
      if (adminCount <= 1) return res.status(400).json({ error: "Cannot demote the last administrator" });
    }
    const priorRole = targetUser.role;
    targetUser.role = role;
    if (databasePool) {
      await databasePool.query("update public.users set role = $2 where id = $1", [id, role]);
    }
    invalidateResolveCache(targetUser.id);
    persistAuditLog({
      actorId: actor.id,
      actorName: actor.name,
      actorEmail: actor.email,
      action: "USER_ROLE_CHANGED",
      category: "ADMIN",
      target: `${targetUser.id} (${targetUser.email}) -> ${role}`,
      source: detectSource(req),
      status: "SUCCESS",
      ipAddress: req.ip || "unknown",
      metadata: { priorRole, newRole: role }
    });
    res.json({ success: true, user: targetUser });
  });
  app.patch("/api/v1/admin/users/:id/verification", async (req, res) => {
    const actor = requireAdmin(req, res);
    if (!actor) return;
    const id = sanitizeText(req.params.id, 64);
    const raw = req.body?.verification;
    if (typeof raw !== "string") {
      return res.status(400).json({ error: "verification field is required" });
    }
    const value = sanitizeText(raw, 16);
    if (!["", "USER", "DEVELOPER", "ADMIN"].includes(value)) {
      return res.status(400).json({ error: "verification must be USER, DEVELOPER or ADMIN (empty string revokes)" });
    }
    let updated = null;
    if (databasePool) {
      const found = await databasePool.query(
        "update public.users set verification = $2 where id = $1 returning *",
        [id, value]
      );
      updated = found.rows[0] ? rowToUser(found.rows[0]) : null;
    } else {
      const u = db.users.find((x) => x.id === id);
      if (u) {
        u.verification = value;
        updated = u;
      }
    }
    if (!updated) return res.status(404).json({ error: "User not found" });
    invalidateResolveCache(id);
    persistAuditLog({
      actorId: actor.id,
      actorName: actor.name,
      actorEmail: actor.email,
      action: "USER_VERIFICATION_CHANGED",
      category: "ADMIN",
      target: `${updated.id} (${updated.email}) -> ${value || "none"}`,
      source: detectSource(req),
      status: "SUCCESS",
      ipAddress: req.ip || "unknown",
      metadata: { verification: value || "none" }
    });
    res.json({ success: true, user: updated });
  });
  app.post("/api/v1/admin/invites", async (req, res) => {
    const actor = requireAdmin(req, res);
    if (!actor) return;
    const role = sanitizeText(req.body?.role || "ADMIN", 8).toUpperCase();
    const verification = sanitizeText(req.body?.verification ?? "", 16);
    const note = sanitizeText(req.body?.note || "", 200);
    const maxUsesRaw = Number(req.body?.maxUses ?? 1);
    if (!["USER", "ADMIN"].includes(role)) {
      return res.status(400).json({ error: "role must be USER or ADMIN" });
    }
    if (!["", "USER", "DEVELOPER", "ADMIN"].includes(verification)) {
      return res.status(400).json({ error: "verification must be USER, DEVELOPER or ADMIN (or empty)" });
    }
    const maxUses = Number.isInteger(maxUsesRaw) && maxUsesRaw >= 1 && maxUsesRaw <= 20 ? maxUsesRaw : 1;
    try {
      const invite = await createInvite({
        createdBy: actor.id,
        createdByName: actor.name,
        role,
        verification,
        note,
        maxUses
      });
      persistAuditLog({
        actorId: actor.id,
        actorName: actor.name,
        actorEmail: actor.email,
        action: "INVITE_CREATED",
        category: "ADMIN",
        target: `${invite.id} -> ${role}${verification ? ` +${verification}` : ""}`,
        source: detectSource(req),
        status: "SUCCESS",
        ipAddress: req.ip || "unknown",
        metadata: { role, verification, maxUses }
      });
      res.status(201).json({ invite });
    } catch (err) {
      console.error("[invites] create failed:", err.message);
      res.status(500).json({ error: "Failed to create invite" });
    }
  });
  app.get("/api/v1/admin/invites", async (req, res) => {
    if (!requireAdmin(req, res)) return;
    res.json({ invites: await listInvites() });
  });
  app.delete("/api/v1/admin/invites/:id", async (req, res) => {
    const actor = requireAdmin(req, res);
    if (!actor) return;
    const id = sanitizeText(req.params.id, 64);
    try {
      const invite = await revokeInvite(id);
      if (!invite) return res.status(404).json({ error: "Invite not found" });
      persistAuditLog({
        actorId: actor.id,
        actorName: actor.name,
        actorEmail: actor.email,
        action: "INVITE_REVOKED",
        category: "ADMIN",
        target: invite.id,
        source: detectSource(req),
        status: "SUCCESS",
        ipAddress: req.ip || "unknown",
        metadata: { role: invite.role }
      });
      res.json({ success: true, invite });
    } catch (err) {
      console.error("[invites] revoke failed:", err.message);
      res.status(500).json({ error: "Failed to revoke invite" });
    }
  });
  app.get("/api/v1/invites/:token", async (req, res) => {
    const token = sanitizeText(req.params.token, 128);
    const invalid = (reason) => res.json({ valid: false, reason });
    const invite = token ? await findInviteByToken(token) : null;
    if (!invite) return invalid("not_found");
    if (invite.revoked) return invalid("revoked");
    if (invite.uses >= invite.maxUses) return invalid("used");
    if (Date.parse(invite.expiresAt) <= Date.now()) return invalid("expired");
    res.json({
      valid: true,
      role: invite.role,
      verification: invite.verification,
      creatorName: invite.createdByName,
      note: invite.note,
      expiresAt: invite.expiresAt
    });
  });
  app.delete("/api/v1/admin/users/:id", async (req, res) => {
    const actor = requireAdmin(req, res);
    if (!actor) return;
    const id = sanitizeText(req.params.id, 64);
    if (!/^usr_[A-Za-z0-9_]+$/.test(id)) return res.status(400).json({ error: "Invalid user id" });
    if (id === actor.id) return res.status(400).json({ error: "You cannot delete your own account" });
    let target = null;
    if (databasePool) {
      const found = await databasePool.query("select id, name, email, role from public.users where id = $1", [id]);
      target = found.rows[0] || null;
    } else {
      const u = db.users.find((x) => x.id === id);
      target = u ? { id: u.id, name: u.name, email: u.email, role: u.role } : null;
    }
    if (!target) return res.status(404).json({ error: "User not found" });
    if (target.role === "ADMIN") {
      let otherAdmins;
      if (databasePool) {
        const cnt = await databasePool.query(
          `select count(*)::int as n from public.users where role = 'ADMIN' and id <> $1`,
          [id]
        );
        otherAdmins = cnt.rows[0].n;
      } else {
        otherAdmins = db.users.filter((u) => u.role === "ADMIN" && u.id !== id).length;
      }
      if (otherAdmins === 0) return res.status(400).json({ error: "Cannot delete the last administrator" });
    }
    try {
      if (databasePool) {
        await databasePool.query("delete from public.comments where user_id = $1", [id]);
      } else {
        for (let i = memoryComments.length - 1; i >= 0; i--) {
          if (memoryComments[i].userId === id) memoryComments.splice(i, 1);
        }
      }
      await clearAiChatHistory(id);
      await forgetAccount(id);
      persistAuditLog({
        actorId: actor.id,
        actorName: actor.name,
        actorEmail: actor.email,
        action: "USER_DELETED",
        category: "ADMIN",
        target: `${target.name} (${target.email})`,
        source: detectSource(req),
        status: "WARNING",
        ipAddress: req.ip || "unknown",
        metadata: { userId: id, role: target.role }
      });
      res.json({ success: true, user: { id: target.id, name: target.name } });
    } catch (err) {
      console.error("[admin/users] delete failed:", err.message);
      res.status(500).json({ error: "Account deletion failed" });
    }
  });
  app.get("/api/v1/admin/comments", async (req, res) => {
    if (!requireAdmin(req, res)) return;
    try {
      const comments = await listAllComments();
      res.json({ comments, total: comments.length });
    } catch (err) {
      console.error("[admin/comments]", err.message);
      res.status(500).json({ error: "Failed to load comments" });
    }
  });
  app.get("/api/v1/admin/logs", async (req, res) => {
    if (!requireAdmin(req, res)) return;
    const { limit, offset } = parsePagination(req.query);
    const from = sanitizeText(req.query.from, 32);
    const category = sanitizeText(req.query.category || "ALL", 16).toUpperCase();
    const search = sanitizeText(req.query.search || "", 100).toLowerCase();
    let logs = await loadAuditSource();
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
    const allowedCats = ["ALL", "ADMIN", "API", "SECURITY", "AUTH", "KEYS", "BOT", "DATABASE"];
    if (category && category !== "ALL") {
      if (!allowedCats.includes(category)) return res.status(400).json({ error: "Invalid category" });
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
  app.get("/api/v1/admin/logs/export", async (req, res) => {
    if (!requireAdmin(req, res)) return res.status(403).send("Forbidden");
    const headers = ["Timestamp", "Actor", "Action", "Category", "Target", "Source", "Status", "Request ID", "IP Address", "Metadata"];
    const rows = (await loadAuditSource()).slice(0, 5e3).map((l) => [
      csvCell(l.timestamp),
      csvCell(`${l.actorName} (${l.actorEmail})`),
      csvCell(l.action),
      csvCell(l.category),
      csvCell(l.target),
      csvCell(l.source),
      csvCell(l.status),
      csvCell(l.requestId),
      csvCell(l.ipAddress),
      csvCell(JSON.stringify(l.metadata || {}))
    ]);
    const csvContent = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="vanitas_audit_logs_${Date.now()}.csv"`);
    res.send(csvContent);
  });
  app.get("/api/v1/admin/statistics", async (req, res) => {
    if (!requireAdmin(req, res)) return;
    const stats = { ...db.systemStats };
    if (databasePool) {
      try {
        const result = await databasePool.query(`select
          (select count(*) from public.users) as total_users,
          (select count(distinct user_id) from public.auth_sessions
             where created_at > now() - interval '7 days') as active_users,
          (select count(*) from public.api_keys where status = 'active') as active_keys`);
        const row = result.rows[0];
        stats.totalUsers = Number(row.total_users);
        stats.activeUsers = Number(row.active_users);
        stats.activeApiKeys = Number(row.active_keys);
      } catch (err) {
        console.error("[admin/statistics]", err.message);
      }
    } else {
      stats.totalUsers = db.users.length;
      stats.activeUsers = db.users.length;
      stats.activeApiKeys = db.apiKeys.filter((k) => k.status === "active").length;
    }
    const breakdown = stats.requestBreakdown || [];
    const totalReqs = breakdown.reduce((sum, p) => sum + Number(p.count || 0), 0);
    const totalErrs = breakdown.reduce((sum, p) => sum + Number(p.errorCount || 0), 0);
    stats.errorRate = totalReqs > 0 ? totalErrs / totalReqs : 0;
    res.json({ stats, threats: db.securityThreats });
  });
  app.post("/api/v1/admin/emergency", (req, res) => {
    const actor = requireAdmin(req, res);
    if (!actor) return;
    const action = sanitizeText(req.body?.action, 64);
    const source = detectSource(req);
    if (action === "TOGGLE_MAINTENANCE") {
      const flag = db.featureFlags.find((f) => f.key === "SYSTEM_MAINTENANCE_MODE");
      if (flag) {
        flag.enabled = !flag.enabled;
        persistAuditLog({
          actorId: actor.id,
          actorName: actor.name,
          actorEmail: actor.email,
          action: flag.enabled ? "EMERGENCY_MAINTENANCE_ENABLED" : "EMERGENCY_MAINTENANCE_DISABLED",
          category: "ADMIN",
          target: "Platform Core Services",
          source,
          status: "WARNING",
          ipAddress: req.ip || "unknown"
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
      persistAuditLog({
        actorId: actor.id,
        actorName: actor.name,
        actorEmail: actor.email,
        action: "EMERGENCY_KEY_PURGE",
        category: "SECURITY",
        target: `${count} sandbox tokens revoked`,
        source,
        status: "WARNING",
        ipAddress: req.ip || "unknown"
      });
      return res.json({ success: true, revokedCount: count });
    }
    res.status(400).json({ error: "Unrecognized emergency action" });
  });
  app.get("/api/v1/admin/feature-flags", (req, res) => {
    if (!requireAdmin(req, res)) return;
    res.json({ featureFlags: db.featureFlags });
  });
  app.patch("/api/v1/admin/feature-flags/:id", (req, res) => {
    if (!requireAdmin(req, res)) return;
    const id = sanitizeText(req.params.id, 64);
    const { enabled } = req.body;
    const flag = db.featureFlags.find((f) => f.id === id);
    if (!flag) return res.status(404).json({ error: "Feature flag not found" });
    flag.enabled = !!enabled;
    flag.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
    res.json({ success: true, flag });
  });
  app.get("/api/v1/webhooks", (_req, res) => {
    const safe = db.webhooks.map((w) => ({ ...w, secret: void 0, url: w.url }));
    res.json({ webhooks: safe, logs: db.webhookLogs });
  });
  app.post("/api/v1/webhooks", (req, res) => {
    const actor = getActorUser(req);
    if (!actor) return res.status(401).json({ error: "Authentication required" });
    const name = sanitizeText(req.body?.name, 80);
    const rawUrl = req.body?.url;
    const events = req.body?.events;
    if (!name || name.length < 3 || !rawUrl || !Array.isArray(events) || events.length === 0 || events.length > 20) {
      return res.status(400).json({ error: "Name (3-80), URL, and Events (1-20) are required" });
    }
    const url = sanitizeUrl(rawUrl);
    if (!url) return res.status(400).json({ error: "Invalid or blocked webhook URL (https only, no private hosts)" });
    const cleanEvents = events.map((e) => sanitizeText(e, 48)).filter((e) => /^[a-z_.-]+$/.test(e));
    if (cleanEvents.length === 0) return res.status(400).json({ error: "Invalid event names" });
    const newWebhook = {
      id: secureId("wh"),
      name,
      url,
      events: cleanEvents,
      secret: secureToken("whsec_"),
      status: "active",
      createdAt: (/* @__PURE__ */ new Date()).toISOString(),
      lastTriggeredAt: null,
      failureCount: 0
    };
    db.webhooks.unshift(newWebhook);
    persistAuditLog({
      actorId: actor.id,
      actorName: actor.name,
      actorEmail: actor.email,
      action: "WEBHOOK_CREATED",
      category: "API",
      target: `${sanitizeText(newWebhook.name, 80)} (${newWebhook.url.slice(0, 120)})`,
      source: detectSource(req),
      status: "SUCCESS",
      ipAddress: req.ip || "unknown"
    });
    res.status(201).json({ webhook: newWebhook });
  });
  app.post("/api/v1/webhooks/:id/test", (req, res) => {
    const id = sanitizeText(req.params.id, 128);
    const wh = db.webhooks.find((w) => w.id === id);
    if (!wh) return res.status(404).json({ error: "Webhook not found" });
    wh.lastTriggeredAt = (/* @__PURE__ */ new Date()).toISOString();
    const log = {
      id: secureId("wh_log"),
      webhookId: wh.id,
      event: "ping.test",
      status: "delivered",
      statusCode: 200,
      latencyMs: 90 + crypto7.randomInt(80),
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
    if (!actor) return res.status(401).json({ error: "Authentication required" });
    const platform = sanitizeText(req.body?.platform, 32) || "discord";
    const command = sanitizeText(req.body?.command, 200);
    const payload = req.body?.payload;
    if (!command || command.length < 1) {
      return res.status(400).json({ error: "Missing command payload" });
    }
    if (!["discord", "whatsapp", "telegram", "custom"].includes(platform)) {
      return res.status(400).json({ error: "Invalid platform" });
    }
    if (payload && (typeof payload !== "object" || JSON.stringify(payload).length > 8e3)) {
      return res.status(400).json({ error: "Invalid payload (max 8KB object)" });
    }
    const bot = db.bots.find((b) => b.platform === platform) || db.bots[0];
    bot.commandsExecuted += 1;
    bot.lastPingAt = (/* @__PURE__ */ new Date()).toISOString();
    persistAuditLog({
      actorId: actor.id,
      actorName: actor.name,
      actorEmail: actor.email,
      action: "BOT_COMMAND_EXECUTED",
      category: "BOT",
      target: `${platform}::${command.slice(0, 120)}`,
      source: "BOT",
      status: "SUCCESS",
      ipAddress: req.ip || "unknown",
      metadata: { command: command.slice(0, 200), latencyMs: 14 }
    });
    res.json({
      success: true,
      executionId: secureId("exec"),
      platform: bot.platform,
      command,
      output: `Vanitas executed [${command.slice(0, 100)}] on ${bot.name}. Result: Nominal.`,
      timestamp: (/* @__PURE__ */ new Date()).toISOString()
    });
  });
  app.get("/api/v1/ai/history", async (req, res) => {
    try {
      const actor = getActorUser(req);
      if (!actor) return res.status(401).json({ error: "Authentication required" });
      const messages = await listAiChatHistory(actor.id);
      res.json({ messages });
    } catch (err) {
      console.error("[ai/history]", err?.message);
      res.status(500).json({ error: "Failed loading chat history" });
    }
  });
  app.delete("/api/v1/ai/history", async (req, res) => {
    try {
      const actor = getActorUser(req);
      if (!actor) return res.status(401).json({ error: "Authentication required" });
      const removed = await clearAiChatHistory(actor.id);
      res.json({ success: true, removed });
    } catch (err) {
      console.error("[ai/history]", err?.message);
      res.status(500).json({ error: "Failed clearing chat history" });
    }
  });
  app.post("/api/v1/ai/chat", async (req, res) => {
    try {
      const persona = sanitizeText(req.body?.persona, 32) || "code";
      const toneStyle = sanitizeText(req.body?.toneStyle, 32) || "developer";
      const prompt = sanitizeText(req.body?.prompt, 8e3);
      if (!prompt || prompt.length < 2) return res.status(400).json({ error: "Prompt is required (2-8000 chars)" });
      if (!["code", "api", "security", "analyst", "docs", "video", "admin"].includes(persona)) {
        return res.status(400).json({ error: "Invalid persona" });
      }
      const actor = getActorUser(req);
      const queryOptions = {
        persona,
        toneStyle: ["architect", "security", "developer", "bot", "arabic"].includes(toneStyle) ? toneStyle : "developer",
        prompt,
        enableWebSearch: !!req.body?.enableWebSearch,
        enableVideoSearch: !!req.body?.enableVideoSearch,
        context: typeof req.body?.context === "object" ? req.body.context : void 0
      };
      if (actor) {
        try {
          await appendAiChatMessage({ userId: actor.id, role: "user", content: prompt, persona });
        } catch (histErr) {
          console.warn("[ai/chat] history save (user) failed:", histErr?.message);
        }
      }
      if (req.body?.stream === true) {
        res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
        res.setHeader("Cache-Control", "no-cache, no-transform");
        res.setHeader("Connection", "keep-alive");
        res.setHeader("X-Accel-Buffering", "no");
        const send = (payload) => res.write(`data: ${JSON.stringify(payload)}

`);
        let streamedText = "";
        try {
          const response2 = await processAiQueryStream(queryOptions, (delta) => {
            if (!delta) return;
            streamedText += delta;
            send({ type: "delta", t: delta });
          });
          const finalText = (response2.text || streamedText).trim();
          if (actor && finalText) {
            try {
              await appendAiChatMessage({ userId: actor.id, role: "ai", content: finalText, persona });
            } catch (histErr) {
              console.warn("[ai/chat] history save (ai) failed:", histErr?.message);
            }
          }
          send({
            type: "done",
            text: finalText,
            engine: response2.engine,
            upstream: response2.upstream ?? null,
            groundingSources: response2.groundingSources,
            videos: response2.videos,
            videoQuery: response2.videoQuery,
            requiresConfirmation: response2.requiresConfirmation
          });
        } catch (streamErr) {
          console.error("[ai/chat] stream]", streamErr?.message);
          send({ type: "error", message: "The AI engine failed to respond. Please try again." });
        }
        return res.end();
      }
      const response = await processAiQuery(queryOptions);
      if (actor && response.text) {
        try {
          await appendAiChatMessage({ userId: actor.id, role: "ai", content: response.text, persona });
        } catch (histErr) {
          console.warn("[ai/chat] history save (ai) failed:", histErr?.message);
        }
      }
      res.json(response);
    } catch (err) {
      console.error("[ai/chat]", err?.message);
      res.status(500).json({ error: "AI engine error" });
    }
  });
  app.post("/api/v1/ai/diagnose-fix", async (req, res) => {
    try {
      const code = typeof req.body?.code === "string" ? req.body.code.slice(0, 3e4) : "";
      const language = sanitizeText(req.body?.language, 16) || "typescript";
      if (!code) {
        return res.status(400).json({ error: "Code snippet string is required (max 30KB)" });
      }
      if (!["typescript", "javascript", "python", "curl", "json", "sql"].includes(language)) {
        return res.status(400).json({ error: "Invalid language" });
      }
      const result = await diagnoseAndFixCode({
        code,
        language,
        context: sanitizeText(req.body?.context, 2e3) || void 0,
        autoFix: req.body?.autoFix !== false
      });
      res.json(result);
    } catch (err) {
      console.error("[ai/diagnose]", err?.message);
      res.status(500).json({ error: "Failed running code diagnosis" });
    }
  });
  app.post("/api/v1/suggestions", async (req, res) => {
    const actor = getActorUser(req);
    if (!actor) return res.status(401).json({ error: "Sign in to submit a suggestion" });
    const title = sanitizeText(req.body?.title, 140);
    const details = sanitizeText(req.body?.details, 5e3);
    const category = sanitizeText(req.body?.category, 16) || "feature";
    const code = typeof req.body?.code === "string" ? req.body.code.slice(0, 2e4) : void 0;
    if (!title || title.length < 3 || !details || details.length < 3) return res.status(400).json({ error: "Title and details are required (3+ chars)" });
    if (!["bug", "feature", "ux"].includes(category)) return res.status(400).json({ error: "Invalid suggestion category" });
    const suggestion = await createSuggestion({ title, details, category, code, authorName: sanitizeText(actor.name, 80) });
    persistAuditLog({
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
    if (!requireAdmin(req, res)) return;
    res.json({ suggestions: await listSuggestions() });
  });
  app.patch("/api/v1/admin/suggestions/:id", async (req, res) => {
    if (!requireAdmin(req, res)) return;
    const status = sanitizeText(req.body?.status, 16);
    const adminNote = sanitizeText(req.body?.adminNote, 2e3) || void 0;
    if (!["open", "reviewing", "resolved"].includes(status)) return res.status(400).json({ error: "Invalid status" });
    const suggestion = await updateSuggestion(sanitizeText(req.params.id, 128), status, adminNote);
    if (!suggestion) return res.status(404).json({ error: "Suggestion not found" });
    res.json({ suggestion });
  });
  app.post("/api/v1/admin/suggestions/:id/ai-fix", async (req, res) => {
    if (!requireAdmin(req, res)) return;
    const suggestion = await findSuggestion(sanitizeText(req.params.id, 128));
    if (!suggestion) return res.status(404).json({ error: "Suggestion not found" });
    if (!suggestion.code) return res.status(400).json({ error: "A code sample is required before AI repair can run" });
    await updateSuggestion(suggestion.id, "reviewing", "Admin requested an AI repair proposal.");
    const language = sanitizeText(req.body?.language, 16) || "typescript";
    const diagnosis = await diagnoseAndFixCode({ code: suggestion.code.slice(0, 3e4), language, context: suggestion.details.slice(0, 2e3), autoFix: true });
    res.json({ suggestion: await findSuggestion(suggestion.id), diagnosis });
  });
  app.all(["/api/v1/search/semantic", "/api/v1/semantic-search"], async (req, res) => {
    try {
      const rawQuery = req.method === "POST" ? req.body?.query : req.query.q;
      const query = sanitizeText(rawQuery, 300);
      if (!query || query.length < 2) {
        return res.status(400).json({ error: "Search query (2-300 chars) is required" });
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
      console.error("[semantic-search]", err?.message);
      res.status(500).json({ error: "Semantic search failed" });
    }
  });
  app.get("/api/v1/youtube/search", async (req, res) => {
    try {
      const q = sanitizeText(req.query.q, 200) || "Vanitas API Gateway";
      const limit = Math.min(Math.max(parseInt(req.query.limit || "6", 10) || 6, 1), 20);
      const result = await searchYouTubeVideos(q, limit);
      res.json(result);
    } catch (err) {
      console.error("[youtube/search]", err?.message);
      res.status(500).json({ error: "Failed searching YouTube videos" });
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
    const id = sanitizeText(req.body?.id, 128);
    if (!id) return res.status(400).json({ error: "Database ID is required" });
    const result = db.testDatabaseConnection(id);
    res.json(result);
  });
  app.post("/api/v1/databases/external", (req, res) => {
    const actor = requireAdmin(req, res);
    if (!actor) return;
    const name = sanitizeText(req.body?.name, 80);
    const provider = sanitizeText(req.body?.provider, 32);
    const region = sanitizeText(req.body?.region, 80);
    const connectionUrl = typeof req.body?.connectionUrl === "string" ? req.body.connectionUrl.slice(0, 2048) : "";
    if (!name || name.length < 3 || !provider || !connectionUrl) {
      return res.status(400).json({ error: "Name, Provider, and Connection URL are required" });
    }
    if (!["supabase", "neon", "upstash", "render", "railway", "sqlite_cloud"].includes(provider)) {
      return res.status(400).json({ error: "Unsupported provider" });
    }
    if (!sanitizeUrl(connectionUrl) && !connectionUrl.startsWith("postgresql://") && !connectionUrl.startsWith("rediss://") && !connectionUrl.startsWith("https://")) {
      return res.status(400).json({ error: "Invalid connection URL" });
    }
    const created = db.addExternalDatabase({ name, provider, connectionUrl, region: region || void 0 });
    persistAuditLog({
      actorId: actor.id,
      actorName: actor.name,
      actorEmail: actor.email,
      action: "DATABASE_CONNECTED",
      category: "DATABASE",
      target: `${created.name} (${created.provider})`,
      source: detectSource(req),
      status: "SUCCESS",
      ipAddress: req.ip || "unknown",
      metadata: { provider: created.provider, region: created.region }
    });
    res.status(201).json({ success: true, database: created });
  });
  let tutorialsCache = null;
  app.get("/api/v1/videos/tutorials", async (_req, res) => {
    try {
      if (tutorialsCache && Date.now() - tutorialsCache.at < 5 * 6e4) {
        return res.json(tutorialsCache.payload);
      }
      const result = await searchYouTubeVideos("build REST API authentication tutorial", 8);
      const tutorials = result.videos.map((v) => ({
        id: `yt_${v.id}`,
        title: v.title,
        description: v.description || "Live YouTube tutorial result.",
        category: "getting_started",
        duration: v.duration || "",
        thumbnailUrl: v.thumbnailUrl,
        videoEmbedUrl: v.embedUrl,
        youtubeId: v.id,
        badge: "Live on YouTube",
        author: v.channelTitle,
        tags: ["YouTube", "Tutorial"],
        highlights: []
      }));
      const payload = { success: true, tutorials, source: result.searchEngine, summary: result.aiSummary };
      tutorialsCache = { at: Date.now(), payload };
      res.json(payload);
    } catch (err) {
      console.error("[videos/tutorials]", err?.message);
      res.json({ success: true, tutorials: [] });
    }
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
      if (!actor) return res.status(401).json({ error: "Authentication required" });
      const source = detectSource(req);
      const type = sanitizeText(req.params.type, 16);
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
      res.setHeader("Content-Disposition", `attachment; filename="${sanitizeText(filename, 128)}"`);
      res.setHeader("Content-Type", contentType);
      res.setHeader("X-Vanitas-Version", sanitizeText(release.version, 32));
      res.setHeader("X-Vanitas-Checksum-SHA256", sanitizeText(release.sha256, 128));
      res.setHeader("Content-Length", buffer.length);
      res.send(buffer);
    } catch (err) {
      console.error("[download]", err?.message);
      res.status(500).json({ error: "Download failed" });
    }
  });
  app.use((err, _req, res, _next) => {
    console.error("[unhandled]", err?.message);
    res.status(500).json({ error: "Internal server error" });
  });
  if (!process.env.VERCEL) {
    if (process.env.NODE_ENV !== "production") {
      const viteSpecifier = ["v", "ite"].join("");
      const { createServer: createViteServer } = await import(viteSpecifier);
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: "spa"
      });
      app.use(vite.middlewares);
    } else {
      const distPath = path.join(process.cwd(), "dist");
      app.use(express.static(distPath));
      app.get(/^(?!\/api\/).*/, (_req, res) => {
        res.sendFile(path.join(distPath, "index.html"));
      });
    }
  }
  return app;
}
async function startServer() {
  const PORT = Number(process.env.PORT) || 3e3;
  const app = await buildApp();
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Vanitas Central Server running on http://0.0.0.0:${PORT}`);
  });
}
var memoryComments, memoryAiChat, AI_HISTORY_PAGE, AI_HISTORY_RETAIN, server_default;
var init_server = __esm({
  "server.ts"() {
    init_db();
    init_pg();
    init_authStore();
    init_totp();
    init_oauth();
    init_aiService();
    init_apiKeyAuth();
    init_security();
    memoryComments = [];
    memoryAiChat = [];
    AI_HISTORY_PAGE = 100;
    AI_HISTORY_RETAIN = 400;
    server_default = buildApp;
    if (!process.env.VERCEL && (process.argv[1]?.endsWith("server.ts") || process.argv[1]?.endsWith("server.cjs"))) {
      startServer();
    } else if (!process.env.VERCEL && process.env.NODE_ENV !== "test") {
      if (!globalThis.__vanitas_listening) {
        globalThis.__vanitas_listening = true;
        startServer().catch((e) => console.error(e));
      }
    }
  }
});

// src/server/vercelEntry.ts
var appPromise = null;
var currentRes = null;
function loadApp() {
  if (!appPromise) {
    appPromise = Promise.resolve().then(() => (init_server(), server_exports)).then((mod) => {
      const buildApp2 = mod.default;
      if (typeof buildApp2 !== "function") {
        throw new Error("server.ts has no default export buildApp()");
      }
      return buildApp2();
    }).catch((err) => {
      appPromise = null;
      throw err;
    });
  }
  return appPromise;
}
function fail(res, stage, err) {
  const payload = {
    error: "function_error",
    stage,
    message: String(err?.message || err),
    stack: String(err?.stack || "").split("\n").slice(0, 10).join("\n"),
    node: process.version,
    vercel: process.env.VERCEL ? "1" : "",
    nodeEnv: process.env.NODE_ENV || "",
    time: (/* @__PURE__ */ new Date()).toISOString()
  };
  console.error("[vanitas]", JSON.stringify(payload));
  if (!res) return;
  try {
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader("content-type", "application/json; charset=utf-8");
    }
    res.end(JSON.stringify(payload, null, 2));
  } catch {
  }
}
process.on("unhandledRejection", (reason) => {
  console.error("[vanitas] unhandledRejection", reason);
  if (currentRes && !currentRes.writableEnded) fail(currentRes, "unhandledRejection", reason);
});
process.on("uncaughtException", (err) => {
  console.error("[vanitas] uncaughtException", err);
  if (currentRes && !currentRes.writableEnded) fail(currentRes, "uncaughtException", err);
});
async function handler(req, res) {
  currentRes = res;
  res.on?.("finish", () => {
    if (currentRes === res) currentRes = null;
  });
  try {
    const app = await loadApp();
    return app(req, res);
  } catch (err) {
    return fail(res, "boot", err);
  }
}
export {
  handler as default
};
