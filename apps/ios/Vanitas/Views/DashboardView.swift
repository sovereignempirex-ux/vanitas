import SwiftUI

struct DashboardView: View {
    @EnvironmentObject var env: AppEnvironment

    var body: some View {
        NavigationStack {
            List {
                if let error = env.lastError {
                    Section {
                        ErrorBanner(text: error)
                    }
                }

                Section {
                    row(L10n.t("Name", "الاسم"), env.profile?.name ?? "—")
                    row(L10n.t("Email", "البريد الإلكتروني"), env.profile?.email ?? "—")
                    row(L10n.t("Username", "اسم المستخدم"), env.profile?.username ?? "—")
                    row(L10n.t("Role", "الدور"), env.profile?.role ?? "—")
                    row(L10n.t("Two-factor", "التحقق الثنائي"),
                        (env.profile?.twoFactorEnabled ?? false)
                            ? L10n.t("On", "مفعّل")
                            : L10n.t("Off", "معطّل"))
                } header: {
                    Text(L10n.t("Profile", "الملف الشخصي"))
                }

                Section {
                    row(L10n.t("Server", "الخادم"), env.store.serverURL)
                    row(L10n.t("Last refresh", "آخر تحديث"), lastRefresh)
                    row(L10n.t("Keys in window", "المفاتيح في الفترة"),
                        "\(env.usage?.summaries.count ?? 0)")
                } header: {
                    Text(L10n.t("Session", "الجلسة"))
                }

                Section {
                    Button {
                        Task {
                            await env.refreshProfile()
                            await env.refreshUsage()
                        }
                    } label: {
                        Label(L10n.t("Refresh", "تحديث"), systemImage: "arrow.clockwise")
                    }
                    .disabled(env.isBusy)
                }
            }
            .navigationTitle(L10n.t("Account", "الحساب"))
            .refreshable { await env.refreshProfile() }
            .task {
                if env.profile == nil {
                    await env.refreshProfile()
                }
            }
        }
    }

    private var lastRefresh: String {
        guard let checkedAt = env.checkedAt else {
            return L10n.t("Not yet", "لم يتم بعد")
        }
        return checkedAt.formatted(date: .abbreviated, time: .shortened)
    }

    private func row(_ title: String, _ value: String) -> some View {
        HStack(alignment: .firstTextBaseline) {
            Text(title)
                .foregroundStyle(.secondary)
            Spacer()
            Text(value)
                .multilineTextAlignment(.trailing)
        }
    }
}
