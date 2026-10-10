namespace Vanitas.Core;

/// Where the app keeps its session and preferences.
///
/// Declared as an interface in the core so the client, the evaluator and their
/// tests never touch WPF; the desktop shell supplies an implementation that
/// persists to `%APPDATA%`, and the tests use `InMemorySessionStore`.
public interface ISessionStore
{
    /// Session token from `POST /auth/login`; null means signed out.
    string? Token { get; set; }

    /// Gateway origin without a trailing slash (the default points at the host
    /// machine, which is what a desktop app on the same box reaches).
    string ServerUrl { get; set; }

    bool NotificationsEnabled { get; set; }

    /// Warn once a key's monthly quota reaches this percentage.
    int QuotaThresholdPercent { get; set; }

    /// True when this exact alert was already raised (see `UsageAlert.DedupeKey`).
    bool HasSeen(string dedupeKey);

    void MarkSeen(string dedupeKey);

    void ClearSeen();

    /// Drops the token AND the alert history — used by sign-out.
    void ClearSession();
}

/// A store that forgets everything on process death — what the tests use.
public sealed class InMemorySessionStore : ISessionStore
{
    /// A desktop app on the developer's machine reaches `npm run dev` directly;
    /// a real deployment overrides it in Settings.
    public const string DefaultServerUrl = "http://localhost:3000";

    // Bounded so a long-lived process cannot grow this list forever.
    private const int MaxSeen = 500;

    private readonly List<string> _seen = [];

    public InMemorySessionStore(
        string serverUrl = DefaultServerUrl,
        string? token = null,
        bool notificationsEnabled = true,
        int quotaThresholdPercent = 80)
    {
        ServerUrl = serverUrl;
        Token = token;
        NotificationsEnabled = notificationsEnabled;
        QuotaThresholdPercent = quotaThresholdPercent;
    }

    public string? Token { get; set; }
    public string ServerUrl { get; set; }
    public bool NotificationsEnabled { get; set; }
    public int QuotaThresholdPercent { get; set; }

    public bool HasSeen(string dedupeKey) => _seen.Contains(dedupeKey);

    public void MarkSeen(string dedupeKey)
    {
        if (_seen.Contains(dedupeKey)) return;
        _seen.Add(dedupeKey);
        // Drop from the front, oldest first, exactly like the Swift twin.
        while (_seen.Count > MaxSeen)
            _seen.RemoveAt(0);
    }

    public void ClearSeen() => _seen.Clear();

    public void ClearSession()
    {
        Token = null;
        _seen.Clear();
    }
}
