import SwiftUI

struct SettingsView: View {
    @EnvironmentObject var env: AppEnvironment

    @State var showSignOut = false

    var body: some View {
        NavigationStack {
            Form {
                if let error = env.lastError {
                    Section {
                        ErrorBanner(text: error)
                    }
                }

                Section {
                    TextField(L10n.t("Address", "العنوان"), text: serverURLBinding)
                        .keyboardType(.URL)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                    Text(L10n.t(
                        "The simulator reaches your computer through localhost. On a real device, use HTTPS.",
                        "المحاكي يصل إلى حاسوبك عبر localhost. على الجهاز الحقيقي استخدم HTTPS."
                    ))
                    .font(.caption)
                    .foregroundStyle(.secondary)
                } header: {
                    Text(L10n.t("Server", "الخادم"))
                }

                Section {
                    Toggle(L10n.t("Warn me about quotas", "نبّهني عن الحدود"),
                           isOn: notificationsBinding)

                    VStack(alignment: .leading, spacing: 8) {
                        Slider(value: thresholdBinding, in: 50...100, step: 5)
                        Text(L10n.t(
                            "Warn at \(env.store.quotaThresholdPercent)% of a key's monthly quota",
                            "تنبيه عند \(env.store.quotaThresholdPercent)% من الحد الشهري للمفتاح"
                        ))
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                    }
                } header: {
                    Text(L10n.t("Notifications", "الإشعارات"))
                }

                Section {
                    Button(role: .destructive) {
                        showSignOut = true
                    } label: {
                        Text(L10n.signOut)
                            .frame(maxWidth: .infinity)
                    }
                } header: {
                    Text(L10n.t("Session", "الجلسة"))
                }

                Section {
                    LabeledStat(title: L10n.t("App", "التطبيق"),
                                value: "Vanitas iOS 1.0")
                    LabeledStat(title: L10n.t("Language", "اللغة"),
                                value: L10n.isArabic ? "العربية" : "English")
                } header: {
                    Text(L10n.t("About", "حول"))
                }
            }
            .navigationTitle(L10n.t("Settings", "الإعدادات"))
            .alert(L10n.t("Sign out?", "تسجيل الخروج؟"), isPresented: $showSignOut) {
                Button(L10n.signOut, role: .destructive) {
                    Task { await env.signOut() }
                }
                Button(L10n.cancel, role: .cancel) {}
            } message: {
                Text(L10n.t("Your keys stay on the server.",
                            "تبقى مفاتيحك على الخادم."))
            }
        }
    }

    // MARK: - Bindings
    //
    // Preferences live in `PreferencesStore` (and publish through
    // `AppEnvironment`), so the form writes straight to the source of truth
    // instead of keeping a copy that could drift.

    private var serverURLBinding: Binding<String> {
        Binding(
            get: { env.store.serverURL },
            set: { env.store.serverURL = $0 }
        )
    }

    private var notificationsBinding: Binding<Bool> {
        Binding(
            get: { env.store.notificationsEnabled },
            set: { env.setNotifications($0) }
        )
    }

    private var thresholdBinding: Binding<Double> {
        Binding(
            get: { Double(env.store.quotaThresholdPercent) },
            set: { env.store.quotaThresholdPercent = Int($0) }
        )
    }
}
