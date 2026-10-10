namespace Vanitas.Core;

// What the app decides to tell the user about — decided here, not in a window
// or a background task, so it is testable without a UI thread.
//
// Inputs are the real numbers the gateway reports (see `src/server/db.ts`):
// `QuotaUsedPercent` and `SuccessRate` are 0…100, while `TotalRequests`,
// `ErrorCount` and `ThrottledRequests` are counts for the selected window.

public enum AlertKind
{
    Quota,
    Errors,
    Throttled,
}

public sealed record UsageAlert(
    AlertKind Kind,
    string KeyId,
    string KeyName,
    string Period,
    /// Supplied to the store so the same condition is not announced twice.
    string DedupeKey,
    int QuotaPercent,
    int TotalRequests,
    int ErrorCount,
    int ThrottledCount);

/// Alert thresholds.
///
/// Clamped in the constructor, never trusted as given: a mistyped preference
/// must not crash the app and must never leave alerting switched off — so
/// there is no way to *construct* an out-of-range instance, exactly like the
/// Swift twin's `init`.
///
/// (The Kotlin twin in `apps/android` rejects out-of-range values with
/// `require` instead — a deliberate platform difference, both are covered by
/// tests.)
public sealed class AlertThresholds
{
    /// Warn once a key's monthly quota reaches this percent (1…100).
    public int QuotaPercent { get; }

    /// Below this much traffic an error/throttle ratio is noise, not a signal.
    public int MinRequests { get; }

    /// `ErrorCount / TotalRequests`, in percent.
    public double ErrorRatePercent { get; }

    /// `429s / TotalRequests`, in percent.
    public double ThrottledRatePercent { get; }

    /// Same key + same kind is announced at most once per this window.
    public long DedupeWindowMs { get; }

    public AlertThresholds(
        int quotaPercent = 80,
        int minRequests = 20,
        double errorRatePercent = 10.0,
        double throttledRatePercent = 10.0,
        long dedupeWindowMs = 6 * 60 * 60 * 1000)
    {
        // 0% would fire on every key, always; a zero window would divide the
        // clock by zero.
        QuotaPercent = Math.Clamp(quotaPercent, 1, 100);
        MinRequests = Math.Max(minRequests, 1);
        ErrorRatePercent = Math.Max(errorRatePercent, 0);
        ThrottledRatePercent = Math.Max(throttledRatePercent, 0);
        DedupeWindowMs = Math.Max(dedupeWindowMs, 1);
    }
}

public static class UsageEvaluator
{
    /// <param name="nowMs">Injectable clock, so the dedupe window is
    /// deterministic in tests.</param>
    /// <param name="hasSeen">Reports whether a dedupe key was already
    /// announced.</param>
    /// <returns>Alerts to raise, in a stable order (quota, errors, throttled —
    /// per key).</returns>
    public static IReadOnlyList<UsageAlert> Evaluate(
        UsageAnalytics usage,
        AlertThresholds? thresholds = null,
        long nowMs = 0,
        Func<string, bool>? hasSeen = null)
    {
        var t = thresholds ?? new AlertThresholds();
        hasSeen ??= _ => false;

        // Bucketing by window (rather than "have I ever said it") lets a
        // condition that recurs six hours later be announced again.
        var slot = nowMs / t.DedupeWindowMs;
        var alerts = new List<UsageAlert>();

        foreach (var summary in usage.Summaries)
        {
            void Raise(AlertKind kind, int quota = 0, int errors = 0, int throttled = 0)
            {
                var dedupeKey = $"{KindKey(kind)}:{summary.KeyId}:{slot}";
                if (hasSeen(dedupeKey)) return;
                alerts.Add(new UsageAlert(
                    kind,
                    summary.KeyId,
                    // A key the user never named is shown by its prefix.
                    string.IsNullOrEmpty(summary.KeyName) ? summary.KeyPrefix : summary.KeyName,
                    usage.Period,
                    dedupeKey,
                    quota,
                    summary.TotalRequests,
                    errors,
                    throttled));
            }

            // A configured quota can be consumed by traffic this device never
            // saw, so this one fires regardless of the request count.
            if (summary.QuotaUsedPercent >= t.QuotaPercent)
                Raise(AlertKind.Quota, quota: (int)summary.QuotaUsedPercent);

            if (summary.TotalRequests >= t.MinRequests)
            {
                var errorRate = summary.ErrorCount * 100.0 / summary.TotalRequests;
                if (errorRate >= t.ErrorRatePercent)
                    Raise(AlertKind.Errors, errors: summary.ErrorCount);

                var throttleRate = summary.ThrottledRequests * 100.0 / summary.TotalRequests;
                if (throttleRate >= t.ThrottledRatePercent)
                    Raise(AlertKind.Throttled, throttled: summary.ThrottledRequests);
            }
        }

        return alerts;
    }

    /// Same decision, plus persistence: everything returned here is recorded in
    /// <paramref name="store"/> before the caller posts it, so a second run
    /// inside the same window stays silent even across relaunches.
    public static IReadOnlyList<UsageAlert> EvaluateAndRecord(
        UsageAnalytics usage,
        ISessionStore store,
        AlertThresholds? thresholds = null,
        long nowMs = 0)
    {
        var fresh = Evaluate(usage, thresholds, nowMs, store.HasSeen);
        foreach (var alert in fresh)
            store.MarkSeen(alert.DedupeKey);
        return fresh;
    }

    private static string KindKey(AlertKind kind) => kind switch
    {
        AlertKind.Quota => "QUOTA",
        AlertKind.Errors => "ERRORS",
        AlertKind.Throttled => "THROTTLED",
        _ => kind.ToString().ToUpperInvariant(),
    };
}
