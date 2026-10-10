import Combine
import Foundation

/// The app's single source of truth: which session, which profile, which
/// usage window.
///
/// The *class* is deliberately not actor-isolated — views construct it while
/// they initialize, and a non-isolated type can be built from anywhere. Every
/// method that writes a `@Published` value is marked `@MainActor` instead, so
/// the mutations land on the thread SwiftUI draws from, and reading a value
/// from a view body carries no isolation requirement at all.
///
/// The transport, the store and the evaluator are plain types: they run
/// wherever the work happens.
final class AppEnvironment: ObservableObject {
    let store: PreferencesStore
    private let notifier: AlertPosting

    @Published private(set) var isSignedIn = false
    @Published var profile: UserProfile?
    @Published var permissions: [String] = []
    @Published var usage: UsageAnalytics?
    @Published var period: String = "24h"
    @Published var lastError: String?
    @Published var isBusy = false
    @Published var checkedAt: Date?

    private var cancellables = Set<AnyCancellable>()
    /// One session per server address: building a `URLSession` per request
    /// would leave an un-invalidated session behind every call.
    private var cachedClient: (address: String, client: VanitasClient)?

    init(store: PreferencesStore = PreferencesStore(), notifier: AlertPosting = Notifier()) {
        self.store = store
        self.notifier = notifier
        self.isSignedIn = store.token != nil

        // Preferences are written by the store but *observed* through this
        // object, so its changes have to be republished — otherwise a slider
        // in Settings would move without redrawing its own label.
        store.objectWillChange
            .sink { [weak self] _ in self?.objectWillChange.send() }
            .store(in: &cancellables)
    }

    /// Reading the token through the closure keeps every request on whatever
    /// session is current, without the client owning it.
    var client: VanitasClient {
        let address = store.serverURL
        if let cachedClient, cachedClient.address == address {
            return cachedClient.client
        }
        // Capture the store, not `self`: the client outlives a screen, and a
        // closure holding the environment would make client ⇄ environment a
        // retain cycle.
        let fresh = VanitasClient(
            baseURL: address,
            tokenProvider: { [prefs = store] in prefs.token }
        )
        cachedClient = (address, fresh)
        return fresh
    }

    // MARK: - Session

    @MainActor
    func completeSignIn(with session: LoginResponse) {
        store.token = session.token
        profile = session.user
        permissions = session.permissions
        isSignedIn = true
        lastError = nil
        if store.notificationsEnabled {
            notifier.requestAuthorization()
        }
    }

    @MainActor
    func signOut() async {
        // Best effort — the local session goes regardless of the answer.
        _ = await client.logout()
        signOutLocally()
    }

    /// Toggling notifications on asks for permission at that moment: an
    /// explanation precedes the system prompt, which is what the OS wants —
    /// and what earns a higher grant rate.
    ///
    /// Not main-actor isolated: it is called from a SwiftUI `Binding` setter,
    /// and everything it touches (`UserDefaults`, `UNUserNotificationCenter`)
    /// is thread-safe.
    func setNotifications(_ enabled: Bool) {
        store.notificationsEnabled = enabled
        guard enabled else { return }
        notifier.requestAuthorization()
    }

    @MainActor
    func signOutLocally() {
        store.clearSession()
        isSignedIn = false
        profile = nil
        permissions = []
        usage = nil
        checkedAt = nil
    }

    // MARK: - Loading

    /// Called once from the root view: restores a stored session.
    @MainActor
    func bootstrap() async {
        guard isSignedIn else { return }
        await refreshProfile()
        if usage == nil {
            await refreshUsage()
        }
    }

    /// Called whenever the app returns to the foreground.
    @MainActor
    func onForeground() async {
        guard isSignedIn else { return }
        if profile == nil {
            await refreshProfile()
        }
        await refreshUsage()
    }

    @MainActor
    func refreshProfile() async {
        do {
            let me = try await client.me()
            profile = me.user
            permissions = me.permissions
        } catch let error as VanitasError {
            handle(error)
        } catch {
            lastError = error.localizedDescription
        }
    }

    @MainActor
    func refreshUsage() async {
        guard !isBusy else { return }
        isBusy = true
        defer { isBusy = false }

        do {
            let result = try await client.usage(period)
            usage = result
            checkedAt = Date()
            raiseAlerts(for: result)
        } catch let error as VanitasError {
            handle(error)
        } catch {
            lastError = error.localizedDescription
        }
    }

    // MARK: - Alerts

    @MainActor
    private func raiseAlerts(for usage: UsageAnalytics) {
        let alerts = UsageEvaluator.evaluateAndRecord(
            usage: usage,
            thresholds: AlertThresholds(quotaPercent: store.quotaThresholdPercent),
            store: store,
            nowMs: Int64(Date().timeIntervalSince1970 * 1000)
        )
        guard store.notificationsEnabled else { return }
        notifier.post(alerts: alerts)
    }

    // MARK: - Errors

    @MainActor
    private func handle(_ error: VanitasError) {
        if case let .http(status, reason, _) = error {
            if status == 401 {
                // The gateway rejected the *session*: bounce to sign-in
                // instead of leaving a dead-end banner on screen.
                signOutLocally()
                lastError = L10n.message(for: "error.session_expired")
                return
            }
            lastError = L10n.message(for: reason)
            return
        }
        if case .network = error {
            lastError = L10n.network
            return
        }
        if case .decoding = error {
            lastError = L10n.t(
                "The server sent data this version cannot read.",
                "أرسل الخادم بيانات لا يستطيع هذا الإصدار قراءتها."
            )
            return
        }
    }
}
