using System.Windows;
using System.Windows.Controls;

namespace Vanitas.Desktop.Views;

public partial class SettingsView : UserControl
{
    private readonly AppEnvironment _env;
    private readonly Action _onSignedOut;
    private bool _initialised;

    /// <param name="onSignedOut">Called on the UI thread after the session is
    /// dropped, so the shell can return to the login screen.</param>
    public SettingsView(AppEnvironment env, Action onSignedOut)
    {
        _env = env;
        _onSignedOut = onSignedOut;
        InitializeComponent();
        Localise();

        ServerBox.Text = _env.Store.ServerUrl;
        NotificationsBox.IsChecked = _env.Store.NotificationsEnabled;
        QuotaSlider.Value = _env.Store.QuotaThresholdPercent;

        _initialised = true;
        UpdateQuotaLabel();
    }

    private void Localise()
    {
        Title.Text = L10n.Settings;
        ServerLabel.Text = L10n.ServerUrl;
        ServerHint.Text = L10n.T(
            "Gateway origin — no trailing slash needed. Applied to the next request.",
            "عنوان البوابة — من غير شرطة في الآخر. يُطبَّق على الطلب التالي.");
        SaveButton.Content = L10n.T("Save", "حفظ");
        AlertsHeading.Text = L10n.T("Alerts", "التنبيهات");
        NotificationsBox.Content = L10n.T("Notify me about quota and error alerts",
                                          "نبّيني عند اقتراب الحد أو كثرة الأخطاء");
        QuotaLabel.Text = L10n.T("Warn when a key's monthly quota reaches",
                                 "نبّه عند وصول رصيد المفتاح الشهري إلى");
        KeysHeading.Text = L10n.T("Keyboard", "اختصارات لوحة المفاتيح");
        SignOutButton.Content = L10n.SignOut;

        // One row per documented shortcut, from the list that sits beside the
        // bindings that implement them.
        foreach (var (keys, en, ar) in L10n.Shortcuts)
        {
            var grid = new Grid { Margin = new Thickness(0, 0, 0, 8) };
            grid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(110) });
            grid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });

            var chord = new TextBlock
            {
                Text = keys,
                FontFamily = new System.Windows.Media.FontFamily("Consolas"),
                Foreground = (System.Windows.Media.Brush)FindResource("AccentBrush"),
            };
            System.Windows.Controls.Grid.SetColumn(chord, 0);

            var what = new TextBlock
            {
                Text = L10n.IsArabic ? ar : en,
                TextWrapping = TextWrapping.Wrap,
            };
            System.Windows.Controls.Grid.SetColumn(what, 1);

            grid.Children.Add(chord);
            grid.Children.Add(what);
            ShortcutList.Items.Add(grid);
        }
    }

    private void UpdateQuotaLabel() =>
        QuotaValue.Text = $"{(int)QuotaSlider.Value}%";

    private void Quota_Changed(object sender, RoutedPropertyChangedEventArgs<double> e)
    {
        if (!_initialised) return;
        UpdateQuotaLabel();
        // Applied live: the usage screen reads this on its next refresh, and a
        // preference the user can see changing is a preference they trust.
        _env.Store.QuotaThresholdPercent = (int)QuotaSlider.Value;
        _env.Store.Save();
    }

    private void Save_Click(object sender, RoutedEventArgs e)
    {
        var server = ServerBox.Text.Trim().TrimEnd('/');
        if (server.Length == 0)
        {
            ServerBox.Text = _env.Store.ServerUrl;
            return;
        }

        _env.Store.ServerUrl = server;
        _env.Store.NotificationsEnabled = NotificationsBox.IsChecked == true;
        _env.Store.QuotaThresholdPercent = (int)QuotaSlider.Value;
        // Persist, then re-point the client: `Reconnect` trims the same way, so
        // what was saved and what is used can never disagree.
        _env.Store.Save();
        _env.Reconnect();

        SaveButton.Content = L10n.T("Saved", "تم الحفظ");
    }

    private void SignOut_Click(object sender, RoutedEventArgs e)
    {
        // Local first and always — a broken gateway must not trap the user in
        // their session. `SignOut` already tolerates a failed logout call.
        _env.SignOut();
        _onSignedOut();
    }
}
