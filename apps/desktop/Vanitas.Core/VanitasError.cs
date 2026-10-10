namespace Vanitas.Core;

// Everything that can go wrong between the app and the gateway, narrowed to
// the three cases a screen actually has to branch on. Nothing above the client
// ever sees an `HttpRequestException` or a `JsonException` — it sees a
// `VanitasError` and picks a message / next step.
//
// Swift models this as an enum with associated values; C# has no direct
// equivalent that is also an `Exception`, so the discriminating tag becomes an
// enum and the payloads become properties, with static factories keeping the
// call sites as short as the Swift ones.

public enum VanitasErrorKind
{
    /// Server unreachable: DNS failure, refused connection, timeout.
    Network,
    /// Non-2xx status carrying the gateway's own `{error}` text.
    Http,
    /// 2xx, but not the JSON shape this version of the app understands.
    Decoding,
}

public sealed class VanitasError : Exception
{
    public VanitasErrorKind Kind { get; }

    /// HTTP status for `Kind == Http`, otherwise null.
    public int? StatusCode { get; }

    /// The gateway's own message, or the synthesised fallback.
    public string Reason { get; }

    /// True when the password was right but a TOTP code is still missing.
    public bool TwoFactorRequired { get; }

    private VanitasError(VanitasErrorKind kind, string reason, int? statusCode = null,
                         bool twoFactorRequired = false)
        : base(reason)
    {
        Kind = kind;
        Reason = reason;
        StatusCode = statusCode;
        TwoFactorRequired = twoFactorRequired;
    }

    public static VanitasError Network(string reason) =>
        new(VanitasErrorKind.Network, reason);

    public static VanitasError Http(int status, string reason, bool twoFactorRequired = false) =>
        new(VanitasErrorKind.Http, reason, status, twoFactorRequired);

    public static VanitasError Decoding(string reason) =>
        new(VanitasErrorKind.Decoding, reason);

    /// Session token was rejected — the caller should force a re-login.
    public bool IsAuthFailure =>
        Kind == VanitasErrorKind.Http && StatusCode is 401 or 403;
}
