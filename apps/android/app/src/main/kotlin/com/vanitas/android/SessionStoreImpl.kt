package com.vanitas.android

import android.content.Context
import com.vanitas.android.core.InMemorySessionStore
import com.vanitas.android.core.SessionStore

/**
 * SharedPreferences-backed [SessionStore].
 *
 * The dedupe history is one newline-separated string rather than a StringSet:
 * SharedPreferences hands back a HashSet, and an unordered set cannot honour
 * "drop the oldest" when the history is capped.
 */
class SessionStoreImpl(context: Context) : SessionStore {

    private val prefs = context.getSharedPreferences(FILE, Context.MODE_PRIVATE)

    override var token: String?
        get() = prefs.getString(KEY_TOKEN, null)
        set(value) {
            prefs.edit().putString(KEY_TOKEN, value).apply()
        }

    override var serverUrl: String
        get() = prefs.getString(KEY_SERVER, InMemorySessionStore.DEFAULT_SERVER_URL)
            ?: InMemorySessionStore.DEFAULT_SERVER_URL
        set(value) {
            prefs.edit().putString(KEY_SERVER, value).apply()
        }

    override var notificationsEnabled: Boolean
        get() = prefs.getBoolean(KEY_NOTIFY, true)
        set(value) {
            prefs.edit().putBoolean(KEY_NOTIFY, value).apply()
        }

    override var quotaThresholdPercent: Int
        get() = prefs.getInt(KEY_THRESHOLD, DEFAULT_THRESHOLD)
        set(value) {
            prefs.edit().putInt(KEY_THRESHOLD, value).apply()
        }

    override fun hasSeen(dedupeKey: String): Boolean = seenList().contains(dedupeKey)

    override fun markSeen(dedupeKey: String) {
        val list = seenList()
        if (list.contains(dedupeKey)) return
        list.add(dedupeKey)
        while (list.size > MAX_SEEN) list.removeAt(0)
        prefs.edit().putString(KEY_SEEN, list.joinToString(SEPARATOR)).apply()
    }

    override fun clearSeen() {
        prefs.edit().remove(KEY_SEEN).apply()
    }

    override fun clearSession() {
        prefs.edit().putString(KEY_TOKEN, null).remove(KEY_SEEN).apply()
    }

    private fun seenList(): MutableList<String> =
        (prefs.getString(KEY_SEEN, "") ?: "")
            .split(SEPARATOR)
            .filter { it.isNotEmpty() }
            .toMutableList()

    private companion object {
        const val FILE = "vanitas_session"
        const val KEY_TOKEN = "token"
        const val KEY_SERVER = "server_url"
        const val KEY_NOTIFY = "notifications_enabled"
        const val KEY_THRESHOLD = "quota_threshold"
        const val KEY_SEEN = "seen_alerts"
        const val SEPARATOR = "\n"
        const val MAX_SEEN = 500
        const val DEFAULT_THRESHOLD = 80
    }
}
