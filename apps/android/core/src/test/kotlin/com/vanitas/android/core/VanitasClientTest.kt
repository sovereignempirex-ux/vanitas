package com.vanitas.android.core

import io.ktor.client.HttpClient
import io.ktor.client.engine.mock.MockEngine
import io.ktor.client.engine.mock.MockRequestHandler
import io.ktor.client.engine.mock.respond
import io.ktor.client.request.HttpRequestData
import io.ktor.http.HttpMethod
import io.ktor.http.HttpStatusCode
import io.ktor.http.content.TextContent
import io.ktor.http.headersOf
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test

/**
 * Offline contract tests: a mock engine answers canned gateway payloads, so the
 * suite needs no server, no device and no credentials.
 *
 * They pin the three things the UI depends on — the exact paths/verbs/headers
 * the gateway expects, the shape of its JSON, and the typed errors it produces.
 */
class VanitasClientTest {

    private var captured: HttpRequestData? = null

    private fun client(
        token: String? = null,
        status: HttpStatusCode = HttpStatusCode.OK,
        body: String,
        baseUrl: String = "https://api.test/",
    ): VanitasClient = VanitasClient(
        baseUrl = baseUrl,
        client = HttpClient(MockEngine) {
            applyVanitasConfig(this)
            engine {
                addHandler { request ->
                    captured = request
                    respond(body, status, headersOf("Content-Type", "application/json"))
                }
            }
        },
        tokenProvider = { token },
        manageClient = false,
    )

    /** Fails the test with the produced error name when nothing is thrown. */
    private inline fun <reified T : VanitasException> expectFailure(block: () -> Unit): T = try {
        block()
        fail("expected ${T::class.simpleName}")
        throw AssertionError("unreachable")
    } catch (expected: VanitasException) {
        assertTrue(
            "expected ${T::class.simpleName} but got ${expected::class.simpleName}",
            expected is T,
        )
        expected as T
    }

    private fun requestBody(): String =
        (captured!!.body as TextContent).text

    // ------------------------------------------------------------------ login

    @Test
    fun `login posts credentials to the gateway without an auth header`() = runBlocking {
        val client = client(
            body = """
                {"token":"sess-1","user":{"id":"u1","email":"a@b.c","name":"A","role":"ADMIN"},
                 "permissions":["api.read","api.write"]}
            """.trimIndent(),
        )

        val result = client.login("  a@b.c ", "secret")

        assertEquals("sess-1", result.token)
        assertEquals("ADMIN", result.user.role)
        assertEquals(listOf("api.read", "api.write"), result.permissions)
        assertEquals(HttpMethod.Post, captured!!.method)
        assertTrue(captured!!.url.encodedPath.endsWith("/api/v1/auth/login"))
        assertEquals(null, captured!!.headers["Authorization"])
        assertTrue(requestBody().contains("\"email\":\"a@b.c\""))
        assertTrue(requestBody().contains("\"password\":\"secret\""))
        assertFalse(requestBody().contains("\"code\""))
    }

    @Test
    fun `login carries the totp code only when one was typed`() = runBlocking {
        val client = client(body = """{"token":"t","user":{"id":"u","email":"e","name":"n"}}""")

        client.login("e@x.io", "pw", code = "123456")

        assertTrue(requestBody().contains("\"code\":\"123456\""))
    }

    @Test
    fun `two factor requirement is reported as a typed 401`() {
        val client = client(
            status = HttpStatusCode.Unauthorized,
            body = """{"twoFactorRequired":true,"error":"Two factor code required"}""",
        )

        val error = expectFailure<VanitasException.Http> {
            runBlocking { client.login("e@x.io", "pw") }
        }

        assertEquals(401, error.status)
        assertTrue(error.twoFactorRequired)
        assertEquals("Two factor code required", error.message)
        assertTrue(error.isAuthFailure)
    }

    @Test
    fun `gateway error text reaches the caller verbatim`() {
        val client = client(
            status = HttpStatusCode.Unauthorized,
            body = """{"error":"Invalid credentials"}""",
        )

        val error = expectFailure<VanitasException.Http> {
            runBlocking { client.login("e@x.io", "nope") }
        }

        assertEquals("Invalid credentials", error.message)
        assertFalse(error.twoFactorRequired)
    }

    // ------------------------------------------------------------- auth header

    @Test
    fun `bearer token is attached when a session exists`() = runBlocking {
        client(token = "sess-9", body = """{"keys":[],"allScopes":[]}""").listKeys()

        assertEquals("Bearer sess-9", captured!!.headers["Authorization"])
        assertEquals(HttpMethod.Get, captured!!.method)
        assertTrue(captured!!.url.encodedPath.endsWith("/api/v1/api-keys"))
    }

    @Test
    fun `no authorization header is sent before signing in`() = runBlocking {
        client(body = """{"keys":[],"allScopes":[]}""").listKeys()

        assertEquals(null, captured!!.headers["Authorization"])
        assertTrue(captured!!.headers["User-Agent"]!!.startsWith("VanitasAndroid/"))
    }

    @Test
    fun `trailing slash in the base url does not double up the path`() = runBlocking {
        client(baseUrl = "https://api.test", body = """{"keys":[],"allScopes":[]}""").listKeys()

        assertEquals("https://api.test/api/v1/api-keys", captured!!.url.toString())
    }

    // ------------------------------------------------------------------ keys

    @Test
    fun `key list parses keys, scopes and ignores fields the app does not know`() = runBlocking {
        val client = client(
            body = """
                {"keys":[{"id":"k1","name":"Prod","keyPrefix":"vk_live_","maskedSecret":"vk_live_…",
                          "scopes":["api.read"],"status":"active","rateLimitPerMin":600,"usageCount":42,
                          "environment":"live","createdAt":"2026-01-01T00:00:00.000Z","lastUsedAt":null,
                          "someFutureField":{"nested":true}}],
                 "allScopes":[{"scope":"api.read","label":"Read API","group":"API","adminOnly":false}]}
            """.trimIndent(),
        )

        val keys = client.listKeys()

        assertEquals(1, keys.keys.size)
        val key = keys.keys.first()
        assertEquals("Prod", key.name)
        assertEquals(42, key.usageCount)
        assertEquals(null, key.lastUsedAt)
        assertEquals(listOf("api.read"), key.scopes)
        assertEquals("Read API", keys.allScopes.first().label)
        assertFalse(keys.allScopes.first().adminOnly)
    }

    @Test
    fun `create key returns the one-time secret`() = runBlocking {
        val client = client(
            status = HttpStatusCode.Created,
            body = """
                {"key":{"id":"k2","name":"CI","keyPrefix":"vk_test_","scopes":["api.read"],
                        "environment":"test","rateLimitPerMin":120},
                 "rawSecret":"vk_test_SUPERSECRET","revealNote":"This secret is revealed only once."}
            """.trimIndent(),
        )

        val created = client.createKey(CreateKeyRequest(name = "CI", scopes = listOf("api.read"), environment = "test"))

        assertEquals("vk_test_SUPERSECRET", created.rawSecret)
        assertEquals("CI", created.key.name)
        assertEquals(HttpMethod.Post, captured!!.method)
        assertTrue(captured!!.url.encodedPath.endsWith("/api/v1/api-keys"))
        assertTrue(requestBody().contains("\"scopes\":[\"api.read\"]"))
    }

    @Test
    fun `revoke sends DELETE to the key's own path`() = runBlocking {
        val client = client(body = """{"success":true}""")

        val result = client.revokeKey("k 1/x")

        assertTrue(result.success)
        assertEquals(HttpMethod.Delete, captured!!.method)
        // The id is percent-encoded: spaces and slashes never become structure.
        assertTrue(captured!!.url.encodedPath.endsWith("/api/v1/api-keys/k%201%2Fx"))
    }

    // ----------------------------------------------------------------- usage

    @Test
    fun `usage analytics parses the whole summary contract`() = runBlocking {
        val client = client(
            body = """
                {"period":"7d",
                 "timeSeries":[{"timeLabel":"10:00","timestamp":"2026-01-01T10:00:00.000Z",
                    "totalRequests":12,"successCount":11,"throttledCount":0,"errorCount":1,
                    "latencyMs":18.5,"p95LatencyMs":40.0,"k1":12,"k1__t":0,"k1__e":1}],
                 "summaries":[{"keyId":"k1","keyName":"Prod","keyPrefix":"vk_live_","environment":"live",
                    "rateLimitPerMin":600,"totalRequests":120,"successRate":97.5,
                    "throttledRequests":2,"errorCount":1,"quotaUsedPercent":82,"peakRpm":9,
                    "avgLatencyMs":21,"topEndpoints":[{"endpoint":"/api/v1/ai/chat","count":60,"percentage":50}]}],
                 "totalVolume":120,"overallSuccessRate":97.5,"overallThrottledCount":2,
                 "overallErrorCount":1,"overallAvgLatencyMs":21,
                 "upstream":"typescript_native"}
            """.trimIndent(),
        )

        val usage = client.usage("7d")

        assertEquals("7d", usage.period)
        assertEquals(120, usage.totalVolume)
        assertEquals(97.5, usage.overallSuccessRate, 0.0001)
        assertEquals(1, usage.overallErrorCount)
        assertEquals("typescript_native", usage.upstream)
        // The per-key series (k1, k1__t, k1__e) is dropped, not fatal.
        assertEquals(1, usage.timeSeries.size)
        assertEquals(12, usage.timeSeries.first().totalRequests)

        val summary = usage.summaries.first()
        assertEquals(82.0, summary.quotaUsedPercent, 0.0001)
        assertEquals(97.5, summary.successRate, 0.0001)
        assertEquals("/api/v1/ai/chat", summary.topEndpoints.first().endpoint)
        assertNotNull(summary.keyId)
    }

    @Test
    fun `unsupported period falls back to 24h exactly like the gateway`() = runBlocking {
        val client = client(body = """{"period":"24h"}""")

        client.usage("2y")

        assertTrue(captured!!.url.encodedQuery.contains("period=24h"))
    }

    // ----------------------------------------------------------------- errors

    @Test
    fun `an unreachable gateway is a network error, not a crash`() {
        val client = VanitasClient(
            baseUrl = "https://api.test",
            client = HttpClient(MockEngine) {
                applyVanitasConfig(this)
                engine { addHandler { throw java.io.IOException("connection refused") } }
            },
            manageClient = false,
        )

        expectFailure<VanitasException.Network> { runBlocking { client.listKeys() } }
    }

    @Test
    fun `an unreadable payload is a decoding error`() {
        // Every field on KeysResponse has a default, so the payload has to be
        // mistyped — not merely unfamiliar — to be unreadable.
        val client = client(body = """{"keys":"not-an-array","allScopes":[]}""")

        val error = expectFailure<VanitasException.Decoding> {
            runBlocking { client.listKeys() }
        }
        assertTrue(error.message!!.contains("/api-keys"))
    }

    @Test
    fun `a non-json error body still raises a typed http error`() {
        val client = client(status = HttpStatusCode.ServiceUnavailable, body = "upstream down")

        val error = expectFailure<VanitasException.Http> {
            runBlocking { client.listKeys() }
        }

        assertEquals(503, error.status)
        assertFalse(error.isAuthFailure)
    }

    @Test
    fun `logout tolerates a failing gateway`() = runBlocking {
        val ok = client(body = """{"success":true}""").logout()
        assertTrue(ok)

        val broken = VanitasClient(
            baseUrl = "https://api.test",
            client = HttpClient(MockEngine) {
                applyVanitasConfig(this)
                engine { addHandler { throw java.io.IOException("gone") } }
            },
            manageClient = false,
        )
        assertFalse(broken.logout())
    }

    @Test
    fun `path segments are encoded before they are concatenated`() {
        assertEquals("a%2Fb%20c", VanitasClient.pathEncode("a/b c"))
    }
}
