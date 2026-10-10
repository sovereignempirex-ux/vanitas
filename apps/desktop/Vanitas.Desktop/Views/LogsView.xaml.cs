using System.Windows;
using System.Windows.Controls;

namespace Vanitas.Desktop.Views;

public partial class LogsView : UserControl
{
    private readonly AppEnvironment _env;

    public LogsView(AppEnvironment env)
    {
        _env = env;
        InitializeComponent();

        Title.Text = L10n.Logs;
        ClearButton.Content = L10n.T("Clear", "مسح");
        Hint.Text = L10n.T(
            $"Every request this app has made, newest last. Capped at {RequestLog.MaxEntries}.",
            $"كل طلب أرسله البرنامج، الأحدث في الآخر. محفوظ حتى {RequestLog.MaxEntries} سطر.");

        // The collection is the log's own — bound directly, so entries appear
        // the moment the client reports them, with no copy to fall behind.
        Grid.ItemsSource = _env.Log.Entries;

        _env.Log.PropertyChanged += (_, args) =>
        {
            if (args.PropertyName == nameof(RequestLog.LastError))
                UpdateStatus();
        };
        UpdateStatus();
    }

    private void UpdateStatus()
    {
        var error = _env.Log.LastError;
        Status.Text = error is null
            ? L10n.T("Last request succeeded", "آخر طلب نجح")
            : L10n.Failed(error);
    }

    private void Clear_Click(object sender, RoutedEventArgs e)
    {
        _env.Log.Clear();
        UpdateStatus();
    }
}
