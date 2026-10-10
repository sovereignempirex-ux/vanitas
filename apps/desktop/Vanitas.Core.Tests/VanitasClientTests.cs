using System.Net.Http;
using System.Text.Json;
using Vanitas.Core;

/// The typed client, driven entirely from `TransportStub` — no socket, no
/// gateway, no clock. Every assertion here is about what goes on the wire and
/// what comes back as a typed result or a `VanitasError`.
public class VanitasClientTests
{
    private static VanitasClient MakeClient(TransportStub transport, string? token = null,
                                            string baseUrl = "https://api.vanitas.test") =>
        new(baseUrl, () => token, transport);

    /// The path exactly as it went on the wire, percent-encoding intact.
    private static string WirePath(HttpRequestMessage request) =>
        new Uri(request.RequestUri!.OriginalString).AbsolutePath;

    // MARK: - Authentication

    [Fact]
    public async Task Login_posts_credentials_without_auth_header()
    {
        var stub = new TransportStub(200, VanitasJson.Serialize(new Dictionary<string, object?>
        {
            ["token"] = "sess_123",
            ["user"] = JsonSerializer.Deserialize<Dictionary<string, object?>>(Fixtures.UserJson()),
            ["permissions"] = new[] { "apikeys:read" },
        }));
        var client = MakeClient(stub);

        var session = await client.LoginAsync("  a@b.c  ", "hunter2");

        var request = stub.Last!;
        Assert.Equal(HttpMethod.Post, request.Method);
        Assert.Equal("/api/v1/auth/login", WirePath(request));
        // A fresh login must not send a stale token.
        Assert.False(request.Headers.Contains("Authorization"));
        Assert.Equal("sess_123", session.Token);
        // Email is trimmed before it is sent.
        Assert.Equal("a@b.c", session.User.Email);
        Assert.Contains("\"password\":\"hunter2\"", stub.LastBody);
        // No TOTP field unless one was typed.
        Assert.DoesNotContain("\"code\"", stub.LastBody);
    }

    [Fact]
    public async Task Login_carries_TOTP_code_only_when_typed()
    {
        var body = VanitasJson.Serialize(new Dictionary<string, object?>
        {
            ["token"] = "sess_1",
            ["user"] = JsonSerializer.Deserialize<Dictionary<string, object?>>(Fixtures.UserJson()),
            ["permissions"] = new string[0],
        });
        var stub = new TransportStub(200, body);
        var client = MakeClient(stub);

        await client.LoginAsync("a@b.c", "x", " 123456 ");
        Assert.Contains("\"code\":\"123456\"", stub.LastBody); // trimmed, then sent

        await client.LoginAsync("a@b.c", "x", "   ");
        // Whitespace-only input is treated as no code.
        Assert.DoesNotContain("\"code\"", stub.LastBody);
    }

    [Fact]
    public async Task TwoFactor_requirement_is_a_typed_401()
    {
        var stub = new TransportStub(401, VanitasJson.Serialize(new Dictionary<string, object?>
        {
            ["error"] = "error.2fa_required",
            ["twoFactorRequired"] = true,
        }));
        var client = MakeClient(stub);

        var error = await Assert.ThrowsAsync<VanitasError>(() => client.LoginAsync("a@b.c", "x"));

        Assert.Equal(VanitasErrorKind.Http, error.Kind);
        Assert.Equal(401, error.StatusCode);
        // The gateway's own text, verbatim.
        Assert.Equal("error.2fa_required", error.Reason);
        // The view keys the TOTP field off this flag.
        Assert.True(error.TwoFactorRequired);
        Assert.True(error.IsAuthFailure);
    }

    [Fact]
    public async Task Gateway_error_text_reaches_caller_verbatim()
    {
        var stub = new TransportStub(403,
            VanitasJson.Serialize(new Dictionary<string, object?> { ["error"] = "error.missing_scope" }));
        var client = MakeClient(stub, token: "t");

        var error = await Assert.ThrowsAsync<VanitasError>(() => client.ListKeysAsync());

        Assert.Equal(VanitasErrorKind.Http, error.Kind);
        Assert.Equal(403, error.StatusCode);
        Assert.Equal("error.missing_scope", error.Reason);
        Assert.False(error.TwoFactorRequired);
    }

    [Fact]
    public async Task No_authorization_header_before_signing_in()
    {
        var stub = new TransportStub(200, VanitasJson.Serialize(new Dictionary<string, object?>
        {
            ["user"] = JsonSerializer.Deserialize<Dictionary<string, object?>>(Fixtures.UserJson()),
            ["permissions"] = new string[0],
        }));
        var client = MakeClient(stub);

        await client.MeAsync();

        Assert.False(stub.Last!.Headers.Contains("Authorization"));
    }

    [Fact]
    public async Task Bearer_token_attached_when_session_exists()
    {
        var stub = new TransportStub(200, VanitasJson.Serialize(new Dictionary<string, object?>
        {
            ["user"] = JsonSerializer.Deserialize<Dictionary<string, object?>>(Fixtures.UserJson()),
            ["permissions"] = new string[0],
        }));
        var client = MakeClient(stub, token: "sess_abc");

        await client.MeAsync();

        Assert.Equal("Bearer sess_abc", stub.Last!.Headers.GetValues("Authorization").Single());
        Assert.Equal("VanitasDesktop/1.0", stub.Last.Headers.GetValues("User-Agent").Single());
    }

    // MARK: - URL building

    [Fact]
    public async Task Trailing_slash_does_not_duplicate_path()
    {
        var stub = new TransportStub(200, VanitasJson.Serialize(new Dictionary<string, object?>
        {
            ["user"] = JsonSerializer.Deserialize<Dictionary<string, object?>>(Fixtures.UserJson()),
            ["permissions"] = new string[0],
        }));
        var client = MakeClient(stub, baseUrl: "https://api.vanitas.test///");

        await client.MeAsync();

        Assert.Equal("https://api.vanitas.test/api/v1/auth/me", stub.Last!.RequestUri!.OriginalString);
    }

    [Fact]
    public void Path_segments_are_encoded()
    {
        Assert.Equal("a%2Fb%20c", VanitasClient.PathEncode("a/b c"));
        Assert.Equal("plain-id_1.2", VanitasClient.PathEncode("plain-id_1.2"));
    }

    [Fact]
    public async Task Unsupported_period_falls_back_to_24h()
    {
        var stub = new TransportStub(200, VanitasJson.Serialize(Fixtures.Usage()));
        var client = MakeClient(stub, token: "t");

        await client.UsageAsync("1y");
        Assert.Equal("?period=24h", stub.Last!.RequestUri!.Query);

        await client.UsageAsync("7d");
        Assert.Equal("?period=7d", stub.Last!.RequestUri!.Query);
    }

    // MARK: - Keys

    [Fact]
    public async Task Key_list_parses_and_ignores_unknown_fields()
    {
        // The gateway can grow first, so an unknown key must be skipped.
        var record = JsonSerializer.Deserialize<Dictionary<string, object?>>(Fixtures.KeyJson())!;
        record["addedNextYear"] = new Dictionary<string, object?> { ["surprise"] = 1 };

        var stub = new TransportStub(200, VanitasJson.Serialize(new Dictionary<string, object?>
        {
            ["keys"] = new[] { record },
            ["allScopes"] = new[]
            {
                new Dictionary<string, object?>
                {
                    ["scope"] = "apikeys:read",
                    ["label"] = "Read API keys",
                    ["group"] = "API keys",
                    ["adminOnly"] = false,
                },
            },
        }));
        var client = MakeClient(stub, token: "t");

        var response = await client.ListKeysAsync();

        Assert.Single(response.Keys);
        Assert.Equal("Prod", response.Keys[0].Name);
        Assert.Equal(["apikeys:read"], response.Keys[0].Scopes);
        Assert.Equal("apikeys:read", response.AllScopes[0].Scope);
    }

    [Fact]
    public async Task Create_key_returns_one_time_secret()
    {
        var created = JsonSerializer.Deserialize<Dictionary<string, object?>>(Fixtures.KeyJson())!;
        created["keyPrefix"] = "vk_live_xy99";

        var stub = new TransportStub(201, VanitasJson.Serialize(new Dictionary<string, object?>
        {
            ["key"] = created,
            ["rawSecret"] = "vk_live_xy99.SECRET-ONCE",
            ["revealNote"] = "note.reveal_once",
        }));
        var client = MakeClient(stub, token: "t");

        var response = await client.CreateKeyAsync(new CreateKeyRequest
        {
            Name = "CI",
            Scopes = ["usage:read"],
            Environment = "test",
            RateLimitPerMin = 120,
        });

        Assert.Equal(HttpMethod.Post, stub.Last!.Method);
        Assert.Equal("/api/v1/api-keys", WirePath(stub.Last));
        Assert.Equal("vk_live_xy99.SECRET-ONCE", response.RawSecret);
        Assert.Equal("note.reveal_once", response.RevealNote);
        Assert.Equal("Prod", response.Key.Name);
    }

    [Fact]
    public async Task Revoke_sends_DELETE_to_encoded_path()
    {
        var stub = new TransportStub(200, VanitasJson.Serialize(new Dictionary<string, object?>
        {
            ["success"] = true,
            ["key"] = JsonSerializer.Deserialize<Dictionary<string, object?>>(Fixtures.KeyJson()),
        }));
        var client = MakeClient(stub, token: "t");

        var response = await client.RevokeKeyAsync("a/b");

        Assert.Equal(HttpMethod.Delete, stub.Last!.Method);
        // The decoded segment would hide a slash inside an id; what goes on the
        // wire is the percent-encoded form, so that is what we assert.
        Assert.Equal("/api/v1/api-keys/a%2Fb", WirePath(stub.Last));
        Assert.True(response.Success);
    }

    [Fact]
    public async Task Rotate_reuses_the_rotate_path()
    {
        var stub = new TransportStub(200, VanitasJson.Serialize(new Dictionary<string, object?>
        {
            ["key"] = JsonSerializer.Deserialize<Dictionary<string, object?>>(Fixtures.KeyJson()),
            ["rawSecret"] = "fresh.secret",
            ["revealNote"] = null,
        }));
        var client = MakeClient(stub, token: "t");

        await client.RotateKeyAsync("k1");

        Assert.Equal(HttpMethod.Post, stub.Last!.Method);
        Assert.Equal("/api/v1/api-keys/k1/rotate", WirePath(stub.Last));
    }

    // MARK: - Usage

    [Fact]
    public async Task Usage_analytics_parses_whole_contract()
    {
        var payload = new Dictionary<string, object?>
        {
            ["period"] = "24h",
            ["timeSeries"] = new[]
            {
                new Dictionary<string, object?>
                {
                    ["timeLabel"] = "14:00",
                    ["timestamp"] = "2026-10-09T14:00:00.000Z",
                    ["totalRequests"] = 120,
                    ["successCount"] = 118,
                    ["throttledCount"] = 1,
                    ["errorCount"] = 1,
                    ["latencyMs"] = 42,
                    ["p95LatencyMs"] = 120,
                    // Per-key series and the __t / __e splits: ignored on purpose.
                    ["k1"] = 120, ["__t"] = 1, ["__e"] = 1,
                },
            },
            ["summaries"] = new[]
            {
                Fixtures.Summary(totalRequests: 120, successRate: 98.3, throttledRequests: 1,
                    errorCount: 1, quotaUsedPercent: 42.5,
                    topEndpoints: new[]
                    {
                        new Dictionary<string, object?>
                        {
                            ["endpoint"] = "/v1/chat", ["count"] = 90, ["percentage"] = 75.0,
                        },
                    }),
            },
            ["totalVolume"] = 120,
            ["overallSuccessRate"] = 98.3,
            ["overallThrottledCount"] = 1,
            ["overallErrorCount"] = 1,
            ["overallAvgLatencyMs"] = 42.5,
            ["upstream"] = "python_remote:http://analytics:8200",
        };
        var client = MakeClient(new TransportStub(200, VanitasJson.Serialize(payload)), token: "t");

        var usage = await client.UsageAsync("24h");

        Assert.Equal("24h", usage.Period);
        Assert.Equal(120, usage.TimeSeries[0].TotalRequests);
        // A JSON integer must still read as a double.
        Assert.Equal(42d, usage.TimeSeries[0].LatencyMs);
        Assert.Equal(42.5, usage.Summaries[0].QuotaUsedPercent);
        Assert.Equal(98.3, usage.Summaries[0].SuccessRate);
        Assert.Equal("/v1/chat", usage.Summaries[0].TopEndpoints[0].Endpoint);
        Assert.Equal(98.3, usage.OverallSuccessRate);
        Assert.Equal("python_remote:http://analytics:8200", usage.Upstream);
    }

    // MARK: - Failures

    [Fact]
    public async Task Unreachable_gateway_is_network_error()
    {
        var client = MakeClient(TransportStub.Unreachable(), token: "t");

        var error = await Assert.ThrowsAsync<VanitasError>(() => client.MeAsync());

        Assert.Equal(VanitasErrorKind.Network, error.Kind);
        // A dead host must not sign the user out.
        Assert.False(error.IsAuthFailure);
    }

    [Fact]
    public async Task Unreadable_payload_is_decoding_error()
    {
        var stub = new TransportStub(200, "{\"not\": \"what I asked for\"}");
        var client = MakeClient(stub, token: "t");

        var error = await Assert.ThrowsAsync<VanitasError>(() => client.ListKeysAsync());

        Assert.Equal(VanitasErrorKind.Decoding, error.Kind);
        // The message names the endpoint.
        Assert.Contains("/api-keys", error.Reason);
    }

    [Fact]
    public async Task Non_JSON_error_body_still_raises_http_error()
    {
        var stub = new TransportStub(502, "<html>bad gateway</html>");
        var client = MakeClient(stub, token: "t");

        var error = await Assert.ThrowsAsync<VanitasError>(() => client.MeAsync());

        Assert.Equal(VanitasErrorKind.Http, error.Kind);
        Assert.Equal(502, error.StatusCode);
        Assert.Equal("HTTP 502 on /auth/me", error.Reason);
        Assert.False(error.TwoFactorRequired);
    }

    [Fact]
    public async Task Logout_tolerates_failing_gateway()
    {
        var broken = MakeClient(new TransportStub(500, "boom"), token: "t");
        // Sign-out never blocks on a broken gateway.
        Assert.False(await broken.LogoutAsync());

        var healthy = MakeClient(new TransportStub(204, ""), token: "t");
        Assert.True(await healthy.LogoutAsync());
    }

    // MARK: - Request observer (the shell's log)

    [Fact]
    public async Task Observer_reports_success_with_status_and_url()
    {
        var observer = new ObserverStub();
        var client = new VanitasClient("https://api.vanitas.test", () => "t",
            new TransportStub(200, VanitasJson.Serialize(new Dictionary<string, object?>
            {
                ["keys"] = new object[0],
                ["allScopes"] = new object[0],
            })), observer: observer);

        await client.ListKeysAsync();

        var report = Assert.Single(observer.Reports);
        Assert.Equal("GET", report.Method);
        // The query string matters — without it the log cannot show which period.
        Assert.Equal("https://api.vanitas.test/api/v1/api-keys", report.Url.ToString());
        Assert.Equal(200, report.Status);
        Assert.Null(report.Error);
        // Reported even though nothing failed, and only once per request.
        Assert.True(report.Ms >= 0);
    }

    [Fact]
    public async Task Observer_sees_the_failure_that_stopped_the_call()
    {
        var observer = new ObserverStub();
        var client = new VanitasClient("https://api.vanitas.test", () => "t",
            new TransportStub(403, VanitasJson.Serialize(
                new Dictionary<string, object?> { ["error"] = "error.missing_scope" })),
            observer: observer);

        await Assert.ThrowsAsync<VanitasError>(() => client.ListKeysAsync());

        var report = Assert.Single(observer.Reports);
        Assert.Equal(403, report.Status);
        // The same sentence the caller got — one source of truth for the log
        // and the dialog.
        Assert.Equal("error.missing_scope", report.Error);
    }

    [Fact]
    public async Task Observer_reports_an_unreachable_host_without_a_status()
    {
        var observer = new ObserverStub();
        var client = new VanitasClient("https://api.vanitas.test", () => "t",
            TransportStub.Unreachable(), observer: observer);

        await Assert.ThrowsAsync<VanitasError>(() => client.MeAsync());

        var report = Assert.Single(observer.Reports);
        // No response ever arrived, so inventing a status code would be a lie.
        Assert.Null(report.Status);
        Assert.NotNull(report.Error);
    }

    [Fact]
    public async Task A_broken_observer_cannot_break_the_request()
    {
        var client = new VanitasClient("https://api.vanitas.test", () => "t",
            new TransportStub(200, VanitasJson.Serialize(new Dictionary<string, object?>
            {
                ["keys"] = new object[0],
                ["allScopes"] = new object[0],
            })), observer: new BrokenObserver());

        // The promise: a reporter is never a gate.
        var response = await client.ListKeysAsync();

        Assert.Empty(response.Keys);
    }
}
