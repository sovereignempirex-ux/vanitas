package com.vanitas.android.core

/**
 * Everything that can go wrong between the app and the gateway, narrowed to the
 * three cases a UI actually has to branch on. Screens never see a raw
 * `IOException` or a serialization stack trace — they see a [VanitasException]
 * and pick a message/next step.
 */
sealed class VanitasException(
    message: String,
    cause: Throwable? = null,
) : Exception(message, cause) {

    /** Server unreachable: DNS failure, refused connection, timeout. */
    class Network(
        message: String,
        cause: Throwable? = null,
    ) : VanitasException(message, cause)

    /** The gateway answered with a non-2xx status and its own `{error}` text. */
    class Http(
        val status: Int,
        val reason: String,
        /** True when the password was right but a TOTP code is still missing. */
        val twoFactorRequired: Boolean = false,
    ) : VanitasException(reason)

    /** 2xx, but not the JSON shape this version of the app understands. */
    class Decoding(
        message: String,
        cause: Throwable? = null,
    ) : VanitasException(message, cause)

    /** Session token was rejected — the caller should force a re-login. */
    val isAuthFailure: Boolean
        get() = this is Http && (status == 401 || status == 403)
}
