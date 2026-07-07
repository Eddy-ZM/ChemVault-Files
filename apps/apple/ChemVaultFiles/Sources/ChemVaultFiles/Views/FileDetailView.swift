import SwiftUI
#if canImport(UIKit)
import UIKit
#endif

struct FileDetailView: View {
    @EnvironmentObject private var state: AppState
    @State private var previewData: Data?
    @State private var downloadedURL: URL?
    @State private var isSharePresented = false

    var body: some View {
        Group {
            if let file = state.selectedFile {
                VStack(alignment: .leading, spacing: 16) {
                    HStack(spacing: 12) {
                        FileTypeBadge(label: file.fileExtension)
                        VStack(alignment: .leading) {
                            Text(file.displayName).font(.title3.bold()).lineLimit(2)
                            Text(file.typeLabel).foregroundStyle(.secondary)
                        }
                    }
                    FilePreviewView(file: file, data: previewData)
                        .frame(maxWidth: .infinity, maxHeight: 360)
                    Grid(alignment: .leading, horizontalSpacing: 18, verticalSpacing: 8) {
                        DetailRow("Size", ByteCountFormatter.string(fromByteCount: file.sizeBytes, countStyle: .file))
                        DetailRow("Modified", file.updatedAt)
                        DetailRow("Created", file.createdAt)
                        DetailRow("Owner", file.actorEmail ?? "ChemVault")
                        DetailRow("Access", file.visibility)
                    }
                    HStack {
                        Button("Download") { Task { await download(file) } }
                        Button(file.isStarred == true ? "Unstar" : "Star") { Task { await state.toggleStar(file: file) } }
                        Button("Share") { isSharePresented = true }
                        Button("Delete", role: .destructive) { Task { await state.deleteSelected() } }
                    }
                    .buttonStyle(.bordered)
                    Spacer()
                }
                .padding()
                .task(id: file.id) { await loadPreview(file) }
                .sheet(isPresented: $isSharePresented) {
                    ShareSheet(url: downloadedURL)
                }
            } else {
                EmptyStateView(title: "Select a file", systemImage: "sidebar.right", message: "Metadata, preview, and actions appear here.")
            }
        }
    }

    private func loadPreview(_ file: CVFileItem) async {
        do {
            previewData = try await APIClient.shared.previewData(file: file)
        } catch {
            previewData = nil
        }
    }

    private func download(_ file: CVFileItem) async {
        do {
            downloadedURL = try await APIClient.shared.download(file: file)
            isSharePresented = true
        } catch {
            state.errorMessage = error.localizedDescription
        }
    }
}

struct DetailRow: View {
    let label: String
    let value: String
    init(_ label: String, _ value: String) {
        self.label = label
        self.value = value
    }

    var body: some View {
        GridRow {
            Text(label).foregroundStyle(.secondary)
            Text(value).lineLimit(2)
        }
    }
}

struct ShareSheet: View {
    let url: URL?
    var body: some View {
        if let url {
            ShareLink(item: url) { Label("Share Download", systemImage: "square.and.arrow.up") }
                .padding()
        } else {
            EmptyStateView(title: "Download first", systemImage: "square.and.arrow.down", message: "Download a file to share it with another app.")
        }
    }
}
