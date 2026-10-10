import Foundation

/// UI copy, in the device's language.
///
/// The app keeps one `en` + `ar` pair per string instead of shipping
/// `.lproj` bundles: with a hand-written `project.pbxproj` every extra
/// localized resource is one more thing to get wrong, and picking the pair at
/// runtime is a pure function — so it is testable and never half-loaded.
enum L10n {
    static func t(_ en: String, _ ar: String) -> String {
        isArabic ? ar : en
    }

    static var isArabic: Bool {
        Locale.current.language.languageCode?.identifier == "ar"
    }

    /// Turns the gateway's `error.something` keys into a sentence the user can
    /// act on, falling back to the raw text so nothing is ever swallowed.
    static func message(for raw: String) -> String {
        switch raw {
        case "error.invalid_credentials":
            return t("Wrong email or password.", "البريد الإلكتروني أو كلمة المرور غير صحيحة.")
        case "error.2fa_required":
            return t("Enter the 6-digit code from your authenticator.",
                     "أدخل الرمز المكوّن من ٦ أرقام من تطبيق المصادقة.")
        case "error.invalid_token", "error.session_expired":
            return t("Your session expired. Please sign in again.",
                     "انتهت صلاحية جلستك. سجّل الدخول من جديد.")
        case "error.rate_limited":
            return t("Too many attempts. Try again shortly.",
                     "محاولات كثيرة جدًا. حاول بعد قليل.")
        default:
            return raw
        }
    }

    // Shared sentences.
    static var retry: String { t("Retry", "إعادة المحاولة") }
    static var cancel: String { t("Cancel", "إلغاء") }
    static var save: String { t("Save", "حفظ") }
    static var loading: String { t("Loading…", "جارٍ التحميل…") }
    static var signOut: String { t("Sign out", "تسجيل الخروج") }
    static var network: String {
        t("Cannot reach the server. Check the address in Settings.",
          "تعذّر الوصول إلى الخادم. تحقّق من العنوان في الإعدادات.")
    }
}
