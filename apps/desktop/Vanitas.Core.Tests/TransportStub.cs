using System.Net.Http;
using System.Text;
using Vanitas.Core;

/// A scripted `IHttpTransport`: every call answers from a delegate and the
/// request it saw is kept for assertions. Nothing here touches a socket, so the
/// whole suite is deterministic and runs offline on any machine with
/// `dotnet test` — no gateway, no window, no credentials.
public sealed class TransportStub : IHttpTransport
{
    private readonly Func<HttpRequestMessage, CancellationToken, Task<TransportResponse>> _script;

    public TransportStub(Func<HttpRequestMessage, CancellationToken, Task<TransportResponse>> script) =>
        _script = script;

    /// Always answers the same payload, regardless of the request.
    public TransportStub(int status = 200, string body = "")
    {
        var payload = Encoding.UTF8.GetBytes(body);
        _script = (_, _) => Task.FromResult(new TransportResponse(status, payload));
    }

    public List<HttpRequestMessage> Requests { get; } = [];

    /// The body of the most recent request, read as JSON-friendly text.
    public string? LastBody { get; private set; }

    /// The most recent request, or null when nothing was sent.
    public HttpRequestMessage? Last => Requests.Count == 0 ? null : Requests[^1];

    public Task<TransportResponse> SendAsync(HttpRequestMessage request,
                                             CancellationToken cancellationToken = default)
    {
        Requests.Add(request);
        LastBody = request.Content is null
            ? null
            : request.Content.ReadAsStringAsync(cancellationToken).GetAwaiter().GetResult();
        return _script(request, cancellationToken);
    }

    /// Simulates a host that cannot be reached at all.
    public static TransportStub Unreachable() =>
        new((_, _) => throw new HttpRequestException("Cannot connect to the remote server"));

    public static TransportResponse Reply(int status, string body) =>
        new(status, Encoding.UTF8.GetBytes(body));
}

/// Captures what the client reported about each request, so the observer
/// contract can be asserted without a UI thread.
public sealed class ObserverStub : IRequestObserver
{
    public List<(string Method, Uri Url, int? Status, long Ms, string? Error)> Reports { get; } = [];

    public void Report(string method, Uri url, int? status, long elapsedMs, string? error) =>
        Reports.Add((method, url, status, elapsedMs, error));
}

/// An observer with a bug — the contract says it can never break the request
/// it is watching.
public sealed class BrokenObserver : IRequestObserver
{
    public void Report(string method, Uri url, int? status, long elapsedMs, string? error) =>
        throw new InvalidOperationException("my log panel is on fire");
}

public static class Fixtures
{
    /// One summary in exactly the shape `src/server/db.ts` emits (all fields the
    /// gateway guarantees present; nothing else).
    public static Dictionary<string, object?> Summary(
        string keyId = "k1",
        string keyName = "Prod",
        string keyPrefix = "vk_live_ab12",
        string environment = "live",
        int rateLimitPerMin = 600,
        int totalRequests = 100,
        double successRate = 100.0,
        int throttledRequests = 0,
        int errorCount = 0,
        double quotaUsedPercent = 0.0,
        int peakRpm = 12,
        double avgLatencyMs = 21.5,
        object? topEndpoints = null) => new()
    {
        ["keyId"] = keyId,
        ["keyName"] = keyName,
        ["keyPrefix"] = keyPrefix,
        ["environment"] = environment,
        ["rateLimitPerMin"] = rateLimitPerMin,
        ["totalRequests"] = totalRequests,
        ["successRate"] = successRate,
        ["throttledRequests"] = throttledRequests,
        ["errorCount"] = errorCount,
        ["quotaUsedPercent"] = quotaUsedPercent,
        ["peakRpm"] = peakRpm,
        ["avgLatencyMs"] = avgLatencyMs,
        ["topEndpoints"] = topEndpoints ?? new List<object>(),
    };

    public static Dictionary<string, object?> Usage(
        string period = "24h",
        IEnumerable<Dictionary<string, object?>>? summaries = null) => new()
    {
        ["period"] = period,
        ["timeSeries"] = new List<object>(),
        ["summaries"] = summaries?.ToList() ?? new List<Dictionary<string, object?>>(),
        ["totalVolume"] = 4200,
        ["overallSuccessRate"] = 99.1,
        ["overallThrottledCount"] = 3,
        ["overallErrorCount"] = 12,
        ["overallAvgLatencyMs"] = 0,
    };

    /// Round-trips through the real serializer, so a fixture that drifts away
    /// from the contract fails here rather than in the client.
    public static UsageAnalytics UsageFixture(
        string period = "24h",
        params Dictionary<string, object?>[] summaries) =>
        VanitasJson.Deserialize<UsageAnalytics>(
            VanitasJson.Serialize(Usage(period, summaries)));

    public static string UserJson(
        string id = "u1",
        string email = "a@b.c",
        string name = "Ada",
        string username = "ada",
        string role = "user",
        bool twoFactorEnabled = false) => VanitasJson.Serialize(new Dictionary<string, object?>
    {
        ["id"] = id,
        ["email"] = email,
        ["name"] = name,
        ["username"] = username,
        ["avatarUrl"] = null,
        ["role"] = role,
        ["twoFactorEnabled"] = twoFactorEnabled,
        ["createdAt"] = "2024-01-01T00:00:00.000Z",
        ["lastLoginAt"] = null,
    });

    public static string KeyJson(
        string id = "k1",
        string name = "Prod",
        string keyPrefix = "vk_live_ab12",
        string environment = "live") => VanitasJson.Serialize(new Dictionary<string, object?>
    {
        ["id"] = id,
        ["name"] = name,
        ["keyPrefix"] = keyPrefix,
        ["maskedSecret"] = "vk_live_ab12••••••••",
        ["ownerId"] = "u1",
        ["ownerName"] = "Ada",
        ["scopes"] = new[] { "apikeys:read" },
        ["status"] = "active",
        ["rateLimitPerMin"] = 600,
        ["burstLimit"] = null,
        ["monthlyQuota"] = null,
        ["currentUsageThisMonth"] = null,
        ["usageCount"] = 4321,
        ["createdAt"] = "2026-09-01T12:00:00.000Z",
        ["lastUsedAt"] = "2026-10-09T08:00:00.000Z",
        ["expiresAt"] = null,
        ["environment"] = environment,
        ["monthlyQuota"] = 50000,
        ["currentUsageThisMonth"] = 12000,
    });
}
