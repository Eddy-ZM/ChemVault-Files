import Foundation

@MainActor
final class AppState: ObservableObject {
    @Published var section: DriveSection = .files
    @Published var files: [CVFileItem] = []
    @Published var folders: [CVFolder] = []
    @Published var selectedFile: CVFileItem?
    @Published var selectedFolderId: String?
    @Published var path: [CVFolder] = []
    @Published var searchText = ""
    @Published var sort: FileSort = .modified
    @Published var isGrid = false
    @Published var isLoading = false
    @Published var errorMessage: String?
    @Published var storageUsage: CVStorageUsage?
    @Published var uploadProgress: Double?

    private let client: APIClient

    init(client: APIClient = .shared) {
        self.client = client
    }

    func load() async {
        isLoading = true
        errorMessage = nil
        do {
            if section == .settings {
                storageUsage = try await client.storageUsage()
            } else {
                let response = try await client.listFiles(parentId: selectedFolderId, view: section)
                folders = response.folders
                files = sortFiles(response.files)
            }
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }

    func enter(folder: CVFolder) async {
        selectedFolderId = folder.id
        path.append(folder)
        await load()
    }

    func goToRoot() async {
        selectedFolderId = nil
        path.removeAll()
        await load()
    }

    func search() async {
        guard !searchText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            await load()
            return
        }
        isLoading = true
        do {
            files = sortFiles(try await client.search(query: searchText))
            folders = []
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }

    func createFolder(named name: String) async {
        guard let projectId = folders.first?.projectId ?? files.first?.projectId else {
            errorMessage = "Open a project or folder before creating a folder."
            return
        }
        do {
            _ = try await client.createFolder(projectId: projectId, parentId: selectedFolderId, name: name)
            await load()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func deleteSelected() async {
        guard let file = selectedFile else { return }
        do {
            try await client.delete(fileId: file.id)
            selectedFile = nil
            await load()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func restore(file: CVFileItem) async {
        do {
            try await client.restore(fileId: file.id)
            await load()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func permanentlyDelete(file: CVFileItem) async {
        do {
            try await client.permanentlyDelete(fileId: file.id)
            await load()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func toggleStar(file: CVFileItem) async {
        do {
            try await client.star(fileId: file.id, isStarred: !(file.isStarred ?? false))
            await load()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func upload(url: URL) async {
        guard let projectId = folders.first?.projectId ?? files.first?.projectId else {
            errorMessage = "Open a project or folder before uploading."
            return
        }
        let hasAccess = url.startAccessingSecurityScopedResource()
        defer {
            if hasAccess { url.stopAccessingSecurityScopedResource() }
        }
        uploadProgress = 0.2
        do {
            _ = try await client.upload(fileURL: url, projectId: projectId, folderId: selectedFolderId)
            uploadProgress = 1
            await load()
        } catch {
            errorMessage = error.localizedDescription
        }
        uploadProgress = nil
    }

    private func sortFiles(_ input: [CVFileItem]) -> [CVFileItem] {
        switch sort {
        case .name: input.sorted { $0.displayName.localizedCaseInsensitiveCompare($1.displayName) == .orderedAscending }
        case .size: input.sorted { $0.sizeBytes > $1.sizeBytes }
        case .modified: input.sorted { $0.updatedAt > $1.updatedAt }
        case .type: input.sorted { $0.typeLabel < $1.typeLabel }
        }
    }
}
