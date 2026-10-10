import Foundation
import UserNotifications
import VanitasCore

/// Delivers raised `UsageAlert`s as local notifications. Kept behind a
/// protocol so views and the background task can be tested without the
/// notification centre — and so a denied permission can never crash a refresh.
protocol AlertPosting: AnyObject {
    func requestAuthorization()
    func post(alerts: [UsageAlert])
}

final class Notifier: AlertPosting {

    func requestAuthorization() {
        UNUserNotificationCenter.current()
            .requestAuthorization(options: [.alert, .sound]) { _, _ in
                // Denial is not an error: Settings keeps a working toggle.
            }
    }

    func post(alerts: [UsageAlert]) {
        guard !alerts.isEmpty else { return }

        let center = UNUserNotificationCenter.current()
        for alert in alerts {
            let content = UNMutableNotificationContent()
            content.title = title(for: alert)
            content.body = body(for: alert)
            content.sound = .default

            // The id embeds the dedupe key, so two posts of the same alert
            // replace each other instead of stacking.
            let request = UNNotificationRequest(
                identifier: "\(alert.dedupeKey).\(UUID().uuidString)",
                content: content,
                trigger: nil
            )
            center.add(request) { _ in
                // A scheduling failure is dropped, not retried: the evaluator
                // has already marked this window as seen.
            }
        }
    }

    private func title(for alert: UsageAlert) -> String {
        switch alert.kind {
        case .quota:
            return L10n.t("Key quota almost used up",
                          "الحد الشهري للمفتاح على وشك النفاد")
        case .errors:
            return L10n.t("Errors on \(alert.keyName)",
                          "أخطاء على \(alert.keyName)")
        case .throttled:
            return L10n.t("Requests throttled on \(alert.keyName)",
                          "طلبات مرفوضة على \(alert.keyName)")
        }
    }

    private func body(for alert: UsageAlert) -> String {
        switch alert.kind {
        case .quota:
            return L10n.t(
                "\(alert.keyName) is at \(alert.quotaPercent)% of its monthly quota.",
                "\(alert.keyName) وصل إلى \(alert.quotaPercent)% من الحد الشهري."
            )
        case .errors:
            return L10n.t(
                "\(alert.errorCount) of \(alert.totalRequests) requests failed.",
                "\(alert.errorCount) من أصل \(alert.totalRequests) طلب فشل."
            )
        case .throttled:
            return L10n.t(
                "\(alert.throttledCount) requests were rate-limited in \(alert.period).",
                "\(alert.throttledCount) طلبات تم تقييدها خلال \(alert.period)."
            )
        }
    }
}
