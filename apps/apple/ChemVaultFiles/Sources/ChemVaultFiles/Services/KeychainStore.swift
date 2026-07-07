import Foundation
import Security

struct KeychainStore {
    enum Key: String {
        case accessToken
        case refreshToken
    }

    let service = "science.chemvault.files"

    func read(_ key: Key) -> String? {
        var query = baseQuery(key)
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne
        var item: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &item)
        guard status == errSecSuccess, let data = item as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }

    func write(_ value: String, for key: Key) throws {
        let data = Data(value.utf8)
        var query = baseQuery(key)
        let attributes: [String: Any] = [kSecValueData as String: data]
        let status = SecItemUpdate(query as CFDictionary, attributes as CFDictionary)
        if status == errSecSuccess { return }
        query[kSecValueData as String] = data
        query[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        let addStatus = SecItemAdd(query as CFDictionary, nil)
        guard addStatus == errSecSuccess else {
            throw CVAPIError(code: "KEYCHAIN_WRITE_FAILED", message: "Could not save secure session.")
        }
    }

    func delete(_ key: Key) {
        SecItemDelete(baseQuery(key) as CFDictionary)
    }

    func clear() {
        delete(.accessToken)
        delete(.refreshToken)
    }

    private func baseQuery(_ key: Key) -> [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key.rawValue
        ]
    }
}
