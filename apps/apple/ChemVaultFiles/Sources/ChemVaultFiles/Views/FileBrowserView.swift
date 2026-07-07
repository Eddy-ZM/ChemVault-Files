import SwiftUI
import UniformTypeIdentifiers

struct FileBrowserView: View {
    @EnvironmentObject private var auth: AuthStore
    @EnvironmentObject private var state: AppState
    @State private var isImporterPresented = false
    @State private var newFolderName = ""
    @State private var showingNewFolder = false

    var body: some View {
        NavigationSplitView {
            SidebarView()
        } content: {
            VStack(spacing: 0) {
                BreadcrumbsView()
                if state.isLoading {
                    LoadingSkeletonView()
                } else if state.section == .settings {
                    SettingsView()
                } else if state.isGrid {
                    FileGridView()
                } else {
                    FileListView()
                }
            }
            .navigationTitle(state.section.title)
            .searchable(text: $state.searchText, placement: .toolbar)
            .onSubmit(of: .search) { Task { await state.search() } }
            .toolbar {
                ToolbarItemGroup {
                    Button { showingNewFolder = true } label: { Label("New Folder", systemImage: "folder.badge.plus") }
                    Button { isImporterPresented = true } label: { Label("Upload", systemImage: "square.and.arrow.up") }
                    Picker("Sort", selection: $state.sort) {
                        ForEach(FileSort.allCases) { sort in Text(sort.rawValue.capitalized).tag(sort) }
                    }
                    Button { state.isGrid.toggle() } label: { Image(systemName: state.isGrid ? "list.bullet" : "square.grid.2x2") }
                    Button { Task { await state.load() } } label: { Image(systemName: "arrow.clockwise") }
                }
            }
        } detail: {
            FileDetailView()
        }
        .task { await state.load() }
        .fileImporter(isPresented: $isImporterPresented, allowedContentTypes: [.item], allowsMultipleSelection: true) { result in
            if case let .success(urls) = result {
                for url in urls { Task { await state.upload(url: url) } }
            }
        }
        .alert("New Folder", isPresented: $showingNewFolder) {
            TextField("Folder name", text: $newFolderName)
            Button("Create") {
                let name = newFolderName
                newFolderName = ""
                Task { await state.createFolder(named: name) }
            }
            Button("Cancel", role: .cancel) {}
        }
        .alert("ChemVault Files", isPresented: Binding(get: { state.errorMessage != nil }, set: { if !$0 { state.errorMessage = nil } })) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(state.errorMessage ?? "")
        }
        .onReceive(NotificationCenter.default.publisher(for: .newFolderRequested)) { _ in
            showingNewFolder = true
        }
    }
}

struct SidebarView: View {
    @EnvironmentObject private var state: AppState
    @EnvironmentObject private var auth: AuthStore

    var body: some View {
        List(selection: $state.section) {
            Section("Files") {
                ForEach(DriveSection.allCases.filter { $0 != .settings }) { section in
                    Label(section.title, systemImage: section.systemImage).tag(section)
                }
            }
            Section("Account") {
                Label(auth.user?.email ?? "Signed in", systemImage: "person.crop.circle")
                Label("Settings", systemImage: DriveSection.settings.systemImage).tag(DriveSection.settings)
            }
        }
        .navigationTitle("ChemVault")
        .onChange(of: state.section) { _, _ in Task { await state.load() } }
    }
}

struct BreadcrumbsView: View {
    @EnvironmentObject private var state: AppState

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                Button("My Files") { Task { await state.goToRoot() } }
                ForEach(state.path) { folder in
                    Image(systemName: "chevron.right").foregroundStyle(.secondary)
                    Text(folder.name).fontWeight(.medium)
                }
            }
            .font(.subheadline)
            .padding(.horizontal)
            .padding(.vertical, 8)
        }
        Divider()
    }
}
