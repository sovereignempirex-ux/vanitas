import SwiftUI
import UIKit

struct KeysView: View {
    // Stored properties stay `internal` (see RootView.swift): this view is
    // built from MainTabView, in another file.
    @EnvironmentObject var env: AppEnvironment

    @State var keys: [ApiKey] = []
    @State var scopes: [ScopeInfo] = []
    @State var isLoading = false
    @State var errorText: String?
    @State var showCreate = false
    @State var reveal: CreatedKeyResponse?
    @State var pendingRevoke: ApiKey?
    @State var showRevokeConfirm = false

    var body: some View {
        NavigationStack {
            List {
                if let errorText {
                    Section {
                        ErrorBanner(text: errorText)
                    }
                }

                Section {
                    if keys.isEmpty && !isLoading {
                        Text(L10n.t("No keys yet. Tap + to create one.",
                                    "لا توجد مفاتيح بعد. اضغط + لإنشاء مفتاح."))
                            .foregroundStyle(.secondary)
                    }

                    ForEach(keys, id: \.id) { key in
                        KeyRow(key: key)
                            .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                                Button(role: .destructive) {
                                    pendingRevoke = key
                                    showRevokeConfirm = true
                                } label: {
                                    Label(L10n.t("Revoke", "إلغاء"), systemImage: "trash")
                                }

                                Button {
                                    Task { await rotate(key) }
                                } label: {
                                    Label(L10n.t("Rotate", "تدوير"), systemImage: "arrow.triangle.2.circlepath")
                                }
                                .tint(.orange)
                            }
                    }
                } header: {
                    Text(L10n.t("Keys", "المفاتيح"))
                }
            }
            .navigationTitle(L10n.t("API keys", "مفاتيح الـ API"))
            .toolbar {
                ToolbarItem(placement: .primaryAction) {
                    Button {
                        showCreate = true
                    } label: {
                        Image(systemName: "plus")
                    }
                    .accessibilityLabel(L10n.t("New key", "مفتاح جديد"))
                }
            }
            .overlay {
                if isLoading {
                    ProgressView()
                }
            }
            .refreshable { await load() }
            .task { await load() }
            .sheet(isPresented: $showCreate) {
                CreateKeyView(scopes: scopes) { created in
                    // The one-time secret must be shown the moment it exists.
                    reveal = created
                    Task { await load() }
                }
            }
            .alert(
                L10n.t("Copy this secret now", "انسخ هذا السرّ الآن"),
                isPresented: Binding(
                    get: { reveal != nil },
                    set: { if !$0 { reveal = nil } }
                )
            ) {
                Button(L10n.t("Copy", "نسخ")) {
                    if let reveal {
                        UIPasteboard.general.string = reveal.rawSecret
                    }
                }
                Button(L10n.t("Done", "تم"), role: .cancel) {}
            } message: {
                Text("\(reveal?.rawSecret ?? "")\n\n\(reveal?.revealNote ?? "")")
            }
            .alert(
                L10n.t("Revoke this key?", "هل تريد إلغاء هذا المفتاح؟"),
                isPresented: $showRevokeConfirm
            ) {
                Button(L10n.t("Revoke", "إلغاء"), role: .destructive) {
                    if let pendingRevoke {
                        Task { await revoke(pendingRevoke) }
                    }
                }
                Button(L10n.cancel, role: .cancel) {}
            } message: {
                Text(pendingRevoke?.name ?? "")
            }
        }
    }

    // MARK: - Actions

    /// `@MainActor` because `@State` may only be written on the main actor —
    /// `await` resumes wherever the transport finished.
    @MainActor
    private func load() async {
        isLoading = true
        defer { isLoading = false }

        do {
            let response = try await env.client.listKeys()
            keys = response.keys
            scopes = response.allScopes
            errorText = nil
        } catch let error as VanitasError {
            errorText = error.message
        } catch {
            errorText = error.localizedDescription
        }
    }

    @MainActor
    private func rotate(_ key: ApiKey) async {
        do {
            let created = try await env.client.rotateKey(id: key.id)
            reveal = created
            await load()
        } catch let error as VanitasError {
            errorText = error.message
        } catch {
            errorText = error.localizedDescription
        }
    }

    @MainActor
    private func revoke(_ key: ApiKey) async {
        do {
            _ = try await env.client.revokeKey(id: key.id)
            await load()
        } catch let error as VanitasError {
            errorText = error.message
        } catch {
            errorText = error.localizedDescription
        }
    }
}

/// One row: identity first, then the two numbers a human checks most —
/// how far through its quota the key is, and how fast it is allowed to go.
struct KeyRow: View {
    let key: ApiKey

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text(key.name)
                    .font(.headline)
                Spacer()
                StatusPill(status: key.status)
            }

            Text("\(key.keyPrefix)… · \(key.environment)")
                .font(.caption.monospaced())
                .foregroundStyle(.secondary)

            if let quota = key.monthlyQuota, quota > 0 {
                let used = Double(key.currentUsageThisMonth ?? 0) / Double(quota) * 100
                QuotaBar(percent: used)
                Text(L10n.t(
                    "\(Int(used))% of \(quota) used this month",
                    "تم استخدام \(Int(used))% من \(quota) هذا الشهر"
                ))
                .font(.caption2)
                .foregroundStyle(.secondary)
            }

            HStack(spacing: 12) {
                LabeledStat(title: L10n.t("Requests", "الطلبات"),
                            value: key.usageCount.formatted())
                LabeledStat(title: L10n.t("Rate/min", "الحد/دقيقة"),
                            value: key.rateLimitPerMin.formatted())
                LabeledStat(title: L10n.t("Scopes", "النطاقات"),
                            value: "\(key.scopes.count)")
            }
        }
        .padding(.vertical, 4)
    }
}

struct StatusPill: View {
    let status: String

    private var color: Color {
        switch status {
        case "active": return .green
        case "revoked": return .red
        case "expired": return .orange
        default: return .gray
        }
    }

    var body: some View {
        Text(status.uppercased())
            .font(.caption2.bold())
            .padding(.horizontal, 6)
            .padding(.vertical, 2)
            .background(color.opacity(0.15), in: Capsule())
            .foregroundStyle(color)
    }
}

/// Form for a new key. Scopes come from the gateway's own catalogue so the
/// labels (and `adminOnly` flags) never drift from what the API enforces.
struct CreateKeyView: View {
    @EnvironmentObject var env: AppEnvironment
    @Environment(\.dismiss) var dismiss

    let scopes: [ScopeInfo]
    let onCreated: (CreatedKeyResponse) -> Void

    @State var name = ""
    @State var selectedEnvironment = "test"
    @State var rateLimit = 600.0
    @State var selected: Set<String> = ["usage:read"]
    @State var isBusy = false
    @State var errorText: String?

    private var canUseAdminScopes: Bool {
        env.permissions.contains("admin")
    }

    var body: some View {
        NavigationStack {
            Form {
                if let errorText {
                    Section {
                        ErrorBanner(text: errorText)
                    }
                }

                Section {
                    TextField(L10n.t("e.g. CI pipeline", "مثال: خط CI"), text: $name)
                } header: {
                    Text(L10n.t("Name", "الاسم"))
                }

                Section {
                    Picker(L10n.t("Environment", "البيئة"), selection: $selectedEnvironment) {
                        Text(L10n.t("Test", "اختبار")).tag("test")
                        Text(L10n.t("Live", "إنتاج")).tag("live")
                    }
                    .pickerStyle(.segmented)
                } header: {
                    Text(L10n.t("Environment", "البيئة"))
                }

                Section {
                    Stepper(value: $rateLimit, in: 60...6000, step: 60) {
                        Text(Int(rateLimit).formatted())
                            .font(.body.monospacedDigit())
                    }
                } header: {
                    Text(L10n.t("Rate limit per minute", "الحد في الدقيقة"))
                }

                Section {
                    if scopes.isEmpty {
                        Text(L10n.t("Scopes appear once your keys have loaded.",
                                    "تظهر النطاقات بعد تحميل مفاتيحك."))
                            .foregroundStyle(.secondary)
                    }
                    ForEach(scopes, id: \.scope) { scope in
                        Toggle(isOn: binding(for: scope.scope)) {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(scope.label)
                                Text(scope.scope)
                                    .font(.caption.monospaced())
                                    .foregroundStyle(.secondary)
                            }
                        }
                        .disabled(scope.adminOnly && !canUseAdminScopes)
                    }
                } header: {
                    Text(L10n.t("Scopes", "النطاقات"))
                }
            }
            .navigationTitle(L10n.t("New key", "مفتاح جديد"))
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(L10n.cancel) { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button {
                        Task { await create() }
                    } label: {
                        if isBusy {
                            ProgressView()
                        } else {
                            Text(L10n.t("Create", "إنشاء"))
                        }
                    }
                    .disabled(name.trimmingCharacters(in: .whitespaces).isEmpty || isBusy)
                }
            }
        }
    }

    private func binding(for scope: String) -> Binding<Bool> {
        Binding(
            get: { selected.contains(scope) },
            set: { isOn in
                if isOn {
                    selected.insert(scope)
                } else {
                    selected.remove(scope)
                }
            }
        )
    }

    @MainActor
    private func create() async {
        isBusy = true
        defer { isBusy = false }

        do {
            let created = try await env.client.createKey(
                CreateKeyRequest(
                    name: name.trimmingCharacters(in: .whitespaces),
                    scopes: selected.sorted(),
                    environment: selectedEnvironment,
                    rateLimitPerMin: Int(rateLimit)
                )
            )
            onCreated(created)
            dismiss()
        } catch let error as VanitasError {
            errorText = error.message
        } catch {
            errorText = error.localizedDescription
        }
    }
}
