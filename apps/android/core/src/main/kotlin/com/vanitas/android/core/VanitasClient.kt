package com.vanitas.android.core

import io.ktor.client.HttpClient
import io.ktor.client.HttpClientConfig
import io.ktor.client.engine.HttpClientEngine
import io.ktor.client.engine.okhttp.OkHttp
import io.ktor.client.plugins.HttpTimeout
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation
import io.ktor.client.request.HttpRequestBuilder
import io.ktor.client.request.header
import io.ktor.client.request.parameter
import io.ktor.client.request.request
import io.ktor.client.request.setBody
import io.ktor.client.request.url
import io.ktor.client.statement.HttpResponse
import io.ktor.client.statement.bodyAsText
import io.ktor.http.ContentType
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpMethod
import io.ktor.http.contentType
import io.ktor.serialization.kotlinx.json.json
import kotlinx.coroutines.CancellationException
import kotlinx.serialization.json.Json
import java.net.URLEncoder

/**
 * Shared JSON policy for every call: unknown fields are dropped (the gateway
 * gains fields before the app gains releases) and nulls are coerced into the
 * defaults declared on the models.
 */
val vanitasJson: Json = Json {
    ignoreUnknownKeys = true
    isLenient = true
    coerceInputValues = true
    explicitNulls = false
}

/** Applied to the production client AND to the mock client used in tests. */
fun applyVanitasConfig(config: HttpClientConfig<*>) {
    // The gateway's own {error} bodies are parsed by hand so every failure
    // surfaces as a VanitasException instead of a generic ClientRequestException.
    config.expectSuccess = false
    config.install(ContentNegotiation) { json(vanitasJson) }
    config.install(HttpTimeout) {
        requestTimeoutMillis = 15_000
        connectTimeoutMillis = 5_000
        socketTimeoutMillis = 15_000
    }
}

fun defaultHttpClient(): HttpClient = HttpClient(OkHttp) { applyVanitasConfig(this) }

/** The periods the gateway accepts — anything else falls back to 24h. */
val USAGE_PERIODS = setOf("24h", "7d", "30d")

fun normalizePeriod(period: String): String = if (period in USAGE_PERIODS) period else "24h"

/**
 * Typed client for the Vanitas gateway (`<baseUrl>/api/v1/...`).
 *
 * Auth is the same session token the web app uses, sent as
 * `Authorization: Bearer <token>`; the token itself is injected by
 * [tokenProvider] so the client never owns the session.
 *
 * Every failure is a [VanitasException] — [VanitasException.Network] when the
 * server cannot be reached, [VanitasException.Http] for a non-2xx (with the
 * gateway's message and the 2FA flag), [VanitasException.Decoding] for a
 * payload this version cannot read.
 */
class VanitasClient(
    baseUrl: String,
    private val client: HttpClient = defaultHttpClient(),
    private val tokenProvider: () -> String? = { null },
    /** Close [client] in [close] — false when the caller lent us its client. */
    private val manageClient: Boolean = true,
    private val apiPrefix: String = "/api/v1",
) : AutoCloseable {

    val baseUrl: String = baseUrl.trim().trimEnd('/')

    // ------------------------------------------------------------------ reads

    suspend fun login(email: String, password: String, code: String? = null): LoginResponse =
        call(
            "/auth/login",
            HttpMethod.Post,
            LoginRequest(email = email.trim(), password = password, code = code?.trim()?.ifEmpty { null }),
        )

    suspend fun me(): MeResponse = call("/auth/me")

    suspend fun listKeys(): KeysResponse = call("/api-keys")

    suspend fun usage(period: String = "24h"): UsageAnalytics =
        call("/api-keys/usage-analytics", query = mapOf("period" to normalizePeriod(period)))

    // ----------------------------------------------------------------- writes

    suspend fun createKey(request: CreateKeyRequest): CreatedKeyResponse =
        call("/api-keys", HttpMethod.Post, request)

    suspend fun rotateKey(id: String): CreatedKeyResponse =
        call("/api-keys/${pathEncode(id)}/rotate", HttpMethod.Post)

    suspend fun revokeKey(id: String): DeleteKeyResponse =
        call("/api-keys/${pathEncode(id)}", HttpMethod.Delete)

    /** Best-effort sign-out: a failure here must not block the local logout. */
    suspend fun logout(): Boolean = try {
        execute("/auth/logout", HttpMethod.Post, null, emptyMap())
        true
    } catch (cancelled: CancellationException) {
        throw cancelled
    } catch (_: Exception) {
        false
    }

    override fun close() {
        if (manageClient) client.close()
    }

    // ---------------------------------------------------------------- plumbing

    private fun endpoint(path: String): String = baseUrl + apiPrefix + path

    private suspend inline fun <reified T> call(
        path: String,
        method: HttpMethod = HttpMethod.Get,
        body: Any? = null,
        query: Map<String, String> = emptyMap(),
    ): T {
        val text = execute(path, method, body, query)
        return try {
            vanitasJson.decodeFromString<T>(text)
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (error: Exception) {
            throw VanitasException.Decoding("Unreadable response from $path", error)
        }
    }

    private suspend fun execute(
        path: String,
        method: HttpMethod,
        body: Any?,
        query: Map<String, String>,
    ): String {
        val response: HttpResponse = try {
            client.request {
                url(endpoint(path))
                buildRequest(method, body, query)
            }
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (error: Throwable) {
            throw VanitasException.Network("Cannot reach $baseUrl", error)
        }

        val text = try {
            response.bodyAsText()
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (error: Throwable) {
            throw VanitasException.Network("No answer from $baseUrl", error)
        }

        if (response.status.value in 200..299) return text

        val payload = try {
            vanitasJson.decodeFromString<ErrorBody>(text)
        } catch (_: Exception) {
            null
        }
        throw VanitasException.Http(
            status = response.status.value,
            reason = payload?.error ?: "HTTP ${response.status.value} on $path",
            twoFactorRequired = payload?.twoFactorRequired == true,
        )
    }

    private fun HttpRequestBuilder.buildRequest(
        method: HttpMethod,
        body: Any?,
        query: Map<String, String>,
    ) {
        this.method = method
        header(HttpHeaders.Accept, ContentType.Application.Json.toString())
        header(HttpHeaders.UserAgent, USER_AGENT)
        tokenProvider()?.takeIf { it.isNotBlank() }?.let { token ->
            header(HttpHeaders.Authorization, "Bearer $token")
        }
        query.forEach { (name, value) -> parameter(name, value) }
        if (body != null) {
            contentType(ContentType.Application.Json)
            setBody(body)
        }
    }

    companion object {
        const val USER_AGENT = "VanitasAndroid/1.0"

        /** Opaque ids go into a path segment, never raw. */
        fun pathEncode(value: String): String = URLEncoder.encode(value, "UTF-8").replace("+", "%20")
    }
}
