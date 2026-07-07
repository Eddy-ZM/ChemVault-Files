import SwiftUI

struct EmptyStateView: View {
    let title: String
    let systemImage: String
    let message: String

    var body: some View {
        VStack(spacing: 12) {
            Image(systemName: systemImage)
                .font(.system(size: 46, weight: .semibold))
                .foregroundStyle(.blue)
            Text(title).font(.headline)
            Text(message)
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding()
    }
}

struct LoadingSkeletonView: View {
    var body: some View {
        VStack(spacing: 12) {
            ForEach(0..<8, id: \.self) { _ in
                HStack {
                    RoundedRectangle(cornerRadius: 8).fill(.quaternary).frame(width: 42, height: 42)
                    VStack(alignment: .leading) {
                        RoundedRectangle(cornerRadius: 4).fill(.quaternary).frame(height: 14)
                        RoundedRectangle(cornerRadius: 4).fill(.quaternary).frame(width: 160, height: 10)
                    }
                }
                .redacted(reason: .placeholder)
            }
            Spacer()
        }
        .padding()
    }
}

struct SettingsView: View {
    @EnvironmentObject private var auth: AuthStore
    @EnvironmentObject private var state: AppState

    var body: some View {
        Form {
            Section("Account") {
                LabeledContent("Login", value: auth.user?.email ?? "Sign in required")
                LabeledContent("Role", value: auth.user?.role ?? "Unknown")
                Button("Sign Out", role: .destructive) { auth.signOut() }
            }
            Section("Storage") {
                if let usage = state.storageUsage {
                    ProgressView(value: Double(usage.usedBytes), total: Double(max(usage.quotaBytes, 1)))
                    LabeledContent("Used", value: ByteCountFormatter.string(fromByteCount: usage.usedBytes, countStyle: .file))
                    LabeledContent("Quota", value: ByteCountFormatter.string(fromByteCount: usage.quotaBytes, countStyle: .file))
                    ForEach(usage.byType) { bucket in
                        LabeledContent(bucket.label, value: ByteCountFormatter.string(fromByteCount: bucket.bytes, countStyle: .file))
                    }
                } else {
                    Text("Storage usage will appear after refresh.")
                }
            }
            Section("Updates") {
                Text("iOS and iPadOS updates are delivered through TestFlight or the App Store. Direct macOS distribution can use Sparkle in a later release.")
                    .foregroundStyle(.secondary)
            }
        }
        .task { await state.load() }
    }
}
