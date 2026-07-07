import XCTest
@testable import ChemVaultFiles

final class APIClientTests: XCTestCase {
    override func setUp() {
        super.setUp()
        MockURLProtocol.requests = []
        MockURLProtocol.handler = nil
    }

    func testMeDecodesAppEnvelopeAndSendsBearerToken() async throws {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [MockURLProtocol.self]
        let session = URLSession(configuration: configuration)
        let client = APIClient(baseURL: URL(string: "https://file.chemvault.science")!, session: session)
        await client.setAccessTokenProvider { "access-token" }
        MockURLProtocol.handler = { request in
            XCTAssertEqual(request.value(forHTTPHeaderField: "authorization"), "Bearer access-token")
            let body = """
            {
              "ok": true,
              "data": {
                "user": {
                  "id": "user_1",
                  "email": "owner@chemvault.science",
                  "name": null,
                  "role": "admin",
                  "systemRole": "owner",
                  "permissions": ["file:read"],
                  "services": ["chemvault_file"],
                  "serviceAllowed": true,
                  "serviceReason": null
                }
              }
            }
            """
            return (HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: ["content-type": "application/json"])!, Data(body.utf8))
        }

        let user = try await client.me()

        XCTAssertEqual(user.email, "owner@chemvault.science")
        XCTAssertEqual(MockURLProtocol.requests.first?.url?.path, "/api/app/auth/me")
    }
}

private final class MockURLProtocol: URLProtocol {
    static var requests: [URLRequest] = []
    static var handler: ((URLRequest) throws -> (HTTPURLResponse, Data))?

    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override func startLoading() {
        do {
            Self.requests.append(request)
            let (response, data) = try Self.handler?(request) ?? (HTTPURLResponse(url: request.url!, statusCode: 404, httpVersion: nil, headerFields: nil)!, Data())
            client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
            client?.urlProtocol(self, didLoad: data)
            client?.urlProtocolDidFinishLoading(self)
        } catch {
            client?.urlProtocol(self, didFailWithError: error)
        }
    }

    override func stopLoading() {}
}
