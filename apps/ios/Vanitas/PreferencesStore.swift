import Combine
import Foundation

/// `SessionStore` backed by `UserDefaults`: a signed-in user stays signed in,
/// and the alert history survives a relaunch (otherwise every cold start would
/// re-announce the same quota warning).
///
/// Deliberately not `@MainActor`-annotated: the evaluator and the background
/// refresh task read it from off the main thread, and `UserDefaults` is
/// thread-safe. Views only ever *observe* it through `AppEnvironment`.
final class PreferencesStore: ObservableObject, SessionStore {
    private let defaults: UserDefaults

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
    }

    var token: String? {
        get { defaults.string(forKey: Keys.token) }
        set {
            defaults.set(newValue, forKey: Keys.token)
            objectWillChange.send()
        }
    }

    var serverURL: String {
        get { defaults.string(forKey: Keys.serverURL) ?? InMemorySessionStore.defaultServerURL }
        set {
            defaults.set(newValue, forKey: Keys.serverURL)
            objectWillChange.send()
        }
    }

    var notificationsEnabled: Bool {
        get { defaults.object(forKey: Keys.notificationsEnabled) as? Bool ?? true }
        set {
            defaults.set(newValue, forKey: Keys.notificationsEnabled)
            objectWillChange.send()
        }
    }

    var quotaThresholdPercent: Int {
        get { defaults.object(forKey: Keys.quotaThreshold) as? Int ?? 80 }
        set {
            // The evaluator clamps too, but storing a sane number keeps the
            // slider and the rule talking about the same thing.
            defaults.set(min(max(newValue, 1), 100), forKey: Keys.quotaThreshold)
            objectWillChange.send()
        }
    }

    // MARK: - Alert history

    func hasSeen(_ dedupeKey: String) -> Bool {
        seenKeys.contains(dedupeKey)
    }

    func markSeen(_ dedupeKey: String) {
        guard !seenKeys.contains(dedupeKey) else { return }
        var next = seenKeys
        next.append(dedupeKey)
        while next.count > Self.maxSeen {
            next.removeFirst()
        }
        defaults.set(next, forKey: Keys.seen)
    }

    func clearSeen() {
        defaults.set([String](), forKey: Keys.seen)
    }

    /// Sign-out drops the token *and* the history: the next account on this
    /// phone must not inherit someone else's alerts.
    func clearSession() {
        token = nil
        clearSeen()
        objectWillChange.send()
    }

    private var seenKeys: [String] {
        defaults.stringArray(forKey: Keys.seen) ?? []
    }

    private enum Keys {
        static let token = "vanitas.token"
        static let serverURL = "vanitas.serverURL"
        static let notificationsEnabled = "vanitas.notificationsEnabled"
        static let quotaThreshold = "vanitas.quotaThresholdPercent"
        static let seen = "vanitas.seenAlerts"
    }

    private static let maxSeen = 500
}
