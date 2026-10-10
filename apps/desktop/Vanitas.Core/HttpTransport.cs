using System.Net.Http;

namespace Vanitas.Core;

/// The seam the tests replace — the desktop twin of Swift's `HTTPTransport`
/// protocol and Kotlin's `HttpTransport` interface.
///
/// It is deliberately expressed in terms of BCL types (`HttpRequestMessage`)
/// so the production implementation is a thin wrapper over `HttpClient` and a
/// test double can inspect method, URL, headers and body without a socket, a
/// port or a clock.
public interface IHttpTransport
{
    /// Performs one request and returns the status line plus the raw body.
    /// A transport that cannot reach the host at all throws — the client turns
    /// that into `VanitasError.Network`.
    Task<TransportResponse> SendAsync(HttpRequestMessage request,
                                      CancellationToken cancellationToken = default);
}

public sealed record TransportResponse(int StatusCode, byte[] Body);

/// The production transport: one non-caching `HttpClient` with tight timeouts,
/// so a dead host fails in seconds instead of hanging a window.
///
/// One instance is shared for the process lifetime (the standard .NET guidance:
/// construct `HttpClient` once, never per request).
public sealed class HttpClientTransport : IHttpTransport, IDisposable
{
    /// Matches the Swift twin's `timeoutIntervalForResource`.
    public static readonly TimeSpan DefaultTimeout = TimeSpan.FromSeconds(30);

    private readonly HttpClient _http;

    public HttpClientTransport(TimeSpan? timeout = null, HttpMessageHandler? handler = null)
    {
        _http = handler is null ? new HttpClient() : new HttpClient(handler);
        _http.Timeout = timeout ?? DefaultTimeout;
    }

    public async Task<TransportResponse> SendAsync(HttpRequestMessage request,
                                                   CancellationToken cancellationToken = default)
    {
        using var response = await _http
            .SendAsync(request, HttpCompletionOption.ResponseHeadersRead, cancellationToken)
            .ConfigureAwait(false);

        var body = await response.Content
            .ReadAsByteArrayAsync(cancellationToken)
            .ConfigureAwait(false);

        return new TransportResponse((int)response.StatusCode, body);
    }

    public void Dispose() => _http.Dispose();
}
