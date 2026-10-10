using System.Windows;
using System.Windows.Controls;
using Vanitas.Core;

namespace Vanitas.Desktop.Views;

public partial class LoginView : UserControl
{
    private readonly AppEnvironment _env;
    private readonly Action _onSignedIn;
    private string _password = "";

    /// <param name="onSignedIn">Called on the UI thread once a session token
    /// exists, so the shell swaps in the signed-in layout.</param>
    public LoginView(AppEnvironment env, Action onSignedIn)
    {
        _env = env;
        _onSignedIn = onSignedIn;
        InitializeComponent();
        Localise();
    }

    private void Localise()
    {
        Heading.Text = L10n.AppTitle;
        Subtitle.Text = L10n.T("Sign in with your account",
                               "سجّل الدخول بحسابك");
        EmailLabel.Text = L10n.Email;
        PasswordLabel.Text = L10n.Password;
        CodeLabel.Text = L10n.TotpCode;
        SignInButton.Content = L10n.SignIn;
        ServerLabel.Text = L10n.ServerUrl;
        ServerHint.Text = L10n.T("Gateway origin — no trailing slash needed",
                                 "عنوان البوابة — من غير شرطة في الآخر");
        EmailBox.Text = "";
        ServerBox.Text = _env.Store.ServerUrl;
        ShowError(null);
    }

    private void Password_Changed(object sender, RoutedEventArgs e) =>
        _password = ((PasswordBox)sender).Password;

    private void ShowError(string? message)
    {
        ErrorText.Text = message ?? "";
        ErrorText.Visibility = message is null ? Visibility.Collapsed : Visibility.Visible;
    }

    private async void SignIn_Click(object sender, RoutedEventArgs e)
    {
        var email = EmailBox.Text.Trim();
        if (email.Length == 0 || _password.Length == 0)
        {
            ShowError(L10n.T("Email and password are required",
                             "البريد وكلمة المرور مطلوبين"));
            return;
        }

        // Applied before the request so the very first call uses it.
        var server = ServerBox.Text.Trim();
        if (server.Length > 0 && server != _env.Store.ServerUrl)
        {
            _env.Store.ServerUrl = server.Trim('/');
            _env.Store.Save();
            _env.Reconnect();
        }

        SignInButton.IsEnabled = false;
        ShowError(null);

        try
        {
            var session = await _env.Client.LoginAsync(
                email, _password, NullIfEmpty(CodeBox.Text));

            _env.Store.Token = session.Token;
            _env.Store.Save();
            _onSignedIn();
        }
        catch (VanitasError ex)
        {
            // 2FA is not a failure to report and move on — it is the next step
            // of the same form, so the field appears where the code goes.
            if (ex.TwoFactorRequired)
            {
                CodeRow.Visibility = Visibility.Visible;
                ShowError(ex.Reason + " — " + L10n.T("enter your code",
                                                     "أدخل الرمز"));
            }
            else
            {
                ShowError(L10n.Failed(ex.Reason));
            }
        }
        catch (OperationCanceledException)
        {
            ShowError(L10n.T("Cancelled", "تم الإلغاء"));
        }
        finally
        {
            SignInButton.IsEnabled = true;
        }
    }

    private static string? NullIfEmpty(string value) =>
        string.IsNullOrWhiteSpace(value) ? null : value.Trim();
}
