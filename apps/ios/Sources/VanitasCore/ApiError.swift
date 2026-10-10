import Foundation

/// Everything that can go wrong between the app and the gateway, narrowed to
/// the three cases a view actually has to branch on. Screens never see a raw
/// `URLError` or a `DecodingError` — they see a `VanitasError` and pick a
/// message/next step.
public enum VanitasError: Error, Equatable {
    /// Server unreachable: DNS failure, refused connection, timeout.
    case network(String)
    /// The gateway answered with a non-2xx status and its own `{error}` text.
    /// `twoFactorRequired` is true when the password was right but a TOTP code
    /// is still missing.
    case http(status: Int, reason: String, twoFactorRequired: Bool)
    /// 2xx, but not the JSON shape this version of the app understands.
    case decoding(String)

    /// Session token was rejected — the caller should force a re-login.
    public var isAuthFailure: Bool {
        if case let .http(status, _, _) = self {
            return status == 401 || status == 403
        }
        return false
    }

    /// The sentence worth showing, never a type name.
    public var message: String {
        switch self {
        case let .network(text):
            return text
        case let .http(_, reason, _):
            return reason
        case let .decoding(text):
            return text
        }
    }

    /// The gateway's own TOTP hint, if it sent one.
    public var twoFactorRequired: Bool {
        if case let .http(_, _, required) = self {
            return required
        }
        return false
    }
}

extension VanitasError: LocalizedError {
    public var errorDescription: String? { message }
}
