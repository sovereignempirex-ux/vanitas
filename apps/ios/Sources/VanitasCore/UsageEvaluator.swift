import Foundation

/// What the app decides to tell the user about — decided here, not in a view
/// or a background task, so it is testable without a simulator.
///
/// Inputs are the real numbers the gateway reports (see `src/server/db.ts`):
/// `quotaUsedPercent` and `successRate` are 0…100, while `totalRequests`,
/// `errorCount` and `throttledRequests` are counts for the selected window.
public enum AlertKind: String, Sendable, CaseIterable {
    case quota = "QUOTA"
    case errors = "ERRORS"
    case throttled = "THROTTLED"
}

public struct UsageAlert: Equatable, Sendable {
    public let kind: AlertKind
    public let keyId: String
    public let keyName: String
    public let period: String
    /// Supplied to the store so the same condition is not announced twice.
    public let dedupeKey: String
    public let quotaPercent: Int
    public let totalRequests: Int
    public let errorCount: Int
    public let throttledCount: Int
}

public struct AlertThresholds: Equatable, Sendable {
    /// Warn once a key's monthly quota reaches this percent (1…100).
    public let quotaPercent: Int
    /// Below this much traffic an error/throttle ratio is noise, not a signal.
    public let minRequests: Int
    /// `errorCount / totalRequests`, in percent.
    public let errorRatePercent: Double
    /// `429s / totalRequests`, in percent.
    public let throttledRatePercent: Double
    /// Same key + same kind is announced at most once per this window.
    public let dedupeWindowMs: Int64

    public init(
        quotaPercent: Int = 80,
        minRequests: Int = 20,
        errorRatePercent: Double = 10.0,
        throttledRatePercent: Double = 10.0,
        dedupeWindowMs: Int64 = 6 * 60 * 60 * 1000
    ) {
        // Clamped, never thrown: a mistyped preference must not crash the app
        // and must never leave alerting switched off. (The Kotlin twin in
        // apps/android rejects out-of-range values with `require` — a
        // deliberate platform difference, both are covered by tests.)
        self.quotaPercent = min(max(quotaPercent, 1), 100)
        self.minRequests = max(minRequests, 1)
        self.errorRatePercent = max(errorRatePercent, 0)
        self.throttledRatePercent = max(throttledRatePercent, 0)
        self.dedupeWindowMs = max(dedupeWindowMs, 1)
    }
}

public enum UsageEvaluator {

    /// - Parameters:
    ///   - nowMs: injectable clock, so the dedupe window is deterministic in tests.
    ///   - hasSeen: reports whether a dedupe key was already announced.
    /// - Returns: alerts to raise, in a stable order (quota, errors, throttled — per key).
    public static func evaluate(
        usage: UsageAnalytics,
        thresholds: AlertThresholds = AlertThresholds(),
        nowMs: Int64,
        hasSeen: (String) -> Bool = { _ in false }
    ) -> [UsageAlert] {
        // Bucketing by window (rather than "have I ever said it") lets a
        // condition that recurs six hours later be announced again.
        let slot = nowMs / thresholds.dedupeWindowMs
        var alerts: [UsageAlert] = []

        for summary in usage.summaries {
            func raise(_ kind: AlertKind, quota: Int = 0, errors: Int = 0, throttled: Int = 0) {
                let dedupeKey = "\(kind.rawValue):\(summary.keyId):\(slot)"
                if hasSeen(dedupeKey) { return }
                alerts.append(
                    UsageAlert(
                        kind: kind,
                        keyId: summary.keyId,
                        keyName: summary.keyName.isEmpty ? summary.keyPrefix : summary.keyName,
                        period: usage.period,
                        dedupeKey: dedupeKey,
                        quotaPercent: quota,
                        totalRequests: summary.totalRequests,
                        errorCount: errors,
                        throttledCount: throttled
                    )
                )
            }

            // A configured quota can be consumed by traffic this device never
            // saw, so this one fires regardless of the request count.
            if summary.quotaUsedPercent >= Double(thresholds.quotaPercent) {
                raise(.quota, quota: Int(summary.quotaUsedPercent))
            }

            if summary.totalRequests >= thresholds.minRequests {
                let errorRate = Double(summary.errorCount) * 100.0 / Double(summary.totalRequests)
                if errorRate >= thresholds.errorRatePercent {
                    raise(.errors, errors: summary.errorCount)
                }
                let throttleRate = Double(summary.throttledRequests) * 100.0 / Double(summary.totalRequests)
                if throttleRate >= thresholds.throttledRatePercent {
                    raise(.throttled, throttled: summary.throttledRequests)
                }
            }
        }

        return alerts
    }

    /// Same decision, plus persistence: everything returned here is recorded in
    /// [store] before the caller posts it, so a second run inside the same
    /// window stays silent even across relaunches.
    @discardableResult
    public static func evaluateAndRecord(
        usage: UsageAnalytics,
        thresholds: AlertThresholds = AlertThresholds(),
        store: SessionStore,
        nowMs: Int64
    ) -> [UsageAlert] {
        let fresh = evaluate(usage: usage, thresholds: thresholds, nowMs: nowMs) {
            store.hasSeen($0)
        }
        fresh.forEach { store.markSeen($0.dedupeKey) }
        return fresh
    }
}
