using System.Globalization;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using Vanitas.Core;

namespace Vanitas.Desktop.Views;

public partial class UsageView : UserControl
{
    private readonly AppEnvironment _env;
    private UsageAnalytics? _loaded;
    private bool _initialised;

    public UsageView(AppEnvironment env)
    {
        _env = env;
        InitializeComponent();
        Localise();

        // SelectionChanged fires while the items are being added; ignoring the
        // first pass stops a pointless request before anything is chosen.
        foreach (var period in UsagePeriods.Allowed)
            PeriodBox.Items.Add(period);
        PeriodBox.SelectedIndex = 0;
        _initialised = true;

        _ = RefreshAsync();
    }

    private void Localise()
    {
        Title.Text = L10n.Usage;
        RefreshButton.Content = L10n.Refresh;
        ExportButton.Content = L10n.ExportCsv;
        VolumeLabel.Text = L10n.T("Requests", "الطلبات");
        SuccessLabel.Text = L10n.T("Success rate", "نسبة النجاح");
        ThrottledLabel.Text = L10n.T("Rate-limited (429)", "محدودة (429)");
        ErrorLabel.Text = L10n.T("Errors", "الأخطاء");
        AlertsTitle.Text = L10n.T("Alerts", "التنبيهات");
    }

    private string Period => (PeriodBox.SelectedItem as string) ?? "24h";

    private async void Period_Changed(object sender, SelectionChangedEventArgs e)
    {
        if (_initialised) await RefreshAsync();
    }

    private async void Refresh_Click(object sender, RoutedEventArgs e) =>
        await RefreshAsync();

    public async Task RefreshAsync()
    {
        RefreshButton.IsEnabled = false;
        try
        {
            var usage = await _env.Client.UsageAsync(Period);
            _loaded = usage;

            VolumeValue.Text = usage.TotalVolume.ToString("N0");
            SuccessValue.Text = usage.OverallSuccessRate.ToString("0.##") + "%";
            ThrottledValue.Text = usage.OverallThrottledCount.ToString("N0");
            ErrorValue.Text = usage.OverallErrorCount.ToString("N0");

            Grid.ItemsSource = usage.Summaries;

            RenderAlerts(usage);
            Status.Text = L10n.T(
                $"{usage.Summaries.Length} key(s) · {usage.Period}",
                $"{usage.Summaries.Length} مفتاح · {usage.Period}");
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

    /// Runs the evaluator the core is tested against, then records what it
    /// raised so the next refresh inside the same window stays quiet.
    private void RenderAlerts(UsageAnalytics usage)
    {
        var thresholds = new AlertThresholds(
            quotaPercent: _env.Store.QuotaThresholdPercent);

        var alerts = UsageEvaluator.EvaluateAndRecord(
            usage, _env.Store, thresholds, DateTimeOffset.UtcNow.ToUnixTimeMilliseconds());

        AlertsList.Items.Clear();

        if (alerts.Count > 0)
        {
            foreach (var alert in alerts)
                AlertsList.Items.Add(AlertLine(alert));
            AlertsCard.Visibility = Visibility.Visible;
            return;
        }

        // Nothing new — but say so only if there was something in the window to
        // begin with, so an empty account is not congratulated for silence.
        if (usage.Summaries.Any(s => s.TotalRequests > 0))
        {
            AlertsList.Items.Add(AlertLine(null));
            AlertsCard.Visibility = Visibility.Visible;
        }
        else
        {
            AlertsCard.Visibility = Visibility.Collapsed;
        }
    }

    private TextBlock AlertLine(UsageAlert? alert)
    {
        if (alert is null)
        {
            return new TextBlock
            {
                Text = L10n.T("No alerts in this window", "لا توجد تنبيهات في هذه الفترة"),
                Foreground = (Brush)FindResource("MutedBrush"),
                TextWrapping = TextWrapping.Wrap,
                Margin = new Thickness(0, 4, 0, 0),
            };
        }

        var (text, brush) = alert.Kind switch
        {
            AlertKind.Quota => (
                L10n.T($"“{alert.KeyName}” has used {alert.QuotaPercent}% of its monthly quota",
                       $"«{alert.KeyName}» استهلك {alert.QuotaPercent}٪ من رصيده الشهري"),
                "AccentBrush"),
            AlertKind.Errors => (
                L10n.T($"“{alert.KeyName}” failed {alert.ErrorCount} of {alert.TotalRequests} requests",
                       $"«{alert.KeyName}» فشل {alert.ErrorCount} من {alert.TotalRequests} طلب"),
                "DangerBrush"),
            _ => (
                L10n.T($"“{alert.KeyName}” was rate-limited {alert.ThrottledCount} times",
                       $"«{alert.KeyName}» تم تحديده {alert.ThrottledCount} مرة"),
                "AccentBrush"),
        };

        return new TextBlock
        {
            Text = text,
            Foreground = (Brush)FindResource(brush),
            TextWrapping = TextWrapping.Wrap,
            FontWeight = FontWeights.SemiBold,
            Margin = new Thickness(0, 4, 0, 0),
        };
    }

    private async void Export_Click(object sender, RoutedEventArgs e)
    {
        // Re-fetch rather than exporting a stale snapshot: the button promises
        // the numbers on screen right now, and the period may have changed.
        if (_loaded is null || _loaded.Period != Period)
        {
            try
            {
                _loaded = await _env.Client.UsageAsync(Period);
            }
            catch (VanitasError ex)
            {
                Status.Text = L10n.Failed(ex.Reason);
                return;
            }
        }

        // File names use the invariant format so a download made on a machine
        // set to Arabic does not carry Arabic digits into the filesystem.
        var suggested = $"vanitas-usage-{_loaded.Period}-" +
                        DateTime.UtcNow.ToString("yyyyMMdd-HHmm", CultureInfo.InvariantCulture) +
                        ".csv";

        var path = CsvExport.Save(suggested, CsvExport.Usage(_loaded));
        Status.Text = path is null
            ? L10n.T("Nothing downloaded", "لم يتم تنزيل شيء")
            : L10n.T($"Saved to {path}", $"تم الحفظ في {path}");
    }
}
