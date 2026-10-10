using Vanitas.Core;

public class SessionStoreTests
{
    [Fact]
    public void Defaults_point_at_the_developers_machine()
    {
        var store = new InMemorySessionStore();

        Assert.Null(store.Token); // starting signed out is the safe default
        // The desktop app on the same box reaches `npm run dev` through localhost.
        Assert.Equal("http://localhost:3000", store.ServerUrl);
        Assert.True(store.NotificationsEnabled);
        Assert.Equal(80, store.QuotaThresholdPercent);
    }

    [Fact]
    public void Nothing_is_seen_before_it_is_announced()
    {
        var store = new InMemorySessionStore();

        Assert.False(store.HasSeen("QUOTA:k1:0"));
    }

    [Fact]
    public void Marking_twice_keeps_a_single_entry()
    {
        var store = new InMemorySessionStore();

        store.MarkSeen("QUOTA:k1:708687");
        store.MarkSeen("QUOTA:k1:708687");

        Assert.True(store.HasSeen("QUOTA:k1:708687"));
    }

    [Fact]
    public void ClearSession_drops_token_and_alert_history()
    {
        var store = new InMemorySessionStore();
        store.Token = "sess_1";
        store.MarkSeen("QUOTA:k1:708687");

        store.ClearSession();

        Assert.Null(store.Token);
        // The next account must not inherit stale alerts …
        Assert.False(store.HasSeen("QUOTA:k1:708687"));
        // … while the server address is a device preference.
        Assert.Equal("http://localhost:3000", store.ServerUrl);
    }

    [Fact]
    public void ClearSeen_keeps_the_session()
    {
        var store = new InMemorySessionStore();
        store.Token = "sess_1";
        store.MarkSeen("ERRORS:k1:708687");

        store.ClearSeen();

        Assert.Equal("sess_1", store.Token);
        Assert.False(store.HasSeen("ERRORS:k1:708687"));
    }

    [Fact]
    public void History_is_bounded()
    {
        var store = new InMemorySessionStore();

        for (var i = 0; i < 600; i++)
            store.MarkSeen($"K:{i}");

        Assert.False(store.HasSeen("K:0"));  // the oldest entries are evicted
        Assert.False(store.HasSeen("K:99"));
        Assert.True(store.HasSeen("K:599")); // the newest entries are kept
    }

    [Fact]
    public void Preferences_round_trip()
    {
        var store = new InMemorySessionStore();

        store.ServerUrl = "https://api.example.com";
        store.NotificationsEnabled = false;
        store.QuotaThresholdPercent = 55;

        Assert.Equal("https://api.example.com", store.ServerUrl);
        Assert.False(store.NotificationsEnabled);
        Assert.Equal(55, store.QuotaThresholdPercent);
    }
}
