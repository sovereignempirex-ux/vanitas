using Vanitas.Core;

/// The alert rules, decided here rather than in a window or a background task.
/// Every case is fed by fixtures shaped exactly like the gateway's own
/// `UsageAnalytics`, so a contract change shows up as a failure here first.
public class UsageEvaluatorTests
{
    /// A pinned clock: the dedupe window is a pure function of it.
    private const long Now = 1_700_000_000_000;
    private const long SixHours = 6 * 60 * 60 * 1000;

    private static UsageAnalytics UsageFor(
        string period = "24h",
        Dictionary<string, object?>? summary = null) =>
        Fixtures.UsageFixture(period, summary ?? Fixtures.Summary());

    private static IReadOnlyList<AlertKind> Kinds(IReadOnlyList<UsageAlert> alerts) =>
        alerts.Select(a => a.Kind).ToList();

    // MARK: - Quota

    [Fact]
    public void Quota_at_threshold_raises()
    {
        var usage = UsageFor(summary: Fixtures.Summary(quotaUsedPercent: 80));

        var alerts = UsageEvaluator.Evaluate(usage, nowMs: Now);

        Assert.Single(alerts);
        Assert.Equal(AlertKind.Quota, alerts[0].Kind);
        Assert.Equal(80, alerts[0].QuotaPercent);
        Assert.Equal("k1", alerts[0].KeyId);
        Assert.Equal("Prod", alerts[0].KeyName);
        Assert.Equal("24h", alerts[0].Period);
        Assert.Equal($"QUOTA:k1:{Now / SixHours}", alerts[0].DedupeKey);
    }

    [Fact]
    public void Quota_just_below_threshold_stays_silent()
    {
        var usage = UsageFor(summary: Fixtures.Summary(quotaUsedPercent: 79.9));

        Assert.Empty(UsageEvaluator.Evaluate(usage, nowMs: Now));
    }

    [Fact]
    public void Quota_fires_even_with_no_requests_this_window()
    {
        // A quota can be consumed by traffic this device never saw, so this
        // one deliberately ignores the request-count gate.
        var usage = UsageFor(summary: Fixtures.Summary(totalRequests: 0, quotaUsedPercent: 95));

        Assert.Equal([AlertKind.Quota], Kinds(UsageEvaluator.Evaluate(usage, nowMs: Now)));
    }

    [Fact]
    public void Missing_name_falls_back_to_prefix()
    {
        // A configured quota guarantees an alert fires — without it this case
        // would assert against an empty list and prove nothing.
        var usage = UsageFor(summary: Fixtures.Summary(
            keyName: "", keyPrefix: "vk_live_zz", quotaUsedPercent: 90));

        var alerts = UsageEvaluator.Evaluate(usage, nowMs: Now);

        Assert.Equal([AlertKind.Quota], Kinds(alerts));
        Assert.Equal("vk_live_zz", alerts[0].KeyName);
    }

    // MARK: - Errors

    [Fact]
    public void Error_rate_above_threshold_raises()
    {
        var usage = UsageFor(summary: Fixtures.Summary(totalRequests: 100, errorCount: 15));

        var alerts = UsageEvaluator.Evaluate(usage, nowMs: Now);

        Assert.Equal([AlertKind.Errors], Kinds(alerts));
        Assert.Equal(15, alerts[0].ErrorCount);
        Assert.Equal(100, alerts[0].TotalRequests);
        Assert.Equal($"ERRORS:k1:{Now / SixHours}", alerts[0].DedupeKey);
    }

    [Fact]
    public void Error_rate_below_threshold_stays_silent()
    {
        var usage = UsageFor(summary: Fixtures.Summary(totalRequests: 100, errorCount: 5));

        Assert.Empty(UsageEvaluator.Evaluate(usage, nowMs: Now));
    }

    [Fact]
    public void Too_little_traffic_is_noise_not_signal()
    {
        // 5 requests, all failed = 100% on a single flaky call.
        var usage = UsageFor(summary: Fixtures.Summary(totalRequests: 5, errorCount: 5));

        Assert.Empty(UsageEvaluator.Evaluate(usage, nowMs: Now));
    }

    [Fact]
    public void Zero_requests_cannot_divide_by_zero()
    {
        var usage = UsageFor(summary: Fixtures.Summary(totalRequests: 0, errorCount: 3));

        Assert.Empty(UsageEvaluator.Evaluate(usage, nowMs: Now));
    }

    // MARK: - Throttling

    [Fact]
    public void Throttle_rate_above_threshold_raises()
    {
        var usage = UsageFor(summary: Fixtures.Summary(totalRequests: 100, throttledRequests: 12));

        var alerts = UsageEvaluator.Evaluate(usage, nowMs: Now);

        Assert.Equal([AlertKind.Throttled], Kinds(alerts));
        Assert.Equal(12, alerts[0].ThrottledCount);
    }

    [Fact]
    public void Throttle_rate_below_threshold_stays_silent()
    {
        var usage = UsageFor(summary: Fixtures.Summary(totalRequests: 100, throttledRequests: 9));

        Assert.Empty(UsageEvaluator.Evaluate(usage, nowMs: Now));
    }

    // MARK: - Combining and ordering

    [Fact]
    public void Quota_and_errors_raise_together_in_a_stable_order()
    {
        var usage = UsageFor(summary: Fixtures.Summary(
            totalRequests: 100, errorCount: 20, quotaUsedPercent: 90));

        Assert.Equal([AlertKind.Quota, AlertKind.Errors],
                     Kinds(UsageEvaluator.Evaluate(usage, nowMs: Now)));
    }

    // MARK: - Deduplication

    [Fact]
    public void Dedupe_key_stays_stable_inside_a_window()
    {
        var usage = UsageFor(summary: Fixtures.Summary(quotaUsedPercent: 90));

        var first = UsageEvaluator.Evaluate(usage, nowMs: Now);
        var second = UsageEvaluator.Evaluate(usage, nowMs: Now + 60_000);

        // The key is a window bucket, not a timestamp.
        Assert.Equal(first.Select(a => a.DedupeKey), second.Select(a => a.DedupeKey));
    }

    [Fact]
    public void Second_evaluation_inside_the_window_is_silent()
    {
        var usage = UsageFor(summary: Fixtures.Summary(quotaUsedPercent: 90));
        var store = new InMemorySessionStore();

        UsageEvaluator.EvaluateAndRecord(usage, store, nowMs: Now);
        var again = UsageEvaluator.EvaluateAndRecord(usage, store, nowMs: Now + 1000);

        Assert.Empty(again); // already announced in this window
    }

    [Fact]
    public void A_new_window_announces_again()
    {
        var usage = UsageFor(summary: Fixtures.Summary(quotaUsedPercent: 90));
        var store = new InMemorySessionStore();

        var first = UsageEvaluator.EvaluateAndRecord(usage, store, nowMs: Now);
        var later = UsageEvaluator.EvaluateAndRecord(usage, store, nowMs: Now + SixHours);

        Assert.Single(first);
        Assert.Single(later); // six hours later it is news again
        Assert.NotEqual(first[0].DedupeKey, later[0].DedupeKey);
    }

    [Fact]
    public void Evaluate_and_record_persists_every_key()
    {
        var usage = UsageFor(summary: Fixtures.Summary(
            totalRequests: 100, errorCount: 50, quotaUsedPercent: 99));
        var store = new InMemorySessionStore();

        var raised = UsageEvaluator.EvaluateAndRecord(usage, store, nowMs: Now);

        Assert.Equal(2, raised.Count);
        foreach (var alert in raised)
            Assert.True(store.HasSeen(alert.DedupeKey), alert.DedupeKey);
    }

    // MARK: - Threshold configuration

    [Fact]
    public void Out_of_range_settings_are_clamped_not_trusted()
    {
        var thresholds = new AlertThresholds(
            quotaPercent: 0,
            minRequests: -5,
            errorRatePercent: -1,
            throttledRatePercent: -2,
            dedupeWindowMs: 0);

        Assert.Equal(1, thresholds.QuotaPercent); // 0% would fire on every key, always
        Assert.Equal(1, thresholds.MinRequests);
        Assert.Equal(0, thresholds.ErrorRatePercent);
        Assert.Equal(0, thresholds.ThrottledRatePercent);
        Assert.Equal(1, thresholds.DedupeWindowMs); // 0 would divide the clock by zero

        var generous = new AlertThresholds(quotaPercent: 1000, minRequests: 0);
        Assert.Equal(100, generous.QuotaPercent);
        Assert.Equal(1, generous.MinRequests);
    }

    [Fact]
    public void A_stricter_custom_threshold_is_honoured()
    {
        var usage = UsageFor(summary: Fixtures.Summary(quotaUsedPercent: 50));

        var strict = new AlertThresholds(quotaPercent: 50);
        Assert.Equal([AlertKind.Quota], Kinds(UsageEvaluator.Evaluate(usage, strict, Now)));
        // The default 80% threshold still stays quiet at 50%.
        Assert.Empty(UsageEvaluator.Evaluate(usage, nowMs: Now));
    }
}
