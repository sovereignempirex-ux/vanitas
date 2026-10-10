import XCTest

import Foundation
import VanitasCore

/// The alert rules, decided here rather than in a view or a background task.
/// Every case is fed by fixtures shaped exactly like the gateway's own
/// `UsageAnalytics`, so a contract change shows up as a failure here first.
final class UsageEvaluatorTests: XCTestCase {

    /// A pinned clock: the dedupe window is a pure function of it.
    private let now: Int64 = 1_700_000_000_000
    private let sixHours: Int64 = 6 * 60 * 60 * 1000

    /// Named `…Fixture`, not `usage`: `let usage = try usage(…)` would refer
    /// to the local before it exists.
    private func usageFixture(
        period: String = "24h",
        _ summary: [String: Any]
    ) throws -> UsageAnalytics {
        try decode(UsageAnalytics.self, from: usageJSON(period: period, summaries: [summary]))
    }

    // MARK: - Quota

    func testQuotaAtThresholdRaises() throws {
        let usage = try usageFixture(summaryJSON(quotaUsedPercent: 80))

        let alerts = UsageEvaluator.evaluate(usage: usage, nowMs: now)

        XCTAssertEqual(alerts.count, 1)
        XCTAssertEqual(alerts[0].kind, .quota)
        XCTAssertEqual(alerts[0].quotaPercent, 80)
        XCTAssertEqual(alerts[0].keyId, "k1")
        XCTAssertEqual(alerts[0].keyName, "Prod")
        XCTAssertEqual(alerts[0].period, "24h")
        XCTAssertEqual(alerts[0].dedupeKey, "QUOTA:k1:\(now / sixHours)")
    }

    func testQuotaJustBelowThresholdStaysSilent() throws {
        let usage = try usageFixture(summaryJSON(quotaUsedPercent: 79.9))

        XCTAssertTrue(UsageEvaluator.evaluate(usage: usage, nowMs: now).isEmpty)
    }

    func testQuotaFiresEvenWithNoRequestsThisWindow() throws {
        // A quota can be consumed by traffic this device never saw, so this
        // one deliberately ignores the request-count gate.
        let usage = try usageFixture(summaryJSON(totalRequests: 0, quotaUsedPercent: 95))

        let alerts = UsageEvaluator.evaluate(usage: usage, nowMs: now)
        XCTAssertEqual(alerts.map(\.kind), [.quota])
    }

    func testMissingNameFallsBackToPrefix() throws {
        // A configured quota guarantees an alert fires — without it
        // `alerts.first` is nil and this proves nothing. (Found by the C#
        // twin in `apps/desktop`, whose runner is the first to execute.)
        let usage = try usageFixture(summaryJSON(keyName: "", keyPrefix: "vk_live_zz",
                                                 quotaUsedPercent: 90))

        let alerts = UsageEvaluator.evaluate(usage: usage, nowMs: now)

        XCTAssertEqual(alerts.count, 1)
        XCTAssertEqual(alerts.first?.keyName, "vk_live_zz")
    }

    // MARK: - Errors

    func testErrorRateAboveThresholdRaises() throws {
        let usage = try usageFixture(summaryJSON(totalRequests: 100, errorCount: 15))

        let alerts = UsageEvaluator.evaluate(usage: usage, nowMs: now)

        XCTAssertEqual(alerts.map(\.kind), [.errors])
        XCTAssertEqual(alerts[0].errorCount, 15)
        XCTAssertEqual(alerts[0].totalRequests, 100)
        XCTAssertEqual(alerts[0].dedupeKey, "ERRORS:k1:\(now / sixHours)")
    }

    func testErrorRateBelowThresholdStaysSilent() throws {
        let usage = try usageFixture(summaryJSON(totalRequests: 100, errorCount: 5))

        XCTAssertTrue(UsageEvaluator.evaluate(usage: usage, nowMs: now).isEmpty)
    }

    func testTooLittleTrafficIsNoiseNotSignal() throws {
        // 5 requests, all failed = 100% on a single flaky call.
        let usage = try usageFixture(summaryJSON(totalRequests: 5, errorCount: 5))

        XCTAssertTrue(UsageEvaluator.evaluate(usage: usage, nowMs: now).isEmpty)
    }

    func testZeroRequestsCannotDivideByZero() throws {
        let usage = try usageFixture(summaryJSON(totalRequests: 0, errorCount: 3))

        XCTAssertTrue(UsageEvaluator.evaluate(usage: usage, nowMs: now).isEmpty)
    }

    // MARK: - Throttling

    func testThrottleRateAboveThresholdRaises() throws {
        let usage = try usageFixture(summaryJSON(totalRequests: 100, throttledRequests: 12))

        let alerts = UsageEvaluator.evaluate(usage: usage, nowMs: now)
        XCTAssertEqual(alerts.map(\.kind), [.throttled])
        XCTAssertEqual(alerts[0].throttledCount, 12)
    }

    func testThrottleRateBelowThresholdStaysSilent() throws {
        let usage = try usageFixture(summaryJSON(totalRequests: 100, throttledRequests: 9))

        XCTAssertTrue(UsageEvaluator.evaluate(usage: usage, nowMs: now).isEmpty)
    }

    // MARK: - Combining and ordering

    func testQuotaAndErrorsRaiseTogetherInAStableOrder() throws {
        let usage = try usageFixture(summaryJSON(totalRequests: 100, errorCount: 20,
                                          quotaUsedPercent: 90))

        let alerts = UsageEvaluator.evaluate(usage: usage, nowMs: now)

        XCTAssertEqual(alerts.map(\.kind), [.quota, .errors])
    }

    // MARK: - Deduplication

    func testDedupeKeyStaysStableInsideAWindow() throws {
        let usage = try usageFixture(summaryJSON(quotaUsedPercent: 90))

        let first = UsageEvaluator.evaluate(usage: usage, nowMs: now)
        let second = UsageEvaluator.evaluate(usage: usage, nowMs: now + 60_000)

        XCTAssertEqual(first.map(\.dedupeKey), second.map(\.dedupeKey),
                       "the key is a window bucket, not a timestamp")
    }

    func testSecondEvaluationInsideTheWindowIsSilent() throws {
        let usage = try usageFixture(summaryJSON(quotaUsedPercent: 90))
        let store = InMemorySessionStore()

        UsageEvaluator.evaluateAndRecord(usage: usage, store: store, nowMs: now)
        let again = UsageEvaluator.evaluateAndRecord(usage: usage, store: store, nowMs: now + 1000)

        XCTAssertTrue(again.isEmpty, "already announced in this window")
    }

    func testANewWindowAnnouncesAgain() throws {
        let usage = try usageFixture(summaryJSON(quotaUsedPercent: 90))
        let store = InMemorySessionStore()

        let first = UsageEvaluator.evaluateAndRecord(usage: usage, store: store, nowMs: now)
        let later = UsageEvaluator.evaluateAndRecord(usage: usage, store: store,
                                                     nowMs: now + sixHours)

        XCTAssertEqual(first.count, 1)
        XCTAssertEqual(later.count, 1, "six hours later it is news again")
        XCTAssertNotEqual(first[0].dedupeKey, later[0].dedupeKey)
    }

    func testEvaluateAndRecordPersistsEveryKey() throws {
        let usage = try usageFixture(summaryJSON(totalRequests: 100, errorCount: 50,
                                          quotaUsedPercent: 99))
        let store = InMemorySessionStore()

        let raised = UsageEvaluator.evaluateAndRecord(usage: usage, store: store, nowMs: now)

        XCTAssertEqual(raised.count, 2)
        for alert in raised {
            XCTAssertTrue(store.hasSeen(alert.dedupeKey))
        }
    }

    // MARK: - Threshold configuration

    func testOutOfRangeSettingsAreClampedNotTrusted() {
        let thresholds = AlertThresholds(
            quotaPercent: 0,
            minRequests: -5,
            errorRatePercent: -1,
            throttledRatePercent: -2,
            dedupeWindowMs: 0
        )

        XCTAssertEqual(thresholds.quotaPercent, 1, "0% would fire on every key, always")
        XCTAssertEqual(thresholds.minRequests, 1)
        XCTAssertEqual(thresholds.errorRatePercent, 0)
        XCTAssertEqual(thresholds.throttledRatePercent, 0)
        XCTAssertEqual(thresholds.dedupeWindowMs, 1, "0 would divide the clock by zero")

        let generous = AlertThresholds(quotaPercent: 1000, minRequests: 0)
        XCTAssertEqual(generous.quotaPercent, 100)
        XCTAssertEqual(generous.minRequests, 1)
    }

    func testAStricterCustomThresholdIsHonoured() throws {
        let usage = try usageFixture(summaryJSON(quotaUsedPercent: 50))

        let strict = AlertThresholds(quotaPercent: 50)
        XCTAssertEqual(UsageEvaluator.evaluate(usage: usage, thresholds: strict,
                                               nowMs: now).map(\.kind), [.quota])
        XCTAssertTrue(UsageEvaluator.evaluate(usage: usage, nowMs: now).isEmpty,
                      "the default 80% threshold still stays quiet at 50%")
    }
}
