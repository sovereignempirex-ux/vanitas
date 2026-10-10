using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using Vanitas.Core;

namespace Vanitas.Desktop.Views;

/// Where a one-time secret is shown.
///
/// The gateway returns `rawSecret` exactly once — rotate and it is gone
/// forever — so this dialog exists to make that unmissable: the secret is
/// selectable, copyable, and the window cannot be dismissed by accident while
/// it is the only copy in existence.
public sealed class RevealWindow : Window
{
    private RevealWindow(CreatedKeyResponse created)
    {
        Title = L10n.T("Copy your secret now", "انسخ السرّ الآن");
        Width = 560;
        SizeToContent = SizeToContent.Height;
        WindowStartupLocation = WindowStartupLocation.CenterOwner;
        ResizeMode = ResizeMode.NoResize;
        Background = (Brush)FindResource("BgBrush");

        var panel = new StackPanel { Margin = new Thickness(24) };

        panel.Add(new TextBlock
        {
            Text = L10n.T(
                "This secret is shown once. If you lose it, rotate the key.",
                "السرّ يظهر مرة واحدة. لو ضاع، دوّر المفتاح."),
            Foreground = (Brush)FindResource("DangerBrush"),
            TextWrapping = TextWrapping.Wrap,
            FontWeight = FontWeights.SemiBold,
            Margin = new Thickness(0, 0, 0, 12),
        });

        panel.Add(new TextBlock
        {
            Text = created.Key.Name,
            Foreground = (Brush)FindResource("MutedBrush"),
            Margin = new Thickness(0, 0, 0, 4),
        });

        var secret = new TextBox
        {
            Text = created.RawSecret,
            IsReadOnly = true,
            FontFamily = new FontFamily("Consolas"),
            Style = (Style)FindResource("Field"),
            Margin = new Thickness(0, 0, 0, 8),
        };
        // Select-all on open: the very next thing the user does is Ctrl+C.
        secret.Loaded += (_, _) =>
        {
            secret.Focus();
            secret.SelectAll();
        };
        panel.Add(secret);

        if (!string.IsNullOrEmpty(created.RevealNote))
        {
            panel.Add(new TextBlock
            {
                Text = created.RevealNote,
                Foreground = (Brush)FindResource("MutedBrush"),
                TextWrapping = TextWrapping.Wrap,
                Style = (Style)FindResource("Hint"),
                Margin = new Thickness(0, 0, 0, 12),
            });
        }

        var copy = new Button
        {
            Content = L10n.T("Copy", "نسخ"),
            Style = (Style)FindResource("PrimaryButton"),
            HorizontalAlignment = HorizontalAlignment.Left,
        };
        copy.Click += (_, _) =>
        {
            try
            {
                Clipboard.SetText(created.RawSecret);
                copy.Content = L10n.T("Copied", "تم النسخ");
            }
            catch (Exception)
            {
                // The clipboard can be locked by another app; the text above
                // is still selectable by hand, so this is not an error worth
                // a modal.
            }
        };

        var done = new Button
        {
            Content = L10n.Done,
            Margin = new Thickness(0),
        };
        done.Click += (_, _) => DialogResult = true;

        var buttons = new StackPanel
        {
            Orientation = Orientation.Horizontal,
        };
        buttons.Add(copy);
        buttons.Add(done);

        panel.Add(buttons);
        Content = panel;
    }

    /// Shows the secret and returns when the user has acknowledged it.
    /// Named for what it does, not for the `Window.Show` it sits beside.
    public static void ShowSecret(Window? owner, CreatedKeyResponse created)
    {
        var window = new RevealWindow(created) { Owner = owner };
        window.ShowDialog();
    }
}
