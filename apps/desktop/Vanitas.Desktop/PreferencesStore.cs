using System.IO;
using System.Text.Json;
using Vanitas.Core;

namespace Vanitas.Desktop;

/// Where the desktop app keeps its session and preferences.
///
/// The same `ISessionStore` the tests use, but backed by a JSON file in
/// `%APPDATA%` so a signed-in user stays signed in across launches. Nothing
/// secret is written down: the session token is stored as-is (matching what
/// the browser stores in localStorage) and can be dropped at any time from
/// Settings.
public sealed class PreferencesStore : ISessionStore, IDisposable
{
    // `sealed` + a JSON DTO means unknown keys written by a newer build are
    // skipped rather than fatal — the same "the server can grow first" rule
    // the wire models follow.
    private sealed record Persisted(
        string? Token,
        string ServerUrl,
        bool NotificationsEnabled,
        int QuotaThresholdPercent);

    private static readonly JsonSerializerOptions Json = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        PropertyNameCaseInsensitive = true,
        WriteIndented = true,
    };

    private readonly object _gate = new();
    private readonly string _path;
    private readonly List<string> _seen = [];

    private const int MaxSeen = 500;

    public PreferencesStore(string? path = null)
    {
        _path = path ?? DefaultPath();
        Load();
    }

    /// One file per user per install, next to other apps' settings.
    public static string DefaultPath() => Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
        "Vanitas", "settings.json");

    public string? Token { get; set; }
    public string ServerUrl { get; set; } = InMemorySessionStore.DefaultServerUrl;
    public bool NotificationsEnabled { get; set; } = true;
    public int QuotaThresholdPercent { get; set; } = 80;

    public bool HasSeen(string dedupeKey)
    {
        lock (_gate) return _seen.Contains(dedupeKey);
    }

    public void MarkSeen(string dedupeKey)
    {
        lock (_gate)
        {
            if (_seen.Contains(dedupeKey)) return;
            _seen.Add(dedupeKey);
            // Oldest first, bounded — a long-lived tray process must not grow
            // this list forever.
            while (_seen.Count > MaxSeen) _seen.RemoveAt(0);
        }
    }

    public void ClearSeen()
    {
        lock (_gate) _seen.Clear();
    }

    public void ClearSession()
    {
        lock (_gate)
        {
            Token = null;
            _seen.Clear();
        }
        Save();
    }

    /// Writes every current value. Called after any setter that should outlive
    /// the process; `Dispose` also flushes so an app closed from the taskbar
    /// does not lose a just-changed server URL.
    public void Save()
    {
        Persisted snapshot;
        lock (_gate)
        {
            snapshot = new Persisted(Token, ServerUrl, NotificationsEnabled, QuotaThresholdPercent);
        }

        try
        {
            Directory.CreateDirectory(Path.GetDirectoryName(_path)!);
            File.WriteAllText(_path, JsonSerializer.Serialize(snapshot, Json));
        }
        catch (Exception)
        {
            // A read-only or full profile must not stop the app from working —
            // it only means the next launch starts fresh.
        }
    }

    private void Load()
    {
        try
        {
            if (!File.Exists(_path)) return;
            var persisted = JsonSerializer.Deserialize<Persisted>(
                File.ReadAllText(_path), Json);
            if (persisted is null) return;

            Token = persisted.Token;
            if (!string.IsNullOrWhiteSpace(persisted.ServerUrl))
                ServerUrl = persisted.ServerUrl;
            NotificationsEnabled = persisted.NotificationsEnabled;
            QuotaThresholdPercent = persisted.QuotaThresholdPercent;
        }
        catch (Exception)
        {
            // Corrupt or unreadable settings are indistinguishable from no
            // settings; defaults are always safe.
        }
    }

    public void Dispose() => Save();
}
