using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using Vanitas.Core;

namespace Vanitas.Desktop.Views;

/// The new-key form. Built in code rather than XAML: every property is a
/// compile-time-checked call, and a dialog a user cannot fill in because a
/// binding name drifted is worse than one that took ten more lines to write.
public sealed class CreateKeyWindow : Window
{
    private readonly AppEnvironment _env;
    private readonly TextBox _name = Field();
    private readonly TextBox _rate = Field();
    private readonly ComboBox _environment = Combo();
    private readonly List<CheckBox> _scopes = [];

    /// The key the gateway created, or null when the dialog was cancelled.
    public CreatedKeyResponse? Created { get; private set; }

    public CreateKeyWindow(AppEnvironment env, ScopeInfo[] allScopes)
    {
        _env = env;

        Title = L10n.T("New API key", "مفتاح API جديد");
        Width = 460;
        SizeToContent = SizeToContent.Height;
        WindowStartupLocation = WindowStartupLocation.CenterOwner;
        ResizeMode = ResizeMode.NoResize;
        Background = (Brush)FindResource("BgBrush");

        _environment.ItemsSource = new[] { "test", "live" };
        _environment.SelectedIndex = 0;
        _rate.Text = "600";

        var panel = new StackPanel { Margin = new Thickness(24) };

        panel.Add(Label(L10n.T("Name", "الاسم")));
        panel.Add(_name);

        panel.Add(Label(L10n.Environment));
        panel.Add(_environment);

        panel.Add(Label(L10n.T("Rate limit (requests/min)", "حد الطلبات (في الدقيقة)")));
        panel.Add(_rate);

        panel.Add(Label(L10n.T("Scopes", "الصلاحيات")));

        // Scrollable, because the gateway's scope list is long enough that a
        // fixed-height dialog would push the buttons off screen.
        var scopeBox = new StackPanel { MaxHeight = 220 };
        foreach (var scope in allScopes)
        {
            var box = new CheckBox
            {
                Content = $"{scope.Scope} — {scope.Label}",
                Foreground = (Brush)FindResource("TextBrush"),
                Margin = new Thickness(0, 0, 0, 6),
                // Opt-in: a key is born with the narrowest scopes that make it
                // useful, and admin powers are never part of the default.
                IsChecked = !scope.AdminOnly && scope.Scope == "apikeys:read",
            };
            _scopes.Add(box);
            scopeBox.Add(box);
        }

        panel.Add(new ScrollViewer
        {
            Content = scopeBox,
            VerticalScrollBarVisibility = ScrollBarVisibility.Auto,
            Margin = new Thickness(0, 0, 0, 12),
        });

        var error = new TextBlock
        {
            Foreground = (Brush)FindResource("DangerBrush"),
            TextWrapping = TextWrapping.Wrap,
            Margin = new Thickness(0, 0, 0, 8),
        };

        var create = new Button
        {
            Content = L10n.T("Create", "إنشاء"),
            Style = (Style)FindResource("PrimaryButton"),
            HorizontalAlignment = HorizontalAlignment.Right,
        };
        create.Click += async (_, _) =>
        {
            error.Text = "";
            if (string.IsNullOrWhiteSpace(_name.Text))
            {
                error.Text = L10n.T("A name is required", "الاسم مطلوب");
                return;
            }

            var scopes = _scopes
                .Where(c => c.IsChecked == true)
                .Select(c => ((string)c.Content!).Split(' ')[0])
                .ToArray();

            if (scopes.Length == 0)
            {
                error.Text = L10n.T("Pick at least one scope", "اختر صلاحية واحدة على الأقل");
                return;
            }

            create.IsEnabled = false;
            try
            {
                Created = await _env.Client.CreateKeyAsync(new CreateKeyRequest
                {
                    Name = _name.Text.Trim(),
                    Scopes = scopes,
                    Environment = (string)(_environment.SelectedItem ?? "test"),
                    // A mistyped rate limit must not refuse the dialog.
                    RateLimitPerMin = int.TryParse(_rate.Text, out var r) ? r : 600,
                });
                DialogResult = true;
            }
            catch (VanitasError ex)
            {
                error.Text = L10n.Failed(ex.Reason);
                create.IsEnabled = true;
            }
            catch (OperationCanceledException)
            {
                error.Text = L10n.T("Cancelled", "تم الإلغاء");
                create.IsEnabled = true;
            }
        };

        var cancel = new Button
        {
            Content = L10n.Cancel,
            Margin = new Thickness(0),
        };
        cancel.Click += (_, _) => DialogResult = false;

        var buttons = new StackPanel
        {
            Orientation = Orientation.Horizontal,
            HorizontalAlignment = HorizontalAlignment.Right,
        };
        buttons.Add(cancel);
        buttons.Add(create);

        panel.Add(error);
        panel.Add(buttons);

        Content = panel;
        _name.Focus();
    }

    private static TextBox Field() => new()
    {
        Style = (Style)Application.Current.FindResource("Field"),
    };

    private static ComboBox Combo() => new()
    {
        Margin = new Thickness(0, 0, 0, 12),
    };

    private static TextBlock Label(string text) => new()
    {
        Text = text,
        Style = (Style)Application.Current.FindResource("Label"),
    };
}
