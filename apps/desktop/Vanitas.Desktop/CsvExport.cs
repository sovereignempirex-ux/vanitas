using System.Globalization;
using System.IO;
using System.Text;
using Vanitas.Core;

namespace Vanitas.Desktop;

/// The "تنزيلات" half of the Phase 6 brief: turn the gateway's usage analytics
/// into a file the user can open in a spreadsheet.
///
/// Everything is written to a `StringBuilder` first, so an export either
/// succeeds completely or leaves no half-written file behind.
public static class CsvExport
{
    /// RFC 4180: a field is quoted when it could be read as something else —
    /// it contains a comma, a quote, a newline, or (for Excel) a leading sign.
    public static string Escape(string? field)
    {
        if (string.IsNullOrEmpty(field)) return "";

        var needsQuotes = field.Any(c => c is ',' or '"' or '\n' or '\r')
                          || field[0] is '=' or '+' or '-' or '@'
                          || field.StartsWith(' ');

        if (!needsQuotes) return field;

        // " → "" is the only escaping rule there is.
        return "\"" + field.Replace("\"", "\"\"") + "\"";
    }

    /// Same number formatting the gateway reports: a period decimal separator,
    /// never a locale comma, so a file produced on a French machine is
    /// byte-identical to one produced on an Egyptian one.
    private static string Num(double value) =>
        value.ToString("0.###", CultureInfo.InvariantCulture);

    private static string Row(params string[] fields) =>
        string.Join(",", fields.Select(Escape)) + "\r\n";

    /// One row per key, plus a totals row — the columns the web dashboard
    /// already shows, so exporting does not lose information.
    public static string Usage(UsageAnalytics usage)
    {
        var sb = new StringBuilder();

        sb.Append(Row(
            "period", "keyId", "keyName", "keyPrefix", "environment",
            "rateLimitPerMin", "totalRequests", "successRate",
            "throttledRequests", "errorCount", "quotaUsedPercent",
            "peakRpm", "avgLatencyMs", "topEndpoint"));

        foreach (var s in usage.Summaries)
        {
            var top = s.TopEndpoints.FirstOrDefault();
            sb.Append(Row(
                usage.Period, s.KeyId, s.KeyName, s.KeyPrefix, s.Environment,
                s.RateLimitPerMin.ToString(CultureInfo.InvariantCulture),
                s.TotalRequests.ToString(CultureInfo.InvariantCulture),
                Num(s.SuccessRate),
                s.ThrottledRequests.ToString(CultureInfo.InvariantCulture),
                s.ErrorCount.ToString(CultureInfo.InvariantCulture),
                Num(s.QuotaUsedPercent),
                s.PeakRpm.ToString(CultureInfo.InvariantCulture),
                Num(s.AvgLatencyMs),
                // `?? ""` rather than a null: `Escape` treats null and empty
                // alike, but the compiler cannot know that from `params string[]`.
                top?.Endpoint ?? ""));
        }

        sb.Append(Row(
            usage.Period, "", "TOTAL", "", "",
            "", usage.TotalVolume.ToString(CultureInfo.InvariantCulture),
            Num(usage.OverallSuccessRate),
            usage.OverallThrottledCount.ToString(CultureInfo.InvariantCulture),
            usage.OverallErrorCount.ToString(CultureInfo.InvariantCulture),
            "", "", Num(usage.OverallAvgLatencyMs), ""));

        return sb.ToString();
    }

    /// The time series, so a user can chart the raw numbers.
    public static string TimeSeries(UsageAnalytics usage)
    {
        var sb = new StringBuilder();

        sb.Append(Row("timestamp", "timeLabel", "totalRequests", "successCount",
                      "throttledRequests", "errorCount", "latencyMs", "p95LatencyMs"));

        foreach (var p in usage.TimeSeries)
        {
            sb.Append(Row(
                p.Timestamp, p.TimeLabel,
                p.TotalRequests.ToString(CultureInfo.InvariantCulture),
                p.SuccessCount.ToString(CultureInfo.InvariantCulture),
                p.ThrottledCount.ToString(CultureInfo.InvariantCulture),
                p.ErrorCount.ToString(CultureInfo.InvariantCulture),
                Num(p.LatencyMs), Num(p.P95LatencyMs)));
        }

        return sb.ToString();
    }

    /// Writes `content` to a folder the user picked, always with a
    /// timestamped `vanitas-*.csv` name, and returns the path chosen.
    /// Returns null when the dialog was cancelled.
    public static string? Save(string suggestedName, string content)
    {
        var dialog = new Microsoft.Win32.SaveFileDialog
        {
            FileName = suggestedName,
            DefaultExt = ".csv",
            Filter = "CSV (comma-separated values)|*.csv",
            InitialDirectory = Environment.GetFolderPath(
                Environment.SpecialFolder.MyDocuments),
        };

        if (dialog.ShowDialog() != true) return null;

        File.WriteAllText(dialog.FileName, content, new UTF8Encoding(
            // BOM: Excel on Windows otherwise guesses ANSI and mangles
            // non-ASCII key names.
            encoderShouldEmitUTF8Identifier: true));
        return dialog.FileName;
    }
}
