using System.Collections.ObjectModel;
using System.ComponentModel;
using System.Runtime.CompilerServices;
using System.Windows;
using System.Windows.Threading;
using Vanitas.Core;

namespace Vanitas.Desktop;

/// One request the app made, as the Logs screen shows it.
///
/// The path is called `Route`, not `Path` — in a `Binding` expression `Path` is
/// already the binding's own property, and `{Binding Path}` would be read as
/// "bind to the property named Path" only by luck of how markup extensions
/// parse their first argument.
public sealed record RequestEntry(
    DateTime At,
    string Method,
    string Route,
    int? Status,
    long ElapsedMs,
    string? Error);

/// A bounded, observable history of every call this process made.
///
/// Two jobs: give the user somewhere to see what the app is actually doing
/// (the "سجلات" half of the Phase 6 brief), and give the status bar its
/// last-request summary without a second data structure.
///
/// Implements `IRequestObserver` — the client reports from its own `finally`,
/// so nothing here has to remember to start or stop a timer.
///
/// WPF's `INotifyPropertyChanged` and `ObservableCollection` must fire on the
/// UI thread, so every mutation is marshalled through the dispatcher — the
/// client's `ConfigureAwait(false)` continuations run on thread-pool threads
/// and would otherwise throw.
public sealed class RequestLog : INotifyPropertyChanged, IRequestObserver
{
    public const int MaxEntries = 500;

    private readonly Dispatcher _dispatcher;
    private readonly object _gate = new();

    public RequestLog(Dispatcher dispatcher, int maxEntries = MaxEntries)
    {
        _dispatcher = dispatcher;
        Max = maxEntries;
        Entries = new ObservableCollection<RequestEntry>();
    }

    public int Max { get; }

    public ObservableCollection<RequestEntry> Entries { get; }

    /// Non-null once an attempt failed outright — this is what the status bar
    /// turns red for.
    public string? LastError
    {
        get { lock (_gate) return _lastError; }
        private set
        {
            lock (_gate) _lastError = value;
            OnPropertyChanged(nameof(LastError));
        }
    }

    private string? _lastError;

    public event PropertyChangedEventHandler? PropertyChanged;

    public void Report(string method, Uri url, int? status, long elapsedMs, string? error) =>
        Add(method, url.PathAndQuery, status, elapsedMs, error);

    /// Records one attempt. Safe to call from any thread, any number of times.
    public void Add(string method, string path, int? status, long elapsedMs, string? error)
    {
        var entry = new RequestEntry(DateTime.Now, method, path, status, elapsedMs, error);

        RunOnUi(() =>
        {
            Entries.Add(entry);
            // Drop from the front, so the oldest request is the one evicted.
            while (Entries.Count > Max) Entries.RemoveAt(0);
        });

        LastError = error;
    }

    public void Clear()
    {
        RunOnUi(Entries.Clear);
        LastError = null;
    }

    /// Runs `action` on the UI thread, or immediately if already on it —
    /// so construction needs no dispatcher pump.
    private void RunOnUi(Action action)
    {
        if (_dispatcher.CheckAccess()) action();
        else _dispatcher.BeginInvoke(action);
    }

    private void OnPropertyChanged(string name) =>
        PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(name));
}
