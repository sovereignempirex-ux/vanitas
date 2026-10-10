using System.Net.Http;
using System.Text;
using System.Text.Json;

namespace Vanitas.Core;

/// Typed client for the Vanitas gateway (`<baseUrl>/api/v1/…`).
///
/// Auth is the same session token the web app uses, sent as
/// `Authorization: Bearer <token>`; the token itself is injected by
/// `tokenProvider` on every request, so the client never owns the session and
/// a sign-out takes effect on the very next call.
///
/// Every failure is a `VanitasError` — `Network` when the server cannot be
/// reached, `Http` for a non-2xx (carrying the gateway's message and the 2FA
/// flag), `Decoding` for a payload this version cannot read. Cancellation is
/// left as `OperationCanceledException`, which is what `await`-based WPF code
/// expects when a window closes mid-flight.
public sealed class VanitasClient
{
    private readonly IHttpTransport _transport;
    private readonly Func<string?> _tokenProvider;
    private readonly IRequestObserver? _observer;
    private readonly string _base;
    private readonly string _apiPrefix;

    public string BaseUrl => _base;

    public static string UserAgent = "VanitasDesktop/1.0";

    public VanitasClient(
        string baseUrl,
        Func<string?>? tokenProvider = null,
        IHttpTransport? transport = null,
        string apiPrefix = "/api/v1",
        IRequestObserver? observer = null)
    {
        _transport = transport ?? new HttpClientTransport();
        _tokenProvider = tokenProvider ?? (() => null);
        _observer = observer;
        // Trim, don't tolerate: a trailing slash would double the separator.
        _base = baseUrl.Trim('/');
        _apiPrefix = apiPrefix;
    }

    // MARK: - Reads

    public Task<LoginResponse> LoginAsync(string email, string password, string? code = null,
                                          CancellationToken ct = default)
    {
        var trimmed = code?.Trim();
        return CallAsync<LoginRequest, LoginResponse>(
            "/auth/login", HttpMethod.Post,
            new LoginRequest
            {
                Email = email.Trim(),
                Password = password,
                // An all-whitespace code is the same as typing nothing.
                Code = string.IsNullOrEmpty(trimmed) ? null : trimmed,
            },
            ct: ct);
    }

    public Task<MeResponse> MeAsync(CancellationToken ct = default) =>
        CallAsync<MeResponse>("/auth/me", ct: ct);

    public Task<KeysResponse> ListKeysAsync(CancellationToken ct = default) =>
        CallAsync<KeysResponse>("/api-keys", ct: ct);

    public Task<UsageAnalytics> UsageAsync(string period = "24h", CancellationToken ct = default) =>
        CallAsync<UsageAnalytics>("/api-keys/usage-analytics", ct: ct,
            query: new Dictionary<string, string> { ["period"] = UsagePeriods.Normalize(period) });

    // MARK: - Writes

    public Task<CreatedKeyResponse> CreateKeyAsync(CreateKeyRequest request,
                                                   CancellationToken ct = default) =>
        CallAsync<CreateKeyRequest, CreatedKeyResponse>("/api-keys", HttpMethod.Post, request, ct: ct);

    public Task<CreatedKeyResponse> RotateKeyAsync(string id, CancellationToken ct = default) =>
        CallAsync<CreatedKeyResponse>($"/api-keys/{PathEncode(id)}/rotate", HttpMethod.Post, ct: ct);

    public Task<DeleteKeyResponse> RevokeKeyAsync(string id, CancellationToken ct = default) =>
        CallAsync<DeleteKeyResponse>($"/api-keys/{PathEncode(id)}", HttpMethod.Delete, ct: ct);

    /// Best-effort sign-out: a failure here must never block the local logout.
    public async Task<bool> LogoutAsync(CancellationToken ct = default)
    {
        try
        {
            await ExecuteAsync("/auth/logout", HttpMethod.Post, body: null, query: null, ct)
                .ConfigureAwait(false);
            return true;
        }
        catch (OperationCanceledException)
        {
            throw;
        }
        catch (VanitasError)
        {
            return false;
        }
    }

    // MARK: - Plumbing

    private async Task<T> CallAsync<T>(string path, HttpMethod? method = null,
                                        IReadOnlyDictionary<string, string>? query = null,
                                        CancellationToken ct = default) where T : class =>
        Decode<T>(await ExecuteAsync(path, method ?? HttpMethod.Get, null, query, ct)
            .ConfigureAwait(false), path);

    private async Task<TResponse> CallAsync<TBody, TResponse>(
        string path, HttpMethod method, TBody body, CancellationToken ct)
        where TBody : class where TResponse : class =>
        Decode<TResponse>(
            await ExecuteAsync(path, method, VanitasJson.Serialize(body), null, ct)
                .ConfigureAwait(false), path);

    /// Deserialisation failures are ours to report: screens branch on
    /// `VanitasError.Decoding`, and a raw `JsonException` would escape every
    /// catch in the shell.
    private static T Decode<T>(string json, string path) where T : class
    {
        try
        {
            return VanitasJson.Deserialize<T>(json);
        }
        catch (JsonException ex)
        {
            throw VanitasError.Decoding($"Unreadable response from {path}: {ex.Message}");
        }
    }

    private async Task<string> ExecuteAsync(string path, HttpMethod method, string? body,
                                            IReadOnlyDictionary<string, string>? query,
                                            CancellationToken ct)
    {
        var url = Endpoint(path, query);
        var stopwatch = System.Diagnostics.Stopwatch.StartNew();
        int? observedStatus = null;
        string? failure = null;

        using var request = new HttpRequestMessage(method, url);
        request.Headers.TryAddWithoutValidation("Accept", "application/json");
        request.Headers.TryAddWithoutValidation("User-Agent", UserAgent);

        var token = _tokenProvider();
        if (!string.IsNullOrEmpty(token))
            request.Headers.TryAddWithoutValidation("Authorization", $"Bearer {token}");

        if (body is not null)
            request.Content = new StringContent(body, Encoding.UTF8, "application/json");

        // `finally` reports on every exit — success, HTTP error, unreachable
        // host and cancellation alike, which is the only way a log of what the
        // app did can be trusted to be complete.
        try
        {
            TransportResponse response;
            try
            {
                response = await _transport.SendAsync(request, ct).ConfigureAwait(false);
                observedStatus = response.StatusCode;
            }
            catch (OperationCanceledException)
            {
                // Cancellation is not a network failure — rethrow it unchanged.
                failure = "cancelled";
                throw;
            }
            catch (VanitasError ve)
            {
                failure = ve.Reason;
                throw;
            }
            catch (Exception ex)
            {
                // DNS failure, refused connection, timeout …
                failure = ex.Message;
                throw VanitasError.Network(ex.Message);
            }

            if (response.StatusCode is >= 200 and < 300)
                return Encoding.UTF8.GetString(response.Body);

            var payload = TryParseErrorBody(response.Body);
            var reason = payload?.Error ?? $"HTTP {response.StatusCode} on {path}";
            failure = reason;
            throw VanitasError.Http(
                response.StatusCode, reason, payload?.TwoFactorRequired ?? false);
        }
        finally
        {
            Report(request.Method.Method, url, observedStatus,
                   stopwatch.ElapsedMilliseconds, failure);
        }
    }

    /// Never lets a reporter break the request it is reporting on — the
    /// interface promises it, and a UI log with a bug must not stop the app
    /// from working.
    private void Report(string method, Uri url, int? status, long elapsedMs, string? error)
    {
        if (_observer is null) return;
        try
        {
            _observer.Report(method, url, status, elapsedMs, error);
        }
        catch (Exception)
        {
            // Deliberately empty: see above.
        }
    }

    private Uri Endpoint(string path, IReadOnlyDictionary<string, string>? query)
    {
        var url = $"{_base}{_apiPrefix}{path}";
        if (query is { Count: > 0 })
        {
            // Sorted, so the same call always produces byte-identical URLs —
            // which is what makes the stub-based tests able to assert on them.
            var qs = string.Join("&", query
                .OrderBy(pair => pair.Key, StringComparer.Ordinal)
                .Select(pair => $"{Uri.EscapeDataString(pair.Key)}={Uri.EscapeDataString(pair.Value)}"));
            url = $"{url}?{qs}";
        }

        if (!Uri.TryCreate(url, UriKind.Absolute, out var uri))
            throw VanitasError.Decoding($"Bad URL for {path}");
        return uri;
    }

    private static ErrorBody? TryParseErrorBody(byte[] body)
    {
        try
        {
            return VanitasJson.Deserialize<ErrorBody>(Encoding.UTF8.GetString(body));
        }
        catch (Exception)
        {
            // The gateway sometimes answers a non-JSON error page; the status
            // code is still enough to report something honest.
            return null;
        }
    }

    /// Opaque ids go into a path segment, never raw.
    ///
    /// `Uri.EscapeDataString` is stricter than the Swift twin (which leaves the
    /// sub-delims alone) but that is safe here: ids are opaque tokens, and the
    /// segments a caller can reach — `a/b` in the rotate/revoke tests — encode
    /// to the same `%2F` on every platform.
    public static string PathEncode(string value) => Uri.EscapeDataString(value);
}
