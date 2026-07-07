import SwiftUI

@main
struct ChemVaultFilesApp: App {
    @StateObject private var authStore = AuthStore()
    @StateObject private var appState = AppState()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(authStore)
                .environmentObject(appState)
                .onOpenURL { url in
                    Task { await authStore.handleCallback(url: url) }
                }
        }
        .commands {
            CommandGroup(replacing: .newItem) {
                Button("New Folder") {
                    NotificationCenter.default.post(name: .newFolderRequested, object: nil)
                }
                .keyboardShortcut("n", modifiers: .command)
            }
            CommandMenu("Account") {
                Button("Sign Out") { authStore.signOut() }
            }
            CommandMenu("Files") {
                Button("Refresh") { Task { await appState.load() } }
                    .keyboardShortcut("r", modifiers: .command)
                Button("Delete") { Task { await appState.deleteSelected() } }
                    .keyboardShortcut(.delete, modifiers: [])
            }
        }
    }
}

extension Notification.Name {
    static let newFolderRequested = Notification.Name("ChemVaultFilesNewFolderRequested")
}
