import BackgroundTasks
import SwiftUI
import UIKit
import VanitasCore

/// Registers the periodic usage refresh with `BGTaskScheduler`.
///
/// iOS has no `WorkManager` equivalent that just runs: a background task has
/// to be named in `Info.plist` before launch and re-submitted after every run,
/// and it is throttled by the system (roughly every 6 hours on a charged
/// device). The foreground path — `AppEnvironment.onForeground()` — does the
/// same work on every activation, so alerts are never *only* as fresh as the
/// scheduler decides to be.
final class AppDelegate: UIResponder, UIApplicationDelegate {

    static let usageRefreshIdentifier = "com.vanitas.ios.usagecheck"

    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
    ) -> Bool {
        _ = BGTaskScheduler.shared.register(
            forTaskWithIdentifier: Self.usageRefreshIdentifier,
            queue: nil
        ) { task in
            guard let refresh = task as? BGAppRefreshTask else {
                task.setTaskCompleted(success: false)
                return
            }
            Self.handle(refresh)
        }
        Self.scheduleNextRefresh()
        return true
    }

    static func scheduleNextRefresh() {
        let request = BGAppRefreshTaskRequest(identifier: usageRefreshIdentifier)
        request.earliestBeginDate = Date(timeIntervalSinceNow: 6 * 60 * 60)
        try? BGTaskScheduler.shared.submit(request)
    }

    /// Runs with no UI available: rebuilds the session straight from
    /// `UserDefaults` and raises any alerts the evaluator decides on.
    static func handle(_ task: BGAppRefreshTask) {
        scheduleNextRefresh()

        let store = PreferencesStore()
        guard store.token != nil, store.notificationsEnabled else {
            task.setTaskCompleted(success: true)
            return
        }

        let client = VanitasClient(baseURL: store.serverURL, tokenProvider: { store.token })
        let notifier = Notifier()

        Task {
            defer { task.setTaskCompleted(success: true) }
            do {
                let usage = try await client.usage()
                let alerts = UsageEvaluator.evaluateAndRecord(
                    usage: usage,
                    thresholds: AlertThresholds(quotaPercent: store.quotaThresholdPercent),
                    store: store,
                    nowMs: Int64(Date().timeIntervalSince1970 * 1000)
                )
                notifier.post(alerts: alerts)
            } catch {
                // A failed refresh is dropped, never retried in a loop: the
                // scheduler gets another chance in six hours either way.
            }
            Self.scheduleNextRefresh()
        }
    }
}

@main
struct VanitasApp: App {
    // Not `private`: `App` requires an accessible `init()` to instantiate the
    // entry point, and the synthesized memberwise initializer inherits the
    // access level of its most restrictive stored property.
    @UIApplicationDelegateAdaptor(AppDelegate.self) var appDelegate
    @StateObject var env = AppEnvironment()
    @Environment(\.scenePhase) var scenePhase

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(env)
                .task { await env.bootstrap() }
                // `scenePhase` lives in the environment, so the observer sits
                // on the content view rather than on the scene itself.
                .onChange(of: scenePhase) { phase in
                    guard phase == .active else { return }
                    Task { await env.onForeground() }
                }
        }
    }
}
