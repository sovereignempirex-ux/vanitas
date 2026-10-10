using System.Text.Json;
using System.Text.Json.Serialization;

namespace Vanitas.Core;

// Wire models — a 1:1 port of `src/types.ts`, the same set `Models.swift` and
// `core/Models.kt` carry. Two rules keep the app resilient against a server
// that evolves ahead of it:
//
//  * unknown JSON keys are ignored (System.Text.Json's default, the equivalent
//    of Kotlin's `ignoreUnknownKeys` and Swift `Codable`'s default), and
//  * only fields the gateway can genuinely omit or null are nullable — the rest
//    are `required`, so a broken payload throws while deserialising and becomes
//    `VanitasError.Decoding` instead of silently rendering blanks.
//
// Rates (`SuccessRate`, `QuotaUsedPercent`, `Percentage`) are 0…100 exactly as
// `src/server/db.ts` emits them — never 0…1.

/// Serialisation shared by the client's requests and responses, so both ends
/// of the wire agree on casing and on how nulls behave.
public static class VanitasJson
{
    public static readonly JsonSerializerOptions Options = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        PropertyNameCaseInsensitive = true,
        // Swift's `Codable` omits nil optionals, and so does the gateway — a
        // `"code": null` on the login body would break the tests that assert
        // no TOTP field is sent unless one was typed.
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
    };

    public static string Serialize<T>(T value) => JsonSerializer.Serialize(value, Options);

    public static T Deserialize<T>(string json) => JsonSerializer.Deserialize<T>(json, Options)!;
}

public sealed record UserProfile
{
    public required string Id { get; init; }
    public required string Email { get; init; }
    public required string Name { get; init; }
    public required string Username { get; init; }
    public string? AvatarUrl { get; init; }
    public required string Role { get; init; }
    public required bool TwoFactorEnabled { get; init; }
    public required string CreatedAt { get; init; }
    public string? LastLoginAt { get; init; }
}

public sealed record LoginRequest
{
    public required string Email { get; init; }
    public required string Password { get; init; }
    /// TOTP code — only sent when the account has 2FA enabled.
    public string? Code { get; init; }
}

public sealed record LoginResponse
{
    public required string Token { get; init; }
    public required UserProfile User { get; init; }
    public required string[] Permissions { get; init; }
}

public sealed record MeResponse
{
    public required UserProfile User { get; init; }
    public required string[] Permissions { get; init; }
}

/// The gateway's error envelope. `TwoFactorRequired` arrives with a 401 when
/// the password was right but a TOTP code is still missing.
public sealed record ErrorBody
{
    public string? Error { get; init; }
    public bool? TwoFactorRequired { get; init; }
}

public sealed record ApiKey
{
    public required string Id { get; init; }
    public required string Name { get; init; }
    public required string KeyPrefix { get; init; }
    public required string MaskedSecret { get; init; }
    public required string OwnerId { get; init; }
    public required string OwnerName { get; init; }
    public required string[] Scopes { get; init; }
    public required string Status { get; init; }
    public required int RateLimitPerMin { get; init; }
    public int? BurstLimit { get; init; }
    public int? MonthlyQuota { get; init; }
    public int? CurrentUsageThisMonth { get; init; }
    public required int UsageCount { get; init; }
    public required string CreatedAt { get; init; }
    public string? LastUsedAt { get; init; }
    public string? ExpiresAt { get; init; }
    public required string Environment { get; init; }
}

public sealed record ScopeInfo
{
    public required string Scope { get; init; }
    public required string Label { get; init; }
    public required string Group { get; init; }
    public required bool AdminOnly { get; init; }
}

public sealed record KeysResponse
{
    public required ApiKey[] Keys { get; init; }
    public required ScopeInfo[] AllScopes { get; init; }
}

/// `POST /api-keys` and `POST /api-keys/{id}/rotate` — the secret shows once.
public sealed record CreatedKeyResponse
{
    public required ApiKey Key { get; init; }
    public required string RawSecret { get; init; }
    public string? RevealNote { get; init; }
}

public sealed record DeleteKeyResponse
{
    public required bool Success { get; init; }
    public ApiKey? Key { get; init; }
}

public sealed record CreateKeyRequest
{
    public required string Name { get; init; }
    public required string[] Scopes { get; init; }
    public string Environment { get; init; } = "test";
    public int RateLimitPerMin { get; init; } = 600;
}

/// One bucket of the time series. The gateway also adds one numeric series per
/// key (plus `__t` / `__e` splits); those are ignored here and the app reads
/// the summaries instead.
public sealed record UsagePoint
{
    public required string TimeLabel { get; init; }
    public required string Timestamp { get; init; }
    public required int TotalRequests { get; init; }
    public required int SuccessCount { get; init; }
    public required int ThrottledCount { get; init; }
    public required int ErrorCount { get; init; }
    public required double LatencyMs { get; init; }
    public required double P95LatencyMs { get; init; }
}

public sealed record TopEndpoint
{
    public required string Endpoint { get; init; }
    public required int Count { get; init; }
    public required double Percentage { get; init; }
}

public sealed record UsageSummary
{
    public required string KeyId { get; init; }
    public required string KeyName { get; init; }
    public required string KeyPrefix { get; init; }
    public required string Environment { get; init; }
    public required int RateLimitPerMin { get; init; }
    public required int TotalRequests { get; init; }
    /// 0…100, one decimal.
    public required double SuccessRate { get; init; }
    public required int ThrottledRequests { get; init; }
    /// 4xx/5xx excluding 429.
    public required int ErrorCount { get; init; }
    /// 0…100 against the key's monthly quota (0 when no quota is set).
    public required double QuotaUsedPercent { get; init; }
    public required int PeakRpm { get; init; }
    public required double AvgLatencyMs { get; init; }
    public required TopEndpoint[] TopEndpoints { get; init; }
}

public sealed record UsageAnalytics
{
    public required string Period { get; init; }
    public required UsagePoint[] TimeSeries { get; init; }
    public required UsageSummary[] Summaries { get; init; }
    public required int TotalVolume { get; init; }
    /// 0…100, one decimal.
    public required double OverallSuccessRate { get; init; }
    public required int OverallThrottledCount { get; init; }
    public required int OverallErrorCount { get; init; }
    public required double OverallAvgLatencyMs { get; init; }
    /// `typescript_native` / `python_remote:<url>` — added by the gateway.
    public string? Upstream { get; init; }
}

/// The periods the gateway accepts; anything else falls back to 24h.
public static class UsagePeriods
{
    public static readonly string[] Allowed = ["24h", "7d", "30d"];

    public static string Normalize(string? period) =>
        period is not null && Allowed.Contains(period) ? period : "24h";
}
