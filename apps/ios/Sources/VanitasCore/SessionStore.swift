import Foundation

/// Where the app keeps its session and preferences.
///
/// Declared as a protocol in `VanitasCore` so the client, the evaluator and
/// their tests never touch UIKit; the SwiftUI shell supplies a `UserDefaults`
/// implementation, and the tests use `InMemorySessionStore`.
public protocol SessionStore: AnyObject {
    /// Session token from `POST /auth/login`; `nil` means signed out.
    var token: String? { get set }

    /// Gateway origin without a trailing slash (the default points at the
    /// host machine, which is what the iOS simulator reaches).
    var serverURL: String { get set }

    var notificationsEnabled: Bool { get set }

    /// Warn once a key's monthly quota reaches this percentage.
    var quotaThresholdPercent: Int { get set }

    /// True when this exact alert was already raised (see `UsageAlert.dedupeKey`).
    func hasSeen(_ dedupeKey: String) -> Bool

    func markSeen(_ dedupeKey: String)

    func clearSeen()

    /// Drops the token AND the alert history — used by sign-out.
    func clearSession()
}

/// A store that forgets everything on process death — what the tests use.
public final class InMemorySessionStore: SessionStore {
    private var seen: [String] = []

    public var token: String?
    public var serverURL: String
    public var notificationsEnabled: Bool
    public var quotaThresholdPercent: Int

    public init(
        serverURL: String = InMemorySessionStore.defaultServerURL,
        token: String? = nil,
        notificationsEnabled: Bool = true,
        quotaThresholdPercent: Int = 80
    ) {
        self.serverURL = serverURL
        self.token = token
        self.notificationsEnabled = notificationsEnabled
        self.quotaThresholdPercent = quotaThresholdPercent
    }

    public func hasSeen(_ dedupeKey: String) -> Bool {
        seen.contains(dedupeKey)
    }

    public func markSeen(_ dedupeKey: String) {
        guard !seen.contains(dedupeKey) else { return }
        seen.append(dedupeKey)
        // Bounded so a long-lived process cannot grow this array forever.
        while seen.count > Self.maxSeen {
            seen.removeFirst()
        }
    }

    public func clearSeen() {
        seen.removeAll()
    }

    public func clearSession() {
        token = nil
        seen.removeAll()
    }

    /// The simulator reaches the developer's machine through `localhost`, so
    /// `npm run dev` on the Mac works out of the box; a real device overrides
    /// it in Settings (and needs HTTPS — see `Info.plist`).
    public static let defaultServerURL = "http://localhost:3000"
    private static let maxSeen = 500
}
