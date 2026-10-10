import SwiftUI
import VanitasCore

/// Chooses between the signed-out and signed-in worlds. Kept tiny on purpose:
/// it reads exactly one flag, so signing in or out swaps the whole tree with
/// no navigation state to keep in sync.
struct RootView: View {
    // Stored properties stay `internal`: a `private` one would drop the
    // synthesized initializer down to file-private, and this view is built
    // from VanitasApp.swift.
    @EnvironmentObject var env: AppEnvironment

    var body: some View {
        Group {
            if env.isSignedIn {
                MainTabView()
            } else {
                LoginView()
            }
        }
    }
}

struct MainTabView: View {
    var body: some View {
        TabView {
            DashboardView()
                .tabItem { Label(L10n.t("Account", "الحساب"), systemImage: "person.crop.circle") }
            KeysView()
                .tabItem { Label(L10n.t("API keys", "مفاتيح الـ API"), systemImage: "key.fill") }
            UsageView()
                .tabItem { Label(L10n.t("Usage", "الاستخدام"), systemImage: "chart.bar.fill") }
            SettingsView()
                .tabItem { Label(L10n.t("Settings", "الإعدادات"), systemImage: "gearshape.fill") }
        }
    }
}

/// The one place a failure is rendered, so every screen shows the same thing
/// for the same `VanitasError`.
struct ErrorBanner: View {
    let text: String

    var body: some View {
        HStack(alignment: .top, spacing: 8) {
            Image(systemName: "exclamationmark.triangle.fill")
            Text(text)
                .fixedSize(horizontal: false, vertical: true)
        }
        .font(.footnote)
        .foregroundStyle(.red)
        .padding(10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.red.opacity(0.10), in: RoundedRectangle(cornerRadius: 8))
    }
}

/// A `0…100` percentage as a bar. `value` is clamped here rather than at the
/// call site so a >100% quota cannot draw outside its track.
struct QuotaBar: View {
    /// 0…100.
    let percent: Double

    var body: some View {
        ProgressView(value: min(max(percent, 0), 100) / 100)
            .tint(percent >= 90 ? .red : (percent >= 70 ? .orange : .blue))
    }
}

struct LabeledStat: View {
    let title: String
    let value: String

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(title)
                .font(.caption)
                .foregroundStyle(.secondary)
            Text(value)
                .font(.body.monospacedDigit())
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}
