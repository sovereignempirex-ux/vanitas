namespace Vanitas.Core;

/// An optional sink for what the client is doing over the wire.
///
/// This is the seam a shell hangs its request log off: the client already knows
/// the URL, the status and the duration, so asking every call site to report
/// them would be duplication that drifts. The interface lives in the core (no
/// WPF, no `ObservableCollection`) and the desktop shell implements it with a
/// bounded, dispatcher-safe list.
///
/// An observer is a *reporter*, never a gate: whatever it does — including
/// throwing — must not change the result of the request. `VanitasClient`
/// therefore invokes it inside a guard.
public interface IRequestObserver
{
    /// <param name="method">HTTP verb as sent.</param>
    /// <param name="url">Full request URL, query string included.</param>
    /// <param name="status">Response status, or null if none was received
    /// (the host was unreachable, or the call was cancelled).</param>
    /// <param name="elapsedMs">Wall-clock time from dispatch to response.</param>
    /// <param name="error">The `VanitasError.Reason` when one was raised,
    /// otherwise null.</param>
    void Report(string method, Uri url, int? status, long elapsedMs, string? error);
}
