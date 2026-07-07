import Foundation
import SwiftUI

@MainActor
final class AuthStore: ObservableObject {
    @Published private(set) var user: CVUser?
    @Published var isAuthenticating = false
    @Published var errorMessage: String?

    private let keychain = KeychainStore()
    private let client: APIClient

    init(client: APIClient = .shared) {
        self.client = client
        Task {
            await client.setAccessTokenProvider { [weak self] in
                await self?.accessToken()
            }
            await restoreSession()
        }
    }

    var isSignedIn: Bool { user != nil && keychain.read(.accessToken) != nil }

    func loginURL() async -> URL {
        await client.loginURL()
    }

    func handleCallback(url: URL) async {
        guard let components = URLComponents(url: url, resolvingAgainstBaseURL: false),
              let accessToken = components.queryItems?.first(where: { $0.name == "access_token" })?.value,
              let refreshToken = components.queryItems?.first(where: { $0.name == "refresh_token" })?.value
        else {
            errorMessage = "Login callback was missing session tokens."
            return
        }
        do {
            try keychain.write(accessToken, for: .accessToken)
            try keychain.write(refreshToken, for: .refreshToken)
            user = try await client.me()
            errorMessage = nil
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func restoreSession() async {
        guard keychain.read(.accessToken) != nil else { return }
        do {
            user = try await client.me()
        } catch {
            await refreshSession()
        }
    }

    func refreshSession() async {
        guard let refreshToken = keychain.read(.refreshToken) else {
            signOut()
            return
        }
        do {
            let tokens = try await client.refresh(refreshToken: refreshToken)
            try keychain.write(tokens.accessToken, for: .accessToken)
            try keychain.write(tokens.refreshToken, for: .refreshToken)
            user = tokens.user
            errorMessage = nil
        } catch {
            signOut()
            errorMessage = error.localizedDescription
        }
    }

    func signOut() {
        keychain.clear()
        user = nil
    }

    nonisolated private func accessToken() async -> String? {
        await MainActor.run {
            keychain.read(.accessToken)
        }
    }
}
