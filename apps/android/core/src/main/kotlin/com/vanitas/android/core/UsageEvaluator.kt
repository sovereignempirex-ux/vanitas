package com.vanitas.android.core

/**
 * What the app decides to tell the user about, decided here — not in a
 * Service or a Worker — so it is testable without an Android device.
 *
 * Inputs are the real numbers the gateway reports (see `src/server/db.ts`):
 * `quotaUsedPercent` and `successRate` are 0..100, `totalRequests` /
 * `errorCount` / `throttledRequests` are counts for the selected window.
 */
enum class AlertKind { QUOTA, ERRORS, THROTTLED }

data class UsageAlert(
    val kind: AlertKind,
    val keyId: String,
    val keyName: String,
    val period: String,
    /** Supplied to the store so the same condition is not announced twice. */
    val dedupeKey: String,
    val quotaPercent: Int = 0,
    val totalRequests: Int = 0,
    val errorCount: Int = 0,
    val throttledCount: Int = 0,
)

data class AlertThresholds(
    /** Warn once a key's monthly quota reaches this percent (1..100). */
    val quotaPercent: Int = 80,
    /** Below this much traffic an error/throttle ratio is noise, not a signal. */
    val minRequests: Int = 20,
    /** errorCount / totalRequests, in percent. */
    val errorRatePercent: Double = 10.0,
    /** 429s / totalRequests, in percent. */
    val throttledRatePercent: Double = 10.0,
    /** Same key + same kind is announced at most once per this window. */
    val dedupeWindowMs: Long = 6 * 60 * 60 * 1000L,
) {
    init {
        require(quotaPercent in 1..100) { "quotaPercent must be 1..100" }
        require(minRequests >= 1) { "minRequests must be >= 1" }
        require(errorRatePercent >= 0.0 && throttledRatePercent >= 0.0) { "rates must be >= 0" }
        require(dedupeWindowMs > 0) { "dedupeWindowMs must be > 0" }
    }
}

object UsageEvaluator {

    /**
     * @param nowMs    injectable clock, so the dedupe window is deterministic in tests
     * @param hasSeen  reports whether a dedupe key was already announced
     * @return alerts to raise, in a stable order (quota, errors, throttled — per key)
     */
    fun evaluate(
        usage: UsageAnalytics,
        thresholds: AlertThresholds = AlertThresholds(),
        nowMs: Long,
        hasSeen: (String) -> Boolean = { false },
    ): List<UsageAlert> {
        // Bucketing by window (not by "have I ever said it") lets a condition
        // that recurs six hours later be announced again.
        val slot = nowMs / thresholds.dedupeWindowMs
        val alerts = mutableListOf<UsageAlert>()

        for (summary in usage.summaries) {
            fun raise(kind: AlertKind, quota: Int = 0, errors: Int = 0, throttled: Int = 0) {
                val dedupeKey = "$kind:${summary.keyId}:$slot"
                if (hasSeen(dedupeKey)) return
                alerts += UsageAlert(
                    kind = kind,
                    keyId = summary.keyId,
                    keyName = summary.keyName.ifBlank { summary.keyPrefix },
                    period = usage.period,
                    dedupeKey = dedupeKey,
                    quotaPercent = quota,
                    totalRequests = summary.totalRequests,
                    errorCount = errors,
                    throttledCount = throttled,
                )
            }

            // A configured quota can be consumed by traffic this device never
            // saw, so this one fires regardless of the request count.
            if (summary.quotaUsedPercent >= thresholds.quotaPercent) {
                raise(AlertKind.QUOTA, quota = summary.quotaUsedPercent.toInt())
            }

            if (summary.totalRequests >= thresholds.minRequests) {
                val errorRate = summary.errorCount * 100.0 / summary.totalRequests
                if (errorRate >= thresholds.errorRatePercent) {
                    raise(AlertKind.ERRORS, errors = summary.errorCount)
                }
                val throttleRate = summary.throttledRequests * 100.0 / summary.totalRequests
                if (throttleRate >= thresholds.throttledRatePercent) {
                    raise(AlertKind.THROTTLED, throttled = summary.throttledRequests)
                }
            }
        }

        return alerts
    }

    /**
     * Same decision, plus persistence: everything returned here is recorded in
     * [store] before the caller posts it, so a second run inside the same
     * window stays silent even across process restarts.
     */
    fun evaluateAndRecord(
        usage: UsageAnalytics,
        thresholds: AlertThresholds = AlertThresholds(),
        store: SessionStore,
        nowMs: Long,
    ): List<UsageAlert> {
        val fresh = evaluate(usage, thresholds, nowMs) { store.hasSeen(it) }
        fresh.forEach { store.markSeen(it.dedupeKey) }
        return fresh
    }
}
