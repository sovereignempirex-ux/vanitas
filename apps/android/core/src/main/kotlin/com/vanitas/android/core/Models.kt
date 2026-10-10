package com.vanitas.android.core

import kotlinx.serialization.Serializable

/**
 * Wire models for the Vanitas gateway.
 *
 * Every field mirrors `src/types.ts` on the server. Two rules keep the app
 * resilient against a server that evolves ahead of it:
 *  - `ignoreUnknownKeys` (see [vanitasJson]) drops fields added later, and
 *  - everything that is not a hard requirement carries a default, so a partial
 *    payload degrades instead of crashing the screen.
 *
 * Rates (`successRate`, `quotaUsedPercent`, `percentage`) are 0..100 exactly as
 * `src/server/db.ts` emits them — never 0..1.
 */

@Serializable
data class UserProfile(
    val id: String,
    val email: String,
    val name: String,
    val username: String = "",
    val avatarUrl: String = "",
    val role: String = "MEMBER",
    val twoFactorEnabled: Boolean = false,
    val createdAt: String = "",
    val lastLoginAt: String = "",
)

@Serializable
data class LoginRequest(
    val email: String,
    val password: String,
    /** TOTP code — only sent when the account has 2FA enabled. */
    val code: String? = null,
)

@Serializable
data class LoginResponse(
    val token: String,
    val user: UserProfile,
    val permissions: List<String> = emptyList(),
)

@Serializable
data class MeResponse(
    val user: UserProfile,
    val permissions: List<String> = emptyList(),
)

@Serializable
data class ErrorBody(
    val error: String? = null,
    /** Present on 401 when the password is right but a TOTP code is missing. */
    val twoFactorRequired: Boolean = false,
)

@Serializable
data class ApiKey(
    val id: String,
    val name: String,
    val keyPrefix: String = "",
    val maskedSecret: String = "",
    val ownerId: String = "",
    val ownerName: String = "",
    val scopes: List<String> = emptyList(),
    val status: String = "active",
    val rateLimitPerMin: Int = 600,
    val usageCount: Int = 0,
    val monthlyQuota: Int? = null,
    val currentUsageThisMonth: Int? = null,
    val createdAt: String = "",
    val lastUsedAt: String? = null,
    val expiresAt: String? = null,
    val environment: String = "live",
)

@Serializable
data class ScopeInfo(
    val scope: String,
    val label: String = scope,
    val group: String = "",
    val adminOnly: Boolean = false,
)

@Serializable
data class KeysResponse(
    val keys: List<ApiKey> = emptyList(),
    val allScopes: List<ScopeInfo> = emptyList(),
)

/** POST /api-keys and POST /api-keys/{id}/rotate — the secret shows up once. */
@Serializable
data class CreatedKeyResponse(
    val key: ApiKey,
    val rawSecret: String = "",
    val revealNote: String = "",
)

@Serializable
data class DeleteKeyResponse(
    val success: Boolean = false,
    val key: ApiKey? = null,
)

@Serializable
data class CreateKeyRequest(
    val name: String,
    val scopes: List<String>,
    val environment: String = "live",
    val rateLimitPerMin: Int = 600,
)

@Serializable
data class UsagePoint(
    val timeLabel: String = "",
    val timestamp: String = "",
    val totalRequests: Int = 0,
    val successCount: Int = 0,
    val throttledCount: Int = 0,
    val errorCount: Int = 0,
    val latencyMs: Double = 0.0,
    val p95LatencyMs: Double = 0.0,
    // The server also adds one numeric series per key (and __t / __e splits);
    // `ignoreUnknownKeys` discards them — the app reads the summaries instead.
)

@Serializable
data class TopEndpoint(
    val endpoint: String,
    val count: Int = 0,
    val percentage: Double = 0.0,
)

@Serializable
data class UsageSummary(
    val keyId: String,
    val keyName: String = "",
    val keyPrefix: String = "",
    val environment: String = "live",
    val rateLimitPerMin: Int = 0,
    val totalRequests: Int = 0,
    /** 0..100, one decimal. */
    val successRate: Double = 0.0,
    val throttledRequests: Int = 0,
    /** 4xx/5xx excluding 429. */
    val errorCount: Int = 0,
    /** 0..100 against the key's monthly quota (0 when no quota is set). */
    val quotaUsedPercent: Double = 0.0,
    val peakRpm: Int = 0,
    val avgLatencyMs: Double = 0.0,
    val topEndpoints: List<TopEndpoint> = emptyList(),
)

@Serializable
data class UsageAnalytics(
    val period: String = "24h",
    val timeSeries: List<UsagePoint> = emptyList(),
    val summaries: List<UsageSummary> = emptyList(),
    val totalVolume: Int = 0,
    /** 0..100, one decimal. */
    val overallSuccessRate: Double = 0.0,
    val overallThrottledCount: Int = 0,
    val overallErrorCount: Int = 0,
    val overallAvgLatencyMs: Double = 0.0,
    /** `typescript_native` / `python_remote:<url>` — added by the gateway. */
    val upstream: String? = null,
)
