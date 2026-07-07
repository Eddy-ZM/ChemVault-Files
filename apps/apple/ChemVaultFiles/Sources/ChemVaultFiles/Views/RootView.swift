import SwiftUI

struct RootView: View {
    @EnvironmentObject private var auth: AuthStore

    var body: some View {
        Group {
            if auth.isSignedIn {
                FileBrowserView()
            } else {
                LoginView()
            }
        }
        .alert("ChemVault Files", isPresented: Binding(get: { auth.errorMessage != nil }, set: { if !$0 { auth.errorMessage = nil } })) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(auth.errorMessage ?? "")
        }
    }
}

struct LoginView: View {
    @EnvironmentObject private var auth: AuthStore
    @Environment(\.openURL) private var openURL

    var body: some View {
        VStack(spacing: 24) {
            Image(systemName: "folder.badge.gearshape")
                .font(.system(size: 62, weight: .semibold))
                .foregroundStyle(.blue)
            VStack(spacing: 8) {
                Text("ChemVault Files")
                    .font(.largeTitle.bold())
                Text("Sign in with ChemVault User to access your research file workspace.")
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
            }
            Button {
                Task { openURL(await auth.loginURL()) }
            } label: {
                Label("Sign in", systemImage: "person.crop.circle.badge.checkmark")
                    .frame(minWidth: 180)
            }
            .buttonStyle(.borderedProminent)
        }
        .padding(40)
    }
}
