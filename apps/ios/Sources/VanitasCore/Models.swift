import Foundation

// MARK: - Wire models
//
// A 1:1 port of `src/types.ts`. Two rules keep the app resilient against a
// server that evolves ahead of it:
//
//  * `Codable` ignores keys it does not know (the equivalent of the Kotlin
//    models' `ignoreUnknownKeys`), and
//  * only fields the gateway can genuinely omit or null are optional — the
//    rest are contract-mandatory, so a broken payload surfaces as
//    `VanitasError.decoding` instead of silently rendering blanks.
//
// Rates (`successRate`, `quotaUsedPercent`, `percentage`) are 0…100 exactly as
// `src/server/db.ts` emits them — never 0…1.

public struct UserProfile: Codable, Sendable, Equatable {
    public let id: String
    public let email: String
    public let name: String
    public let username: String
    public let avatarUrl: String?
    public let role: String
    public let twoFactorEnabled: Bool
    public let createdAt: String
    public let lastLoginAt: String?
}

public struct LoginRequest: Codable, Sendable, Equatable {
    public let email: String
    public let password: String
    /// TOTP code — only sent when the account has 2FA enabled.
    public let code: String?

    public init(email: String, password: String, code: String? = nil) {
        self.email = email
        self.password = password
        self.code = code
    }
}

public struct LoginResponse: Codable, Sendable, Equatable {
    public let token: String
    public let user: UserProfile
    public let permissions: [String]
}

public struct MeResponse: Codable, Sendable, Equatable {
    public let user: UserProfile
    public let permissions: [String]
}

/// The gateway's error envelope. `twoFactorRequired` arrives with a 401 when
/// the password was right but a TOTP code is still missing.
public struct ErrorBody: Codable, Sendable, Equatable {
    public let error: String?
    public let twoFactorRequired: Bool?

    public init(error: String? = nil, twoFactorRequired: Bool? = nil) {
        self.error = error
        self.twoFactorRequired = twoFactorRequired
    }
}

public struct ApiKey: Codable, Sendable, Equatable {
    public let id: String
    public let name: String
    public let keyPrefix: String
    public let maskedSecret: String
    public let ownerId: String
    public let ownerName: String
    public let scopes: [String]
    public let status: String
    public let rateLimitPerMin: Int
    public let burstLimit: Int?
    public let monthlyQuota: Int?
    public let currentUsageThisMonth: Int?
    public let usageCount: Int
    public let createdAt: String
    public let lastUsedAt: String?
    public let expiresAt: String?
    public let environment: String
}

public struct ScopeInfo: Codable, Sendable, Equatable {
    public let scope: String
    public let label: String
    public let group: String
    public let adminOnly: Bool
}

public struct KeysResponse: Codable, Sendable, Equatable {
    public let keys: [ApiKey]
    public let allScopes: [ScopeInfo]
}

/// `POST /api-keys` and `POST /api-keys/{id}/rotate` — the secret shows up once.
public struct CreatedKeyResponse: Codable, Sendable, Equatable {
    public let key: ApiKey
    public let rawSecret: String
    public let revealNote: String?
}

public struct DeleteKeyResponse: Codable, Sendable, Equatable {
    public let success: Bool
    public let key: ApiKey?
}

public struct CreateKeyRequest: Codable, Sendable, Equatable {
    public let name: String
    public let scopes: [String]
    public let environment: String
    public let rateLimitPerMin: Int

    public init(
        name: String,
        scopes: [String],
        environment: String = "test",
        rateLimitPerMin: Int = 600
    ) {
        self.name = name
        self.scopes = scopes
        self.environment = environment
        self.rateLimitPerMin = rateLimitPerMin
    }
}

public struct UsagePoint: Codable, Sendable, Equatable {
    public let timeLabel: String
    public let timestamp: String
    public let totalRequests: Int
    public let successCount: Int
    public let throttledCount: Int
    public let errorCount: Int
    public let latencyMs: Double
    public let p95LatencyMs: Double
    // The gateway also adds one numeric series per key (and `__t` / `__e`
    // splits); Codable drops them, and the app reads the summaries instead.
}

public struct TopEndpoint: Codable, Sendable, Equatable {
    public let endpoint: String
    public let count: Int
    public let percentage: Double
}

public struct UsageSummary: Codable, Sendable, Equatable {
    public let keyId: String
    public let keyName: String
    public let keyPrefix: String
    public let environment: String
    public let rateLimitPerMin: Int
    public let totalRequests: Int
    /// 0…100, one decimal.
    public let successRate: Double
    public let throttledRequests: Int
    /// 4xx/5xx excluding 429.
    public let errorCount: Int
    /// 0…100 against the key's monthly quota (0 when no quota is set).
    public let quotaUsedPercent: Double
    public let peakRpm: Int
    public let avgLatencyMs: Double
    public let topEndpoints: [TopEndpoint]
}

public struct UsageAnalytics: Codable, Sendable, Equatable {
    public let period: String
    public let timeSeries: [UsagePoint]
    public let summaries: [UsageSummary]
    public let totalVolume: Int
    /// 0…100, one decimal.
    public let overallSuccessRate: Double
    public let overallThrottledCount: Int
    public let overallErrorCount: Int
    public let overallAvgLatencyMs: Double
    /// `typescript_native` / `python_remote:<url>` — added by the gateway.
    public let upstream: String?
}

// MARK: - Helpers

/// The periods the gateway accepts; anything else falls back to 24h.
public let usagePeriods: [String] = ["24h", "7d", "30d"]

public func normalizePeriod(_ period: String) -> String {
    usagePeriods.contains(period) ? period : "24h"
}
