using System.Globalization;

namespace Vanitas.Desktop;

/// Bilingual strings, resolved at runtime.
///
/// Deliberately not `.resx`: the whole UI is one view deep, the two languages
/// are shipped together, and a string that can be read next to its translation
/// is far easier to keep honest than one hidden in a satellite assembly. The
/// Swift twin reaches the same conclusion with `L10n.t(en, ar)`.
public static class L10n
{
    /// True when the OS is asking for Arabic — checked per call so a
    /// mid-session language change needs no restart.
    public static bool IsArabic =>
        CultureInfo.CurrentUICulture.TwoLetterISOLanguageName.Equals(
            "ar", StringComparison.OrdinalIgnoreCase);

    /// English first, Arabic second; returns whichever the OS wants.
    public static string T(string en, string ar) => IsArabic ? ar : en;

    // MARK: - Screens

    public static string AppTitle => T("Vanitas", "فانيتاس");
    public static string SignIn => T("Sign in", "تسجيل الدخول");
    public static string Email => T("Email", "البريد الإلكتروني");
    public static string Password => T("Password", "كلمة المرور");
    public static string TotpCode => T("2FA code", "رمز التحقق الثنائي");
    public static string Keys => T("API keys", "مفاتيح الـ API");
    public static string Usage => T("Usage", "الاستخدام");
    public static string Logs => T("Logs", "السجلات");
    public static string Settings => T("Settings", "الإعدادات");
    public static string SignOut => T("Sign out", "تسجيل الخروج");
    public static string Refresh => T("Refresh", "تحديث");
    public static string ServerUrl => T("Server address", "عنوان الخادم");
    public static string Environment => T("Environment", "البيئة");
    public static string ExportCsv => T("Download CSV", "تنزيل CSV");
    public static string Cancel => T("Cancel", "إلغاء");
    public static string Done => T("Done", "تم");

    public static string Empty(string what) => T($"No {what} yet", $"لا يوجد {what} بعد");
    public static string Failed(string detail) => T($"Failed: {detail}", $"فشل: {detail}");

    // MARK: - Keyboard help

    /// The shortcut list shown in Settings — kept next to the bindings it
    /// documents so the two cannot drift apart.
    public static readonly (string Keys, string En, string Ar)[] Shortcuts =
    [
        ("Ctrl+K", "Create an API key", "إنشاء مفتاح API"),
        ("Ctrl+R", "Refresh the current view", "تحديث الشاشة الحالية"),
        ("Ctrl+U", "Open usage", "فتح شاشة الاستخدام"),
        ("Ctrl+J", "Open the request log", "فتح سجل الطلبات"),
        ("Ctrl+,", "Open settings", "فتح الإعدادات"),
        ("Ctrl+Q", "Quit", "إغلاق البرنامج"),
        ("Esc", "Cancel the current dialog", "إلغاء المربع الحالي"),
    ];
}
