using System.Windows;
using System.Windows.Threading;
using Vanitas.Core;

namespace Vanitas.Desktop;

/// The composition root: exactly one place decides which store, which
/// transport and which base URL the whole window uses.
///
/// Keeping it out of the views means the core stays free of WPF (so `dotnet
/// test` covers it headlessly) and swapping the transport in a test or a
/// future console build touches one object, not five windows.
public sealed class AppEnvironment : IDisposable
{
    private readonly HttpClientTransport _transport;

    public PreferencesStore Store { get; }
    public RequestLog Log { get; }

    /// Read fresh on every request — `VanitasClient` calls it per call, so
    /// changing the server URL in Settings applies to the very next request.
    public string Token
    {
        get => Store.Token ?? "";
        set => Store.Token = string.IsNullOrEmpty(value) ? null : value;
    }

    public VanitasClient Client { get; private set; }

    public AppEnvironment(Dispatcher dispatcher, string? settingsPath = null,
                          IHttpTransport? transport = null)
    {
        Store = new PreferencesStore(settingsPath);

        Log = new RequestLog(dispatcher);
        _transport = transport as HttpClientTransport ?? new HttpClientTransport();

        // The client reads `Store.Token` through the property so the client
        // itself never has to know a `PreferencesStore` exists, and reports to
        // `Log` so no call site has to remember to file its own entry.
        Client = new VanitasClient(
            Store.ServerUrl,
            () => Store.Token,
            transport ?? _transport,
            observer: Log);
    }

    /// Points the client at a different gateway without rebuilding anything.
    /// A trailing slash is trimmed here too, so Settings and the client agree.
    public void Reconnect()
    {
        Client = new VanitasClient(Store.ServerUrl.Trim('/'), () => Store.Token,
                                   _transport, observer: Log);
    }

    /// Clears the session locally and best-effort at the gateway. Always
    /// returns true: signing out must work even when the server does not.
    public bool SignOut()
    {
        try
        {
            _ = Client.LogoutAsync().GetAwaiter().GetResult();
        }
        catch (Exception)
        {
            // A broken gateway must not trap the user in their session.
        }

        Store.ClearSession();
        Store.Save();
        Log.Clear();
        return true;
    }

    public void Dispose()
    {
        Store.Save();
        _transport.Dispose();
    }
}
