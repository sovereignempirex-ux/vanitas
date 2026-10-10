package com.vanitas.android

import android.app.Application
import android.content.Context
import com.vanitas.android.core.SessionStore
import com.vanitas.android.core.VanitasClient

/**
 * Application scope: one [AppContainer] for the whole process, so the session,
 * the preferences and the HTTP client are shared instead of rebuilt per screen.
 */
class VanitasApp : Application() {

    lateinit var container: AppContainer
        private set

    override fun onCreate() {
        super.onCreate()
        container = AppContainer(this)
        Notifier.createChannel(this)
    }
}

/**
 * The object graph the activities reach through
 * `(application as VanitasApp).container`.
 */
class AppContainer(private val context: Context) {

    val session: SessionStore = SessionStoreImpl(context)

    private var cachedClient: VanitasClient? = null
    private var cachedForBaseUrl: String? = null

    /**
     * One client per server URL: editing the URL in Settings must not leave the
     * app talking to the old host with a stale connection pool.
     */
    @Synchronized
    fun client(): VanitasClient {
        val baseUrl = session.serverUrl
        val existing = cachedClient
        if (existing == null || cachedForBaseUrl != baseUrl) {
            existing?.close()
            cachedClient = VanitasClient(baseUrl, tokenProvider = { session.token })
            cachedForBaseUrl = baseUrl
        }
        return requireNotNull(cachedClient)
    }

    /** Local sign-out: token, alert history and the scheduled worker all go. */
    @Synchronized
    fun signOut() {
        session.clearSession()
        cachedClient?.close()
        cachedClient = null
        cachedForBaseUrl = null
        UsageCheckWorker.cancel(context)
    }
}
