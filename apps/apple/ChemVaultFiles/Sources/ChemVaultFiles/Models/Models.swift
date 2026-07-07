import Foundation

enum DriveSection: String, CaseIterable, Identifiable {
    case files
    case recent
    case starred
    case shared
    case trash
    case settings

    var id: String { rawValue }

    var title: String {
        switch self {
        case .files: return "My Files"
        case .recent: return "Recent"
        case .starred: return "Starred"
        case .shared: return "Shared with Me"
        case .trash: return "Recycle Bin"
        case .settings: return "Settings"
        }
    }

    var systemImage: String {
        switch self {
        case .files: return "folder"
        case .recent: return "clock"
        case .starred: return "star"
        case .shared: return "person.2"
        case .trash: return "trash"
        case .settings: return "gearshape"
        }
    }
}

enum FileSort: String, CaseIterable, Identifiable {
    case name
    case size
    case modified
    case type
    var id: String { rawValue }
}

struct CVUser: Codable, Equatable, Identifiable {
    let id: String
    let email: String
    let name: String?
    let role: String
    let systemRole: String
    let permissions: [String]
    let services: [String]
    let serviceAllowed: Bool
    let serviceReason: String?
}

struct CVTag: Codable, Equatable, Identifiable {
    let id: String
    let name: String
    let slug: String
    let color: String?
    let createdAt: String
}

struct CVFileItem: Codable, Equatable, Identifiable {
    let id: String
    let projectId: String
    let folderId: String?
    let displayName: String
    let originalName: String
    let mimeType: String?
    let sizeBytes: Int64
    let status: String
    let checksum: String?
    let actorEmail: String?
    let downloadCount: Int
    let visibility: String
    let roleIds: [String]
    let ownerUserId: String?
    let parentId: String?
    let isStarred: Bool?
    let trashedAt: String?
    let lastOpenedAt: String?
    let sharedStatus: String?
    let createdAt: String
    let updatedAt: String
    let deletedAt: String?
    let tags: [CVTag]

    var fileExtension: String {
        let ext = (displayName as NSString).pathExtension
        return ext.isEmpty ? "FILE" : ext.uppercased()
    }

    var typeLabel: String {
        let lowerName = displayName.lowercased()
        let lowerMime = mimeType?.lowercased() ?? ""
        if lowerMime.contains("pdf") || lowerName.hasSuffix(".pdf") { return "PDF" }
        if lowerMime.hasPrefix("image/") { return "Image" }
        if lowerMime.contains("spreadsheet") || lowerName.hasSuffix(".xlsx") || lowerName.hasSuffix(".csv") { return "Spreadsheet" }
        if lowerMime.contains("presentation") || lowerName.hasSuffix(".pptx") { return "Presentation" }
        if lowerMime.contains("word") || lowerName.hasSuffix(".docx") { return "Document" }
        if lowerName.hasSuffix(".json") || lowerName.hasSuffix(".xml") || lowerName.hasSuffix(".md") || lowerName.hasSuffix(".txt") { return "Text" }
        if lowerName.hasSuffix(".zip") { return "Archive" }
        return "File"
    }
}

struct CVFolder: Codable, Equatable, Identifiable {
    let id: String
    let projectId: String
    let parentId: String?
    let name: String
    let slug: String
    let path: String
    let ownerUserId: String?
    let isStarred: Bool?
    let isTrashed: Bool?
    let trashedAt: String?
    let deletedAt: String?
    let createdAt: String
    let updatedAt: String
}

struct CVShareLink: Codable, Equatable, Identifiable {
    var id: String { token }
    let token: String
    let fileId: String
    let createdByEmail: String?
    let allowDownload: Bool
    let isPublic: Bool
    let expiresAt: String
    let createdAt: String
    let revokedAt: String?
    let accessCount: Int
    let lastAccessedAt: String?
}

struct CVStorageUsage: Codable, Equatable {
    struct Bucket: Codable, Equatable, Identifiable {
        var id: String { type }
        let type: String
        let label: String
        let bytes: Int64
        let count: Int
    }

    let usedBytes: Int64
    let quotaBytes: Int64
    let fileCount: Int
    let byType: [Bucket]
}

struct CVAPIError: Codable, Error, Equatable, LocalizedError {
    let code: String
    let message: String
    var errorDescription: String? { message }
}

struct AuthTokens: Codable, Equatable {
    let user: CVUser
    let accessToken: String
    let refreshToken: String
    let tokenType: String
    let expiresIn: Int
    let refreshExpiresIn: Int
}

struct ListFilesResponse: Codable, Equatable {
    let view: String
    let parentId: String?
    let folders: [CVFolder]
    let files: [CVFileItem]
}

struct AppEnvelope<T: Codable>: Codable {
    let ok: Bool
    let data: T?
    let error: CVAPIError?
}
