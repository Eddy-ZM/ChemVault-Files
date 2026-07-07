import Foundation

actor APIClient {
    static let shared = APIClient()

    private let session: URLSession
    private var accessTokenProvider: (() async -> String?)?
    let baseURL: URL

    init(
        baseURL: URL = URL(string: ProcessInfo.processInfo.environment["API_BASE_URL"] ?? "https://file.chemvault.science")!,
        session: URLSession = .shared
    ) {
        self.baseURL = baseURL
        self.session = session
    }

    func setAccessTokenProvider(_ provider: @escaping () async -> String?) {
        accessTokenProvider = provider
    }

    func loginURL(redirectURI: String = "chemvaultfiles://auth") -> URL {
        var components = URLComponents(url: baseURL.appending(path: "/api/app/auth/login"), resolvingAgainstBaseURL: false)!
        components.queryItems = [URLQueryItem(name: "redirect_uri", value: redirectURI)]
        return components.url!
    }

    func refresh(refreshToken: String) async throws -> AuthTokens {
        try await appRequest("/api/app/auth/refresh", method: "POST", body: ["refreshToken": refreshToken])
    }

    func me() async throws -> CVUser {
        struct Response: Codable { let user: CVUser }
        let response: Response = try await appRequest("/api/app/auth/me", method: "GET")
        return response.user
    }

    func listFiles(parentId: String? = nil, view: DriveSection = .files) async throws -> ListFilesResponse {
        if view == .trash {
            return try await request("/api/trash")
        }
        var query: [URLQueryItem] = []
        if let parentId { query.append(URLQueryItem(name: "parentId", value: parentId)) }
        if view != .files { query.append(URLQueryItem(name: "view", value: view.rawValue)) }
        return try await request("/api/files", queryItems: query)
    }

    func search(query: String, type: String? = nil) async throws -> [CVFileItem] {
        struct Response: Codable { let files: [CVFileItem] }
        var items = [URLQueryItem(name: "q", value: query)]
        if let type { items.append(URLQueryItem(name: "type", value: type)) }
        let response: Response = try await request("/api/search", queryItems: items)
        return response.files
    }

    func createFolder(projectId: String, parentId: String?, name: String) async throws -> CVFolder {
        struct Response: Codable { let folder: CVFolder }
        let response: Response = try await request("/api/files/folder", method: "POST", body: ["projectId": projectId, "parentId": parentId, "name": name])
        return response.folder
    }

    func rename(fileId: String, name: String) async throws {
        let _: EmptyResponse = try await request("/api/files/\(fileId)", method: "PATCH", body: ["displayName": name])
    }

    func move(fileId: String, folderId: String?) async throws {
        let _: EmptyResponse = try await request("/api/files/\(fileId)/move", method: "POST", body: ["folderId": folderId])
    }

    func copy(fileId: String, name: String?, folderId: String?) async throws -> CVFileItem {
        struct Response: Codable { let file: CVFileItem }
        let response: Response = try await request("/api/files/\(fileId)/copy", method: "POST", body: ["name": name, "folderId": folderId])
        return response.file
    }

    func delete(fileId: String) async throws {
        let _: EmptyResponse = try await request("/api/files/\(fileId)", method: "DELETE")
    }

    func restore(fileId: String) async throws {
        let _: EmptyResponse = try await request("/api/trash/\(fileId)/restore", method: "POST")
    }

    func permanentlyDelete(fileId: String) async throws {
        let _: EmptyResponse = try await request("/api/trash/\(fileId)/permanent", method: "DELETE")
    }

    func star(fileId: String, isStarred: Bool) async throws {
        let _: EmptyResponse = try await request("/api/files/\(fileId)/star", method: "POST", body: ["isStarred": isStarred])
    }

    func storageUsage() async throws -> CVStorageUsage {
        try await request("/api/storage/usage")
    }

    func upload(fileURL: URL, projectId: String, folderId: String?) async throws -> CVFileItem {
        let resourceValues = try fileURL.resourceValues(forKeys: [.fileSizeKey, .contentTypeKey])
        let data = try Data(contentsOf: fileURL)
        let mimeType = resourceValues.contentType?.preferredMIMEType ?? "application/octet-stream"
        struct InitResponse: Codable {
            struct Session: Codable { let id: String }
            struct Upload: Codable { let url: String; let method: String }
            let file: CVFileItem
            let session: Session
            let upload: Upload
        }
        let initResponse: InitResponse = try await request("/api/files/init", method: "POST", body: [
            "name": fileURL.lastPathComponent,
            "size": resourceValues.fileSize ?? data.count,
            "mimeType": mimeType,
            "projectId": projectId,
            "folderId": folderId,
            "tags": [],
            "visibility": "private",
            "roleIds": []
        ])

        var uploadRequest = try await authorizedRequest(path: initResponse.upload.url, method: "PUT")
        uploadRequest.setValue(mimeType, forHTTPHeaderField: "content-type")
        let (_, uploadResponse) = try await session.upload(for: uploadRequest, from: data)
        try validate(uploadResponse, data: Data())

        let _: EmptyResponse = try await request("/api/files/complete", method: "POST", body: [
            "fileId": initResponse.file.id,
            "sessionId": initResponse.session.id
        ])
        return initResponse.file
    }

    func download(file: CVFileItem) async throws -> URL {
        let request = try await authorizedRequest(path: "/api/files/\(file.id)/download", method: "GET")
        let (url, response) = try await session.download(for: request)
        try validate(response, data: Data())
        let destination = FileManager.default.temporaryDirectory.appending(path: file.displayName)
        try? FileManager.default.removeItem(at: destination)
        try FileManager.default.moveItem(at: url, to: destination)
        return destination
    }

    func previewData(file: CVFileItem) async throws -> Data {
        let request = try await authorizedRequest(path: "/api/files/\(file.id)/preview", method: "GET")
        let (data, response) = try await session.data(for: request)
        try validate(response, data: data)
        return data
    }

    private func appRequest<T: Codable>(_ path: String, method: String, body: [String: Any?]? = nil) async throws -> T {
        let data: Data = try await requestData(path, method: method, body: body, appEnvelope: true)
        let envelope = try JSONDecoder().decode(AppEnvelope<T>.self, from: data)
        if envelope.ok, let data = envelope.data { return data }
        throw envelope.error ?? CVAPIError(code: "REQUEST_FAILED", message: "Request failed")
    }

    private func request<T: Codable>(_ path: String, method: String = "GET", queryItems: [URLQueryItem] = [], body: [String: Any?]? = nil) async throws -> T {
        let data = try await requestData(path, method: method, queryItems: queryItems, body: body, appEnvelope: false)
        if T.self == EmptyResponse.self, data.isEmpty { return EmptyResponse() as! T }
        return try JSONDecoder().decode(T.self, from: data)
    }

    private func requestData(_ path: String, method: String, queryItems: [URLQueryItem] = [], body: [String: Any?]?, appEnvelope: Bool) async throws -> Data {
        var request = try await authorizedRequest(path: path, method: method, queryItems: queryItems)
        if let body {
            request.setValue("application/json", forHTTPHeaderField: "content-type")
            request.httpBody = try JSONSerialization.data(withJSONObject: stripNulls(body), options: [])
        }
        let (data, response) = try await session.data(for: request)
        try validate(response, data: data)
        return data
    }

    private func authorizedRequest(path: String, method: String, queryItems: [URLQueryItem] = []) async throws -> URLRequest {
        var components = URLComponents(url: URL(string: path, relativeTo: baseURL)!, resolvingAgainstBaseURL: true)!
        if !queryItems.isEmpty { components.queryItems = queryItems }
        var request = URLRequest(url: components.url!)
        request.httpMethod = method
        if let token = await accessTokenProvider?(), !token.isEmpty {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "authorization")
        }
        request.setValue("application/json", forHTTPHeaderField: "accept")
        return request
    }

    private func validate(_ response: URLResponse, data: Data) throws {
        guard let http = response as? HTTPURLResponse else { return }
        guard (200..<300).contains(http.statusCode) else {
            if let decoded = try? JSONDecoder().decode(ServerErrorEnvelope.self, from: data) {
                throw decoded.error
            }
            throw CVAPIError(code: "HTTP_\(http.statusCode)", message: HTTPURLResponse.localizedString(forStatusCode: http.statusCode))
        }
    }
}

struct EmptyResponse: Codable {}

private struct ServerErrorEnvelope: Codable {
    let error: CVAPIError
}

private func stripNulls(_ dictionary: [String: Any?]) -> [String: Any] {
    dictionary.reduce(into: [String: Any]()) { result, pair in
        if let value = pair.value {
            result[pair.key] = stripJSONValue(value)
        }
    }
}

private func stripJSONValue(_ value: Any) -> Any {
    if let dictionary = value as? [String: Any] {
        return dictionary.reduce(into: [String: Any]()) { result, pair in
            if !(pair.value is NSNull) { result[pair.key] = stripJSONValue(pair.value) }
        }
    }
    if let array = value as? [Any] { return array.map(stripJSONValue) }
    return value
}
