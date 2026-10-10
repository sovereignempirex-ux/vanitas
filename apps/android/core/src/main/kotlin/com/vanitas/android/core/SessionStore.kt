package com.vanitas.android.core

/**
 * Where the app keeps its session and preferences.
 *
 * Declared as an interface in :core so the client, the notifier and their tests
 * never touch Android APIs; `:app` supplies the SharedPreferences-backed
 * implementation and tests use [InMemorySessionStore].
 */
interface SessionStore {
    /** Session token from `POST /auth/login`; null = signed out. */
    var token: String?

    /** Gateway origin, without a trailing slash (default points at the host machine from an emulator). */
    var serverUrl: String

    var notificationsEnabled: Boolean

    /** Warn once a key's monthly quota reaches this percentage. */
    var quotaThresholdPercent: Int

    /** True when this exact alert was already raised (see [UsageAlert.dedupeKey]). */
    fun hasSeen(dedupeKey: String): Boolean

    fun markSeen(dedupeKey: String)

    fun clearSeen()

    /** Drops the token AND the alert history — used by sign-out. */
    fun clearSession()
}

class InMemorySessionStore(
    override var serverUrl: String = DEFAULT_SERVER_URL,
) : SessionStore {

    override var token: String? = null
    override var notificationsEnabled: Boolean = true
    override var quotaThresholdPercent: Int = 80

    private val seen = LinkedHashSet<String>()

    override fun hasSeen(dedupeKey: String): Boolean = seen.contains(dedupeKey)

    override fun markSeen(dedupeKey: String) {
        seen.add(dedupeKey)
        // Bounded so a long-lived process cannot grow this set forever.
        while (seen.size > MAX_SEEN) {
            val oldest = seen.iterator()
            oldest.next()
            oldest.remove()
        }
    }

    override fun clearSeen() = seen.clear()

    override fun clearSession() {
        token = null
        seen.clear()
    }

    companion object {
        /**
         * `10.0.2.2` is how the Android emulator reaches the host machine, so
         * the app talks to `npm run dev` on the developer's laptop out of the box.
         * A real device and any deployment override it in Settings.
         */
        const val DEFAULT_SERVER_URL = "http://10.0.2.2:3000"
        private const val MAX_SEEN = 500
    }
}
