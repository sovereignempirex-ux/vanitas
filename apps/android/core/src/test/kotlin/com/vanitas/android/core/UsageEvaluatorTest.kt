package com.vanitas.android.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class UsageEvaluatorTest {

    private fun summary(
        keyId: String = "k1",
        keyName: String = "Prod",
        keyPrefix: String = "vk_live_",
        totalRequests: Int = 100,
        successRate: Double = 100.0,
        throttledRequests: Int = 0,
        errorCount: Int = 0,
        quotaUsedPercent: Double = 0.0,
    ) = UsageSummary(
        keyId = keyId,
        keyName = keyName,
        keyPrefix = keyPrefix,
        totalRequests = totalRequests,
        successRate = successRate,
        throttledRequests = throttledRequests,
        errorCount = errorCount,
        quotaUsedPercent = quotaUsedPercent,
    )

    private fun usage(vararg summaries: UsageSummary, period: String = "24h") =
        UsageAnalytics(period = period, summaries = summaries.toList())

    private val now = 1_700_000_000_000L
    private val sixHours = 6 * 60 * 60 * 1000L

    // ------------------------------------------------------------------ quota

    @Test
    fun `quota alert fires once the threshold is reached`() {
        val alerts = UsageEvaluator.evaluate(
            usage(summary(quotaUsedPercent = 80.0)),
            AlertThresholds(quotaPercent = 80),
            nowMs = now,
        )

        assertEquals(1, alerts.size)
        val alert = alerts.single()
        assertEquals(AlertKind.QUOTA, alert.kind)
        assertEquals(80, alert.quotaPercent)
        assertEquals("Prod", alert.keyName)
        assertEquals("QUOTA:k1:${now / sixHours}", alert.dedupeKey)
    }

    @Test
    fun `quota below the threshold stays silent`() {
        val alerts = UsageEvaluator.evaluate(
            usage(summary(quotaUsedPercent = 79.0)),
            AlertThresholds(quotaPercent = 80),
            nowMs = now,
        )

        assertTrue(alerts.isEmpty())
    }

    @Test
    fun `quota alert fires even with zero traffic on this device`() {
        val alerts = UsageEvaluator.evaluate(
            usage(summary(totalRequests = 0, successRate = 0.0, quotaUsedPercent = 95.0)),
            nowMs = now,
        )

        assertEquals(listOf(AlertKind.QUOTA), alerts.map { it.kind })
        assertEquals(95, alerts.single().quotaPercent)
    }

    // ----------------------------------------------------------------- errors

    @Test
    fun `error rate at or above the threshold raises an alert`() {
        val alerts = UsageEvaluator.evaluate(
            usage(summary(totalRequests = 100, errorCount = 10, successRate = 90.0)),
            nowMs = now,
        )

        assertEquals(listOf(AlertKind.ERRORS), alerts.map { it.kind })
        assertEquals(10, alerts.single().errorCount)
    }

    @Test
    fun `a single failure in light traffic is noise`() {
        val alerts = UsageEvaluator.evaluate(
            usage(summary(totalRequests = 5, errorCount = 2, successRate = 60.0)),
            nowMs = now,
        )

        assertTrue(alerts.isEmpty())
    }

    @Test
    fun `error rate under the threshold stays silent`() {
        val alerts = UsageEvaluator.evaluate(
            usage(summary(totalRequests = 1000, errorCount = 9, successRate = 99.1)),
            nowMs = now,
        )

        assertTrue(alerts.isEmpty())
    }

    // -------------------------------------------------------------- throttled

    @Test
    fun `throttling at or above the threshold raises an alert`() {
        val alerts = UsageEvaluator.evaluate(
            usage(summary(totalRequests = 100, throttledRequests = 15, successRate = 85.0)),
            nowMs = now,
        )

        assertEquals(listOf(AlertKind.THROTTLED), alerts.map { it.kind })
        assertEquals(15, alerts.single().throttledCount)
    }

    @Test
    fun `a key can raise several kinds at once, in a stable order`() {
        val alerts = UsageEvaluator.evaluate(
            usage(
                summary(
                    totalRequests = 100,
                    errorCount = 30,
                    throttledRequests = 30,
                    successRate = 40.0,
                    quotaUsedPercent = 90.0,
                ),
            ),
            nowMs = now,
        )

        assertEquals(listOf(AlertKind.QUOTA, AlertKind.ERRORS, AlertKind.THROTTLED), alerts.map { it.kind })
    }

    @Test
    fun `summaries without a name fall back to the key prefix`() {
        val alerts = UsageEvaluator.evaluate(
            usage(summary(keyName = "", quotaUsedPercent = 100.0)),
            nowMs = now,
        )

        assertEquals("vk_live_", alerts.single().keyName)
    }

    // ---------------------------------------------------------------- dedupe

    @Test
    fun `the same condition is announced once per window`() {
        val usage = usage(summary(quotaUsedPercent = 90.0))
        val seen = mutableSetOf<String>()

        val first = UsageEvaluator.evaluate(usage, AlertThresholds(), nowMs = now) { it in seen }
        seen += first.map { it.dedupeKey }
        val second = UsageEvaluator.evaluate(usage, AlertThresholds(), nowMs = now) { it in seen }

        assertEquals(1, first.size)
        assertTrue(second.isEmpty())
    }

    @Test
    fun `a condition that recurs after the window is announced again`() {
        val usage = usage(summary(quotaUsedPercent = 90.0))
        val seen = mutableSetOf<String>()

        val first = UsageEvaluator.evaluate(usage, AlertThresholds(), nowMs = now) { it in seen }
        seen += first.map { it.dedupeKey }

        val later = UsageEvaluator.evaluate(
            usage,
            AlertThresholds(),
            nowMs = now + sixHours,
        ) { it in seen }

        assertEquals(1, later.size)
        assertTrue(later.single().dedupeKey != first.single().dedupeKey)
    }

    @Test
    fun `evaluateAndRecord persists what it announced`() {
        val store = InMemorySessionStore()
        val payload = usage(summary(quotaUsedPercent = 85.0))

        val first = UsageEvaluator.evaluateAndRecord(payload, store = store, nowMs = now)
        val second = UsageEvaluator.evaluateAndRecord(payload, store = store, nowMs = now)

        assertEquals(1, first.size)
        assertTrue(second.isEmpty())
        assertTrue(store.hasSeen(first.single().dedupeKey))
    }

    @Test
    fun `signing out clears the announcement history`() {
        val store = InMemorySessionStore()
        val payload = usage(summary(quotaUsedPercent = 85.0))

        UsageEvaluator.evaluateAndRecord(payload, store = store, nowMs = now)
        store.clearSession()

        val afterSignOut = UsageEvaluator.evaluateAndRecord(payload, store = store, nowMs = now)
        assertEquals(1, afterSignOut.size)
    }

    // ------------------------------------------------------------- thresholds

    @Test
    fun `thresholds can be tuned by the settings screen`() {
        val alerts = UsageEvaluator.evaluate(
            usage(summary(totalRequests = 100, errorCount = 3, successRate = 97.0)),
            AlertThresholds(errorRatePercent = 2.0, minRequests = 50),
            nowMs = now,
        )

        assertEquals(listOf(AlertKind.ERRORS), alerts.map { it.kind })
    }

    @Test(expected = IllegalArgumentException::class)
    fun `an impossible quota threshold is rejected`() {
        AlertThresholds(quotaPercent = 0)
    }

    @Test(expected = IllegalArgumentException::class)
    fun `a non-positive dedupe window is rejected`() {
        AlertThresholds(dedupeWindowMs = 0)
    }

    @Test
    fun `no summaries means no alerts`() {
        assertTrue(UsageEvaluator.evaluate(UsageAnalytics(), nowMs = now).isEmpty())
    }
}
