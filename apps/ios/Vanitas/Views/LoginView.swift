import SwiftUI
import VanitasCore

struct LoginView: View {
    // Not `private`: this view is constructed from RootView.swift, and the
    // synthesized initializer takes the access level of its properties.
    @EnvironmentObject var env: AppEnvironment

    @State var email = ""
    @State var password = ""
    @State var code = ""
    @State var wantsCode = false
    @State var isBusy = false
    @State var errorText: String?

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 20) {
                    header

                    VStack(spacing: 12) {
                        TextField(L10n.t("Email", "البريد الإلكتروني"), text: $email)
                            .textContentType(.username)
                            .keyboardType(.emailAddress)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                            .textFieldStyle(.roundedBorder)

                        SecureField(L10n.t("Password", "كلمة المرور"), text: $password)
                            .textContentType(.password)
                            .textFieldStyle(.roundedBorder)

                        // Appears only when the gateway asks for it, so the
                        // first sign-in stays a two-field form.
                        if wantsCode {
                            TextField(L10n.t("Authenticator code", "رمز المصادقة"), text: $code)
                                .keyboardType(.numberPad)
                                .textContentType(.oneTimeCode)
                                .textFieldStyle(.roundedBorder)
                        }
                    }

                    if let errorText {
                        ErrorBanner(text: errorText)
                    }

                    Button {
                        Task { await signIn() }
                    } label: {
                        HStack(spacing: 8) {
                            if isBusy {
                                ProgressView().tint(.white)
                            }
                            Text(L10n.t("Sign in", "تسجيل الدخول"))
                        }
                        .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.borderedProminent)
                    .controlSize(.large)
                    .disabled(isBusy || email.isEmpty || password.isEmpty)
                }
                .padding(24)
            }
            .navigationTitle(L10n.t("Vanitas", "فانيتاس"))
            .scrollDismissesKeyboard(.interactively)
        }
    }

    private var header: some View {
        VStack(spacing: 8) {
            Image(systemName: "shield.lefthalf.filled")
                .font(.system(size: 44))
                .foregroundStyle(.tint)
            Text(L10n.t("Sign in to Vanitas", "سجّل الدخول إلى فانيتاس"))
                .font(.title2.bold())
            Text(L10n.t("The same account as the web console.",
                        "نفس حساب وحدة التحكم على الويب."))
                .font(.footnote)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
        }
    }

    /// `@MainActor`: it writes `@State` and hands the session to an isolated
    /// method on `AppEnvironment`.
    @MainActor
    private func signIn() async {
        isBusy = true
        defer { isBusy = false }

        do {
            let session = try await env.client.login(
                email: email,
                password: password,
                code: wantsCode ? code : nil
            )
            errorText = nil
            env.completeSignIn(with: session)
        } catch let error as VanitasError {
            // A 2FA challenge is not a failure: reveal the field and keep the
            // typed credentials so only the code is left to enter.
            if error.twoFactorRequired {
                wantsCode = true
            }
            if case .network = error {
                errorText = L10n.network
            } else {
                errorText = L10n.message(for: error.message)
            }
        } catch {
            errorText = error.localizedDescription
        }
    }
}
