using System.Windows;
using System.Windows.Controls;
using Vanitas.Core;

namespace Vanitas.Desktop.Views;

public partial class KeysView : UserControl
{
    private readonly AppEnvironment _env;
    private ApiKey? _selected;
    private KeysResponse? _loaded;

    public KeysView(AppEnvironment env)
    {
        _env = env;
        InitializeComponent();
        Localise();
        _ = RefreshAsync();
    }

    private void Localise()
    {
        Title.Text = L10n.Keys;
        CreateButton.Content = L10n.T("New key", "مفتاح جديد");
        RefreshButton.Content = L10n.Refresh;
        RotateButton.Content = L10n.T("Rotate", "تدوير المفتاح");
        RevokeButton.Content = L10n.T("Revoke", "إلغاء المفتاح");
    }

    /// Bound to the shell's Ctrl+R as well as the toolbar button, so the
    /// shortcut and the button cannot do different things.
    public async Task RefreshAsync()
    {
        RefreshButton.IsEnabled = false;
        try
        {
            var response = await _env.Client.ListKeysAsync();
            _loaded = response;
            Grid.ItemsSource = response.Keys;
            _selected = null;
            Status.Text = L10n.T($"{response.Keys.Length} key(s)",
                                 $"{response.Keys.Length} مفتاح");
        }
        catch (VanitasError ex)
        {
            Status.Text = L10n.Failed(ex.Reason);
        }
        catch (OperationCanceledException)
        {
            Status.Text = L10n.T("Cancelled", "تم الإلغاء");
        }
        finally
        {
            RefreshButton.IsEnabled = true;
        }
    }

    private async void Refresh_Click(object sender, RoutedEventArgs e) =>
        await RefreshAsync();

    private void CaptureSelection() =>
        _selected = Grid.SelectedItem as ApiKey;

    private void Create_Click(object sender, RoutedEventArgs e) => OpenCreate();

    /// The Ctrl+K path: the window navigates here after switching to this tab.
    public void OpenCreate()
    {
        if (_loaded is null) return;

        var dialog = new CreateKeyWindow(_env, _loaded.AllScopes)
        {
            Owner = Window.GetWindow(this),
        };

        if (dialog.ShowDialog() != true) return;
        _ = RefreshAsync();
    }

    private async void Rotate_Click(object sender, RoutedEventArgs e)
    {
        CaptureSelection();
        if (_selected is null)
        {
            Status.Text = L10n.T("Select a key first", "اختر مفتاحًا أولًا");
            return;
        }

        var confirm = MessageBox.Show(
            Window.GetWindow(this),
            L10n.T($"Rotate “{_selected.Name}”? The old secret stops working at once.",
                   $"تدوير «{_selected.Name}»؟ القائمة القديمة تبطل فورًا."),
            L10n.T("Rotate key", "تدوير المفتاح"),
            MessageBoxButton.OKCancel, MessageBoxImage.Warning);

        if (confirm != MessageBoxResult.OK) return;

        try
        {
            var rotated = await _env.Client.RotateKeyAsync(_selected.Id);
            // The secret exists once — show it before anything else can.
            RevealWindow.ShowSecret(Window.GetWindow(this), rotated);
            await RefreshAsync();
        }
        catch (VanitasError ex)
        {
            Status.Text = L10n.Failed(ex.Reason);
        }
        catch (OperationCanceledException)
        {
            Status.Text = L10n.T("Cancelled", "تم الإلغاء");
        }
    }

    private async void Revoke_Click(object sender, RoutedEventArgs e)
    {
        CaptureSelection();
        if (_selected is null)
        {
            Status.Text = L10n.T("Select a key first", "اختر مفتاحًا أولًا");
            return;
        }

        var confirm = MessageBox.Show(
            Window.GetWindow(this),
            L10n.T($"Revoke “{_selected.Name}” permanently?",
                   $"إلغاء «{_selected.Name}» نهائيًا؟"),
            L10n.T("Revoke key", "إلغاء المفتاح"),
            MessageBoxButton.OKCancel, MessageBoxImage.Stop);

        if (confirm != MessageBoxResult.OK) return;

        try
        {
            await _env.Client.RevokeKeyAsync(_selected.Id);
            Status.Text = L10n.T("Revoked", "تم الإلغاء");
            await RefreshAsync();
        }
        catch (VanitasError ex)
        {
            Status.Text = L10n.Failed(ex.Reason);
        }
        catch (OperationCanceledException)
        {
            Status.Text = L10n.T("Cancelled", "تم الإلغاء");
        }
    }
}
