import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif
import XCTest
import VanitasCore

/// A scripted `HTTPTransport`: every call answers from a closure and the
/// request it saw is kept for assertions. Nothing here touches a socket, so
/// the whole suite is deterministic and runs offline on any machine with
/// `swift test` — no gateway, no simulator, no credentials.
final class TransportStub: HTTPTransport {
    typealias Script = (URLRequest) throws -> (Data, URLResponse)

    private var script: Script
    private(set) var requests: [URLRequest] = []

    init(script: @escaping Script) {
        self.script = script
    }

    /// Always answers the same payload, regardless of the request.
    convenience init(status: Int = 200, body: String) {
        self.init { _ in TransportStub.reply(status: status, body: body) }
    }

    func data(for request: URLRequest) async throws -> (Data, URLResponse) {
        requests.append(request)
        return try script(request)
    }

    static func reply(status: Int, body: String) -> (Data, URLResponse) {
        let url = URL(string: "https://stub.test")!
        let response = HTTPURLResponse(
            url: url,
            statusCode: status,
            httpVersion: "HTTP/1.1",
            headerFields: ["Content-Type": "application/json"]
        )!
        return (Data(body.utf8), response)
    }

    /// Simulates a host that cannot be reached at all.
    static func unreachable() throws -> (Data, URLResponse) {
        throw URLError(.cannotConnectToHost)
    }

    var last: URLRequest? { requests.last }
}

func jsonString(_ body: Any) -> String {
    // `JSONSerialization` keeps this honest: no hand-rolled quoting bugs.
    let data = try! JSONSerialization.data(withJSONObject: body)
    return String(decoding: data, as: UTF8.self)
}

// MARK: - Fixtures

/// One summary in exactly the shape `src/server/db.ts` emits (all fields the
/// gateway guarantees present; nothing else).
func summaryJSON(
    keyId: String = "k1",
    keyName: String = "Prod",
    keyPrefix: String = "vk_live_ab12",
    environment: String = "live",
    rateLimitPerMin: Int = 600,
    totalRequests: Int = 100,
    successRate: Double = 100.0,
    throttledRequests: Int = 0,
    errorCount: Int = 0,
    quotaUsedPercent: Double = 0.0,
    peakRpm: Int = 12,
    avgLatencyMs: Double = 21.5,
    topEndpoints: [[String: Any]] = []
) -> [String: Any] {
    [
        "keyId": keyId,
        "keyName": keyName,
        "keyPrefix": keyPrefix,
        "environment": environment,
        "rateLimitPerMin": rateLimitPerMin,
        "totalRequests": totalRequests,
        "successRate": successRate,
        "throttledRequests": throttledRequests,
        "errorCount": errorCount,
        "quotaUsedPercent": quotaUsedPercent,
        "peakRpm": peakRpm,
        "avgLatencyMs": avgLatencyMs,
        "topEndpoints": topEndpoints,
    ]
}

func usageJSON(
    period: String = "24h",
    summaries: [[String: Any]] = []
) -> [String: Any] {
    [
        "period": period,
        "timeSeries": [] as [[String: Any]],
        "summaries": summaries,
        "totalVolume": 4200,
        "overallSuccessRate": 99.1,
        "overallThrottledCount": 3,
        "overallErrorCount": 12,
        "overallAvgLatencyMs": 0,
    ]
}

func decode<T: Decodable>(_ type: T.Type, from object: [String: Any]) throws -> T {
    try JSONDecoder().decode(T.self, from: Data(jsonString(object).utf8))
}
