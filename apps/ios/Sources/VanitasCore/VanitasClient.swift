import Foundation
#if canImport(FoundationNetworking)
/// On Linux and Windows the networking types are a separate module; on
/// Darwin they are part of Foundation, so the import compiles to nothing.
import FoundationNetworking
#endif

/// The seam the tests replace: `URLSession` already has exactly this method,
/// so production code needs no adapter at all, and tests can drive the client
/// from a stub — no `URLProtocol`, no sockets, no timing.
public protocol HTTPTransport {
    func data(for request: URLRequest) async throws -> (Data, URLResponse)
}

#if canImport(FoundationNetworking)
extension URLSession: HTTPTransport {
    /// Darwin's `URLSession` already declares this exact method, so the empty
    /// conformance below is enough there. corelibs-foundation (Linux and
    /// Windows) only ships `data(for:delegate:)`, whose extra parameter stops
    /// it from witnessing the protocol — so spell the forwarding method out.
    public func data(for request: URLRequest) async throws -> (Data, URLResponse) {
        let (data, response) = try await self.data(for: request, delegate: nil)
        return (data, response)
    }
}
#else
extension URLSession: HTTPTransport {}
#endif

/// Typed client for the Vanitas gateway (`<baseURL>/api/v1/…`).
///
/// Auth is the same session token the web app uses, sent as
/// `Authorization: Bearer <token>`; the token itself is injected by
/// [tokenProvider] so the client never owns the session.
///
/// Every failure is a `VanitasError` — `.network` when the server cannot be
/// reached, `.http` for a non-2xx (carrying the gateway's message and the 2FA
/// flag), `.decoding` for a payload this version cannot read. Task
/// cancellation propagates as `CancellationError`, which is what SwiftUI's
/// `.task {}` expects when a view disappears.
///
/// `async/await` all the way: every call is `async throws`, so SwiftUI can run
/// it without blocking the main actor.
public struct VanitasClient {
    public let baseURL: String

    private let transport: HTTPTransport
    private let tokenProvider: () -> String?
    private let apiPrefix: String

    public static let userAgent = "VanitasIOS/1.0"

    public init(
        baseURL: String,
        tokenProvider: @escaping () -> String? = { nil },
        transport: HTTPTransport = VanitasClient.makeSession(),
        apiPrefix: String = "/api/v1"
    ) {
        // Trim, don't tolerate: a trailing slash would double the separator.
        self.baseURL = baseURL.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        self.tokenProvider = tokenProvider
        self.transport = transport
        self.apiPrefix = apiPrefix
    }

    /// The production transport: a private, non-caching session with tight
    /// timeouts so a dead host fails in seconds instead of hanging a screen.
    ///
    /// `waitsForConnectivity` is deliberately not set: it is a Darwin-only
    /// knob on `URLSessionConfiguration`, and the request timeout already
    /// bounds how long a dead host can stall a screen — on every platform.
    public static func makeSession() -> URLSession {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.timeoutIntervalForRequest = 15
        configuration.timeoutIntervalForResource = 30
        return URLSession(configuration: configuration)
    }

    // MARK: - Reads

    public func login(
        email: String,
        password: String,
        code: String? = nil
    ) async throws -> LoginResponse {
        let trimmedCode = code?.trimmingCharacters(in: .whitespaces)
        return try await call(
            "/auth/login",
            method: "POST",
            body: LoginRequest(
                email: email.trimmingCharacters(in: .whitespaces),
                password: password,
                code: (trimmedCode?.isEmpty ?? true) ? nil : trimmedCode
            )
        )
    }

    public func me() async throws -> MeResponse {
        try await call("/auth/me")
    }

    public func listKeys() async throws -> KeysResponse {
        try await call("/api-keys")
    }

    public func usage(_ period: String = "24h") async throws -> UsageAnalytics {
        try await call(
            "/api-keys/usage-analytics",
            query: ["period": normalizePeriod(period)]
        )
    }

    // MARK: - Writes

    public func createKey(_ request: CreateKeyRequest) async throws -> CreatedKeyResponse {
        try await call("/api-keys", method: "POST", body: request)
    }

    public func rotateKey(id: String) async throws -> CreatedKeyResponse {
        try await call("/api-keys/\(Self.pathEncode(id))/rotate", method: "POST")
    }

    public func revokeKey(id: String) async throws -> DeleteKeyResponse {
        try await call("/api-keys/\(Self.pathEncode(id))", method: "DELETE")
    }

    /// Best-effort sign-out: a failure here must not block the local logout.
    public func logout() async -> Bool {
        do {
            _ = try await execute(path: "/auth/logout", method: "POST", bodyData: nil, query: [:])
            return true
        } catch {
            return false
        }
    }

    // MARK: - Plumbing

    /// GET-style call: no body, so there is no generic left to infer.
    private func call<T: Decodable>(
        _ path: String,
        method: String = "GET",
        query: [String: String] = [:]
    ) async throws -> T {
        let data = try await execute(path: path, method: method, bodyData: nil, query: query)
        return try Self.decode(T.self, from: data, path: path)
    }

    /// Call with a JSON body.
    private func call<T: Decodable, B: Encodable>(
        _ path: String,
        method: String,
        body: B,
        query: [String: String] = [:]
    ) async throws -> T {
        let payload = try JSONEncoder().encode(body)
        let data = try await execute(path: path, method: method, bodyData: payload, query: query)
        return try Self.decode(T.self, from: data, path: path)
    }

    private func execute(
        path: String,
        method: String,
        bodyData: Data?,
        query: [String: String]
    ) async throws -> Data {
        let url = try endpoint(path: path, query: query)

        var request = URLRequest(url: url)
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue(Self.userAgent, forHTTPHeaderField: "User-Agent")
        if let token = tokenProvider(), !token.isEmpty {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        if let bodyData {
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = bodyData
        }

        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await transport.data(for: request)
        } catch is CancellationError {
            throw CancellationError()
        } catch let error as VanitasError {
            throw error
        } catch {
            // URLError.timedOut / .cannotConnectToHost / DNS failures …
            throw VanitasError.network(String(describing: error))
        }

        guard let http = response as? HTTPURLResponse else {
            throw VanitasError.network("No HTTP response from \(baseURL)")
        }

        if (200 ..< 300).contains(http.statusCode) {
            return data
        }

        let payload = try? JSONDecoder().decode(ErrorBody.self, from: data)
        throw VanitasError.http(
            status: http.statusCode,
            reason: payload?.error ?? "HTTP \(http.statusCode) on \(path)",
            twoFactorRequired: payload?.twoFactorRequired ?? false
        )
    }

    private func endpoint(path: String, query: [String: String]) throws -> URL {
        guard var components = URLComponents(string: baseURL + apiPrefix + path) else {
            throw VanitasError.decoding("Bad URL for \(path)")
        }
        if !query.isEmpty {
            components.queryItems = query
                .sorted { $0.key < $1.key }
                .map { URLQueryItem(name: $0.key, value: $0.value) }
        }
        guard let url = components.url else {
            throw VanitasError.decoding("Bad URL for \(path)")
        }
        return url
    }

    private static func decode<T: Decodable>(_ type: T.Type, from data: Data, path: String) throws -> T {
        do {
            return try JSONDecoder().decode(T.self, from: data)
        } catch {
            throw VanitasError.decoding("Unreadable response from \(path)")
        }
    }

    /// Opaque ids go into a path segment, never raw.
    public static func pathEncode(_ value: String) -> String {
        var allowed = CharacterSet.urlPathAllowed
        allowed.remove(charactersIn: "/?#")
        return value.addingPercentEncoding(withAllowedCharacters: allowed) ?? value
    }
}
