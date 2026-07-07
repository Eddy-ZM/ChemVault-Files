import SwiftUI

struct FileListView: View {
    @EnvironmentObject private var state: AppState

    var body: some View {
        List {
            if state.folders.isEmpty && state.files.isEmpty {
                EmptyStateView(title: "No files here", systemImage: "folder", message: "Upload files or create a folder to start.")
            }
            ForEach(state.folders) { folder in
                Button { Task { await state.enter(folder: folder) } } label: {
                    HStack {
                        Image(systemName: "folder.fill").foregroundStyle(.blue)
                        VStack(alignment: .leading) {
                            Text(folder.name).lineLimit(1)
                            Text(folder.path).font(.caption).foregroundStyle(.secondary).lineLimit(1)
                        }
                    }
                }
            }
            ForEach(state.files) { file in
                FileRowView(file: file)
                    .contextMenu {
                        Button(file.isStarred == true ? "Unstar" : "Star") { Task { await state.toggleStar(file: file) } }
                        Button("Delete", role: .destructive) {
                            state.selectedFile = file
                            Task { await state.deleteSelected() }
                        }
                        if state.section == .trash {
                            Button("Restore") { Task { await state.restore(file: file) } }
                            Button("Delete Permanently", role: .destructive) { Task { await state.permanentlyDelete(file: file) } }
                        }
                    }
                    .onTapGesture {
                        state.selectedFile = file
                    }
            }
        }
    }
}

struct FileRowView: View {
    let file: CVFileItem

    var body: some View {
        HStack(spacing: 12) {
            FileTypeBadge(label: file.fileExtension)
            VStack(alignment: .leading, spacing: 3) {
                Text(file.displayName).lineLimit(1)
                Text("\(file.typeLabel) · \(ByteCountFormatter.string(fromByteCount: file.sizeBytes, countStyle: .file))")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            Spacer()
            if file.isStarred == true {
                Image(systemName: "star.fill").foregroundStyle(.yellow)
            }
        }
    }
}

struct FileGridView: View {
    @EnvironmentObject private var state: AppState
    private let columns = [GridItem(.adaptive(minimum: 150), spacing: 12)]

    var body: some View {
        ScrollView {
            LazyVGrid(columns: columns, spacing: 12) {
                ForEach(state.folders) { folder in
                    Button { Task { await state.enter(folder: folder) } } label: {
                        FileTile(title: folder.name, subtitle: "Folder", badge: "DIR", systemImage: "folder.fill")
                    }
                    .buttonStyle(.plain)
                }
                ForEach(state.files) { file in
                    FileTile(title: file.displayName, subtitle: file.typeLabel, badge: file.fileExtension, systemImage: "doc")
                        .onTapGesture { state.selectedFile = file }
                }
            }
            .padding()
        }
    }
}

struct FileTile: View {
    let title: String
    let subtitle: String
    let badge: String
    let systemImage: String

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                FileTypeBadge(label: badge)
                Spacer()
                Image(systemName: systemImage).foregroundStyle(.blue)
            }
            Text(title).font(.headline).lineLimit(2)
            Text(subtitle).font(.caption).foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, minHeight: 126, alignment: .topLeading)
        .padding(12)
        .background(.background, in: RoundedRectangle(cornerRadius: 10))
        .overlay(RoundedRectangle(cornerRadius: 10).stroke(.quaternary))
    }
}

struct FileTypeBadge: View {
    let label: String
    var body: some View {
        Text(label.prefix(5))
            .font(.caption2.bold())
            .foregroundStyle(.blue)
            .frame(width: 42, height: 42)
            .background(.blue.opacity(0.1), in: RoundedRectangle(cornerRadius: 8))
    }
}
