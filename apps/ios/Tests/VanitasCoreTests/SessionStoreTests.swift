import XCTest

import Foundation
import VanitasCore

final class SessionStoreTests: XCTestCase {

    func testDefaultsPointAtTheDevelopersMachine() {
        let store = InMemorySessionStore()

        XCTAssertNil(store.token, "starting signed out is the safe default")
        XCTAssertEqual(store.serverURL, "http://localhost:3000",
                       "the simulator reaches the host through localhost")
        XCTAssertTrue(store.notificationsEnabled)
        XCTAssertEqual(store.quotaThresholdPercent, 80)
    }

    func testNothingIsSeenBeforeItIsAnnounced() {
        let store = InMemorySessionStore()

        XCTAssertFalse(store.hasSeen("QUOTA:k1:0"))
    }

    func testMarkingTwiceKeepsASingleEntry() {
        let store = InMemorySessionStore()

        store.markSeen("QUOTA:k1:708687")
        store.markSeen("QUOTA:k1:708687")

        XCTAssertTrue(store.hasSeen("QUOTA:k1:708687"))
    }

    func testClearSessionDropsTokenAndAlertHistory() {
        let store = InMemorySessionStore()
        store.token = "sess_1"
        store.markSeen("QUOTA:k1:708687")

        store.clearSession()

        XCTAssertNil(store.token)
        XCTAssertFalse(store.hasSeen("QUOTA:k1:708687"),
                       "the next account must not inherit stale alerts")
        XCTAssertEqual(store.serverURL, "http://localhost:3000",
                       "…while the server address is a device preference")
    }

    func testClearSeenKeepsTheSession() {
        let store = InMemorySessionStore()
        store.token = "sess_1"
        store.markSeen("ERRORS:k1:708687")

        store.clearSeen()

        XCTAssertEqual(store.token, "sess_1")
        XCTAssertFalse(store.hasSeen("ERRORS:k1:708687"))
    }

    func testHistoryIsBounded() {
        let store = InMemorySessionStore()

        for index in 0 ..< 600 {
            store.markSeen("K:\(index)")
        }

        XCTAssertFalse(store.hasSeen("K:0"), "the oldest entries are evicted")
        XCTAssertFalse(store.hasSeen("K:99"))
        XCTAssertTrue(store.hasSeen("K:599"), "the newest entries are kept")
    }

    func testPreferencesRoundTrip() {
        let store = InMemorySessionStore()

        store.serverURL = "https://api.example.com"
        store.notificationsEnabled = false
        store.quotaThresholdPercent = 55

        XCTAssertEqual(store.serverURL, "https://api.example.com")
        XCTAssertFalse(store.notificationsEnabled)
        XCTAssertEqual(store.quotaThresholdPercent, 55)
    }
}
