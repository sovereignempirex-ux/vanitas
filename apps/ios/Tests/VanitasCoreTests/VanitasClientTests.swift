import XCTest

import Foundation
import VanitasCore

final class VanitasClientTests: XCTestCase {

    private func makeClient(
        token: String? = nil,
        transport: TransportStub,
        baseURL: String = "https://api.vanitas.test"
    ) -> VanitasClient {
        VanitasClient(baseURL: baseURL, tokenProvider: { token }, transport: transport)
    }

    /// The percent-encoded path of a URL.
    ///
    /// `URL.percentEncodedPath` only exists in Darwin's Foundation, so the
    /// same value is read through `URLComponents`, which every platform
    /// Foundation ships.
    private func encodedPath(_ url: URL?) -> String? {
        url.flatMap { URLComponents(url: $0, resolvingAgainstBaseURL: false)?.percentEncodedPath }
    }

    // MARK: - Authentication

    func testLoginPostsCredentialsWithoutAuthHeader() async throws {
        let stub = TransportStub(status: 200, body: jsonString([
            "token": "sess_123",
            "user": userJSON(),
            "permissions": ["apikeys:read"],
        ]))
        let client = makeClient(transport: stub)

        let session = try await client.login(email: "  a@b.c  ", password: "hunter2")

        let request = try XCTUnwrap(stub.last)
        XCTAssertEqual(request.httpMethod, "POST")
        XCTAssertEqual(request.url?.path, "/api/v1/auth/login")
        XCTAssertNil(request.value(forHTTPHeaderField: "Authorization"),
                     "a fresh login must not send a stale token")
        let body = try XCTUnwrap(request.httpBody.map { String(decoding: $0, as: UTF8.self) })
        XCTAssertEqual(session.token, "sess_123")
        XCTAssertEqual(session.user.email, "a@b.c", "email is trimmed before it is sent")
        XCTAssertTrue(body.contains("\"password\":\"hunter2\""))
        XCTAssertFalse(body.contains("\"code\""), "no TOTP field unless one was typed")
    }

    func testLoginCarriesTOTPCodeOnlyWhenTyped() async throws {
        let stub = TransportStub(status: 200, body: jsonString([
            "token": "sess_1",
            "user": userJSON(),
            "permissions": [],
        ]))
        let client = makeClient(transport: stub)

        _ = try await client.login(email: "a@b.c", password: "x", code: " 123456 ")
        let withCode = try XCTUnwrap(stub.last?.httpBody)
        XCTAssertTrue(String(decoding: withCode, as: UTF8.self).contains("\"code\":\"123456\""),
                      "the code is trimmed, then sent")

        _ = try await client.login(email: "a@b.c", password: "x", code: "   ")
        let blank = try XCTUnwrap(stub.last?.httpBody)
        XCTAssertFalse(String(decoding: blank, as: UTF8.self).contains("\"code\""),
                       "whitespace-only input is treated as no code")
    }

    func testTwoFactorRequirementIsATyped401() async throws {
        let stub = TransportStub(status: 401, body: jsonString([
            "error": "error.2fa_required",
            "twoFactorRequired": true,
        ]))
        let client = makeClient(transport: stub)

        do {
            _ = try await client.login(email: "a@b.c", password: "x")
            XCTFail("expected a 401")
        } catch let error as VanitasError {
            guard case let .http(status, reason, required) = error else {
                return XCTFail("wrong error: \(error)")
            }
            XCTAssertEqual(status, 401)
            XCTAssertEqual(reason, "error.2fa_required", "the gateway's own text, verbatim")
            XCTAssertTrue(required, "the view keys the TOTP field off this flag")
            XCTAssertTrue(error.isAuthFailure)
            XCTAssertTrue(error.twoFactorRequired)
        }
    }

    func testGatewayErrorTextReachesCallerVerbatim() async throws {
        let stub = TransportStub(status: 403, body: jsonString(["error": "error.missing_scope"]))
        let client = makeClient(token: "t", transport: stub)

        do {
            _ = try await client.listKeys()
            XCTFail("expected a 403")
        } catch let error as VanitasError {
            XCTAssertEqual(error, .http(status: 403, reason: "error.missing_scope",
                                        twoFactorRequired: false))
        }
    }

    func testNoAuthorizationHeaderBeforeSigningIn() async throws {
        let stub = TransportStub(status: 200, body: jsonString(["user": userJSON(), "permissions": []]))
        let client = makeClient(transport: stub)

        _ = try await client.me()
        XCTAssertNil(stub.last?.value(forHTTPHeaderField: "Authorization"))
    }

    func testBearerTokenAttachedWhenSessionExists() async throws {
        let stub = TransportStub(status: 200, body: jsonString(["user": userJSON(), "permissions": []]))
        let client = makeClient(token: "sess_abc", transport: stub)

        _ = try await client.me()
        XCTAssertEqual(stub.last?.value(forHTTPHeaderField: "Authorization"), "Bearer sess_abc")
        XCTAssertEqual(stub.last?.value(forHTTPHeaderField: "User-Agent"), "VanitasIOS/1.0")
    }

    // MARK: - URL building

    func testTrailingSlashDoesNotDuplicatePath() async throws {
        let stub = TransportStub(status: 200, body: jsonString(["user": userJSON(), "permissions": []]))
        let client = makeClient(transport: stub, baseURL: "https://api.vanitas.test///")

        _ = try await client.me()
        XCTAssertEqual(stub.last?.url?.absoluteString, "https://api.vanitas.test/api/v1/auth/me")
    }

    func testPathSegmentsAreEncoded() {
        XCTAssertEqual(VanitasClient.pathEncode("a/b c"), "a%2Fb%20c")
        XCTAssertEqual(VanitasClient.pathEncode("plain-id_1.2"), "plain-id_1.2")
    }

    func testUnsupportedPeriodFallsBackTo24h() async throws {
        let stub = TransportStub(status: 200, body: jsonString(usageJSON()))
        let client = makeClient(token: "t", transport: stub)

        _ = try await client.usage("1y")
        XCTAssertEqual(stub.last?.url?.query, "period=24h")

        _ = try await client.usage("7d")
        XCTAssertEqual(stub.last?.url?.query, "period=7d")
    }

    // MARK: - Keys

    func testKeyListParsesAndIgnoresUnknownFields() async throws {
        var record = keyJSON()
        record["addedNextYear"] = ["surprise": 1] // the gateway can grow first
        let stub = TransportStub(status: 200, body: jsonString([
            "keys": [record],
            "allScopes": [[
                "scope": "apikeys:read",
                "label": "Read API keys",
                "group": "API keys",
                "adminOnly": false,
            ]],
        ]))
        let client = makeClient(token: "t", transport: stub)

        let response = try await client.listKeys()
        XCTAssertEqual(response.keys.count, 1)
        XCTAssertEqual(response.keys[0].name, "Prod")
        XCTAssertEqual(response.keys[0].scopes, ["apikeys:read", "usage:read"])
        XCTAssertEqual(response.allScopes.first?.scope, "apikeys:read")
    }

    func testCreateKeyReturnsOneTimeSecret() async throws {
        var created = keyJSON()
        created["keyPrefix"] = "vk_live_xy99"
        let stub = TransportStub(status: 201, body: jsonString([
            "key": created,
            "rawSecret": "vk_live_xy99.SECRET-ONCE",
            "revealNote": "note.reveal_once",
        ]))
        let client = makeClient(token: "t", transport: stub)

        let response = try await client.createKey(
            CreateKeyRequest(name: "CI", scopes: ["usage:read"], environment: "test",
                             rateLimitPerMin: 120)
        )

        let request = try XCTUnwrap(stub.last)
        XCTAssertEqual(request.httpMethod, "POST")
        XCTAssertEqual(request.url?.path, "/api/v1/api-keys")
        XCTAssertEqual(response.rawSecret, "vk_live_xy99.SECRET-ONCE")
        XCTAssertEqual(response.revealNote, "note.reveal_once")
        XCTAssertEqual(response.key.name, "Prod")
    }

    func testRevokeSendsDeleteToEncodedPath() async throws {
        let stub = TransportStub(status: 200, body: jsonString([
            "success": true,
            "key": keyJSON(),
        ]))
        let client = makeClient(token: "t", transport: stub)

        let response = try await client.revokeKey(id: "a/b")

        XCTAssertEqual(stub.last?.httpMethod, "DELETE")
        // `path` would hand back the *decoded* segment; what goes on the wire
        // is the percent-encoded form, so that is what we assert.
        XCTAssertEqual(encodedPath(stub.last?.url), "/api/v1/api-keys/a%2Fb")
        XCTAssertTrue(response.success)
    }

    func testRotateReusesTheRotatePath() async throws {
        let stub = TransportStub(status: 200, body: jsonString([
            "key": keyJSON(),
            "rawSecret": "fresh.secret",
            "revealNote": NSNull(),
        ]))
        let client = makeClient(token: "t", transport: stub)

        _ = try await client.rotateKey(id: "k1")

        XCTAssertEqual(stub.last?.httpMethod, "POST")
        XCTAssertEqual(stub.last?.url?.path, "/api/v1/api-keys/k1/rotate")
    }

    // MARK: - Usage

    func testUsageAnalyticsParsesWholeContract() async throws {
        let payload: [String: Any] = [
            "period": "24h",
            "timeSeries": [[
                "timeLabel": "14:00",
                "timestamp": "2026-10-09T14:00:00.000Z",
                "totalRequests": 120,
                "successCount": 118,
                "throttledCount": 1,
                "errorCount": 1,
                "latencyMs": 42,
                "p95LatencyMs": 120,
                "k1": 120, "__t": 1, "__e": 1, // per-key series: ignored on purpose
            ]],
            "summaries": [summaryJSON(
                totalRequests: 120, successRate: 98.3, throttledRequests: 1,
                errorCount: 1, quotaUsedPercent: 42.5,
                topEndpoints: [["endpoint": "/v1/chat", "count": 90, "percentage": 75.0]]
            )],
            "totalVolume": 120,
            "overallSuccessRate": 98.3,
            "overallThrottledCount": 1,
            "overallErrorCount": 1,
            "overallAvgLatencyMs": 42.5,
            "upstream": "python_remote:http://analytics:8200",
        ]
        let client = makeClient(token: "t",
                                transport: TransportStub(status: 200, body: jsonString(payload)))

        let usage = try await client.usage("24h")

        XCTAssertEqual(usage.period, "24h")
        XCTAssertEqual(usage.timeSeries.first?.totalRequests, 120)
        XCTAssertEqual(usage.timeSeries.first?.latencyMs, 42,
                       "a JSON integer must still read as a Double")
        XCTAssertEqual(usage.summaries.first?.quotaUsedPercent, 42.5)
        XCTAssertEqual(usage.summaries.first?.successRate, 98.3)
        XCTAssertEqual(usage.summaries.first?.topEndpoints.first?.endpoint, "/v1/chat")
        XCTAssertEqual(usage.overallSuccessRate, 98.3)
        XCTAssertEqual(usage.upstream, "python_remote:http://analytics:8200")
    }

    // MARK: - Failures

    func testUnreachableGatewayIsNetworkError() async {
        let stub = TransportStub { _ in try TransportStub.unreachable() }
        let client = makeClient(token: "t", transport: stub)

        do {
            _ = try await client.me()
            XCTFail("expected a network failure")
        } catch let error as VanitasError {
            guard case .network = error else {
                return XCTFail("wrong error: \(error)")
            }
            XCTAssertFalse(error.isAuthFailure, "a dead host must not sign the user out")
        } catch {
            XCTFail("wrong error type: \(error)")
        }
    }

    func testUnreadablePayloadIsDecodingError() async {
        let stub = TransportStub(status: 200, body: "{\"not\": \"what I asked for\"}")
        let client = makeClient(token: "t", transport: stub)

        do {
            _ = try await client.listKeys()
            XCTFail("expected a decoding failure")
        } catch let error as VanitasError {
            guard case let .decoding(message) = error else {
                return XCTFail("wrong error: \(error)")
            }
            XCTAssertTrue(message.contains("/api-keys"), "the message names the endpoint")
        } catch {
            XCTFail("wrong error type: \(error)")
        }
    }

    func testNonJsonErrorBodyStillRaisesHttpError() async {
        let stub = TransportStub(status: 502, body: "<html>bad gateway</html>")
        let client = makeClient(token: "t", transport: stub)

        do {
            _ = try await client.me()
            XCTFail("expected an HTTP failure")
        } catch let error as VanitasError {
            XCTAssertEqual(error, .http(status: 502, reason: "HTTP 502 on /auth/me",
                                        twoFactorRequired: false))
        } catch {
            XCTFail("wrong error type: \(error)")
        }
    }

    func testLogoutToleratesFailingGateway() async {
        let stub = TransportStub(status: 500, body: "boom")
        let client = makeClient(token: "t", transport: stub)
        let ok = await client.logout()
        XCTAssertFalse(ok, "sign-out never blocks on a broken gateway")

        let fine = TransportStub(status: 204, body: "")
        let healthy = makeClient(token: "t", transport: fine)
        let ok2 = await healthy.logout()
        XCTAssertTrue(ok2)
    }
}

// MARK: - Fixture builders

func userJSON(
    id: String = "u1",
    email: String = "a@b.c",
    name: String = "Nour",
    username: String = "nour",
    role: String = "owner"
) -> [String: Any] {
    [
        "id": id,
        "email": email,
        "name": name,
        "username": username,
        "avatarUrl": "",
        "role": role,
        "twoFactorEnabled": false,
        "createdAt": "2026-01-01T00:00:00.000Z",
        "lastLoginAt": "2026-10-09T09:30:00.000Z",
    ]
}

func keyJSON(
    id: String = "k1",
    name: String = "Prod",
    keyPrefix: String = "vk_live_ab12",
    maskedSecret: String = "vk_live_ab12••••••••",
    rateLimitPerMin: Int = 600,
    usageCount: Int = 4321,
    environment: String = "live"
) -> [String: Any] {
    [
        "id": id,
        "name": name,
        "keyPrefix": keyPrefix,
        "maskedSecret": maskedSecret,
        "ownerId": "u1",
        "ownerName": "Nour",
        "scopes": ["apikeys:read", "usage:read"],
        "status": "active",
        "rateLimitPerMin": rateLimitPerMin,
        "usageCount": usageCount,
        "createdAt": "2026-09-01T12:00:00.000Z",
        "lastUsedAt": "2026-10-09T08:00:00.000Z",
        "expiresAt": NSNull(),
        "environment": environment,
        "monthlyQuota": 50000,
        "currentUsageThisMonth": 12000,
    ]
}
