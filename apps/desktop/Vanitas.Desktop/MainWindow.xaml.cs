using System.Windows;
using System.Windows.Input;
using Vanitas.Core;
using Vanitas.Desktop.Views;

namespace Vanitas.Desktop;

public partial class MainWindow : Window
{
    private readonly AppEnvironment _env;

    // Built once and kept: each tab keeps its own scroll position, selection
    // and last-loaded data across the switches a user makes in a session.
    private KeysView? _keys;
    private UsageView? _usage;
    private LogsView? _logs;
    private SettingsView? _settings;

    public MainWindow()
    {
        InitializeComponent();

        // `App.OnStartup` runs before the StartupUri window is constructed, so
        // the environment is always ready here.
        _env = ((App)Application.Current).Environ!;

        Localise();
        ShowMode();
    }

    private void Localise()
    {
        Title = L10n.AppTitle;
        NavKeys.Content = L10n.Keys;
        NavUsage.Content = L10n.Usage;
        NavLogs.Content = L10n.Logs;
        NavSettings.Content = L10n.Settings;
        NavHint.Text = L10n.T("Ctrl+K new · Ctrl+R refresh · Ctrl+J logs",
                              "Ctrl+K جديد · Ctrl+R تحديث · Ctrl+J سجلات");
        ServerStatus.Text = _env.Store.ServerUrl;
    }

    /// Login card or shell, decided purely by whether a token exists — so
    /// signing out and signing back in needs no special case anywhere else.
    private void ShowMode()
    {
        var signedIn = !string.IsNullOrEmpty(_env.Store.Token);

        ShellHost.Visibility = signedIn ? Visibility.Visible : Visibility.Collapsed;
        ContentHost.Content = null;
        LoginHost.Content = signedIn ? null : new LoginView(_env, OnSignedIn);

        if (signedIn)
        {
            ServerStatus.Text = _env.Store.ServerUrl;
            // NavKeys starts checked, but `Checked` does not fire for the
            // initial value — so the first view is installed explicitly.
            ShowKeys();
        }
    }

    private void OnSignedIn()
    {
        Localise();
        ShowMode();
    }

    private void OnSignedOut()
    {
        // Views are dropped, not hidden: the next account must not see the
        // previous one's keys or usage cached in memory. Separate statements —
        // a chained `a = b = c = null` types itself from the rightmost
        // variable and then cannot assign the others.
        _keys = null;
        _usage = null;
        _logs = null;
        _settings = null;
        ShowMode();
    }

    private void Nav_Changed(object sender, RoutedEventArgs e)
    {
        // Fires for whichever button became checked; the others are unchecking.
        if (!ReferenceEquals(e.OriginalSource, sender)) return;
        if (!IsLoaded) return;

        ShowContent();
    }

    private void ShowContent()
    {
        if (NavKeys.IsChecked == true) ShowKeys();
        else if (NavUsage.IsChecked == true) ShowUsage();
        else if (NavLogs.IsChecked == true) ShowLogs();
        else if (NavSettings.IsChecked == true) ShowSettings();
    }

    private void ShowKeys()
    {
        _keys ??= new KeysView(_env);
        ContentHost.Content = _keys;
    }

    private void ShowUsage()
    {
        _usage ??= new UsageView(_env);
        ContentHost.Content = _usage;
    }

    private void ShowLogs()
    {
        _logs ??= new LogsView(_env);
        ContentHost.Content = _logs;
    }

    private void ShowSettings()
    {
        _settings ??= new SettingsView(_env, OnSignedOut);
        ContentHost.Content = _settings;
    }

    // MARK: - Keyboard
    //
    // Handled here rather than as `InputBinding`s because the shortcuts act on
    // whichever tab happens to be open — one place decides what "refresh" means
    // right now, and `L10n.Shortcuts` documents exactly these.
    private void Window_PreviewKeyDown(object sender, KeyEventArgs e)
    {
        if (ShellHost.Visibility != Visibility.Visible) return;

        var chord = new KeyGesture(
            e.Key == Key.System ? e.SystemKey : e.Key,
            Keyboard.Modifiers);

        if (chord.Key == Key.Q && chord.Modifiers == ModifierKeys.Control)
        {
            Close();
            e.Handled = true;
            return;
        }

        if (chord.Modifiers != ModifierKeys.Control) return;

        switch (chord.Key)
        {
            case Key.K:
                // Create is a Keys-tab action, so the shortcut navigates first
                // and acts second — the user always sees what it did.
                NavKeys.IsChecked = true;
                ShowKeys();
                _keys?.OpenCreate();
                e.Handled = true;
                break;

            case Key.R:
                RefreshCurrent();
                e.Handled = true;
                break;

            case Key.U:
                NavUsage.IsChecked = true;
                e.Handled = true;
                break;

            case Key.J:
                NavLogs.IsChecked = true;
                e.Handled = true;
                break;

            case Key.OemComma:
                NavSettings.IsChecked = true;
                e.Handled = true;
                break;
        }
    }

    private void RefreshCurrent()
    {
        switch (ContentHost.Content)
        {
            case KeysView k:
                _ = k.RefreshAsync();
                break;
            case UsageView u:
                _ = u.RefreshAsync();
                break;
            case LogsView:
            case SettingsView:
                // Nothing to re-fetch: settings are local and the log is this
                // process's own history, not a server resource.
                break;
        }
    }

    protected override void OnClosed(EventArgs e)
    {
        // Settings are flushed here too, so quitting with Ctrl+Q — the path
        // most likely to skip any save handler — still persists.
        _env.Store.Save();
        base.OnClosed(e);
    }
}
