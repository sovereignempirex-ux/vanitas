using System.Windows;
using System.Windows.Threading;

namespace Vanitas.Desktop;

public partial class App : Application
{
    /// Built once at startup, before the first window: the store, the transport
    /// and the request log are process-wide singletons by design.
    public AppEnvironment? Environ { get; private set; }

    protected override void OnStartup(StartupEventArgs e)
    {
        base.OnStartup(e);
        Environ = new AppEnvironment(Dispatcher);

        // A desktop app that vanishes on the first unhandled exception is worse
        // than one that reports it — the user sees a dialog naming what failed
        // and the app keeps running. The Logs screen still has the history.
        //
        // Subscribed rather than overridden: `Application` exposes this as an
        // event, not a virtual method.
        DispatcherUnhandledException += (_, args) =>
        {
            MessageBox.Show(
                args.Exception.Message,
                L10n.T("Something went wrong", "حدث خطأ ما"),
                MessageBoxButton.OK,
                MessageBoxImage.Warning);

            // Swallow it: we showed what happened, and the window tree is
            // still consistent enough to keep using.
            args.Handled = true;
        };
    }

    protected override void OnExit(ExitEventArgs e)
    {
        // Flushes the settings file — a server URL changed a second ago must
        // not be forgotten because the user quit from the taskbar.
        Environ?.Dispose();
        base.OnExit(e);
    }
}
