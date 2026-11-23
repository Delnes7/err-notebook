import Foundation
import Security

/// Each device keeps AI keys in Keychain, excluded from iCloud Keychain synchronization.
enum KeychainStore {
    static let keys = ["gemini_api_key", "openai_api_key"]
    private static let service = "com.delnes.errornotebook.ai"
    static func read(_ key: String, testing: Bool = false) -> String? {
        let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service + (testing ? ".tests" : ""), kSecAttrAccount as String: key,
            kSecReturnData as String: true, kSecMatchLimit as String: kSecMatchLimitOne]
        var result: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess,
              let data = result as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }
    static func write(_ value: String, key: String, testing: Bool = false) throws {
        guard keys.contains(key) else { throw NSError(domain: "Keychain", code: -1) }
        let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service + (testing ? ".tests" : ""), kSecAttrAccount as String: key]
        if value.isEmpty {
            let status = SecItemDelete(query as CFDictionary)
            guard status == errSecSuccess || status == errSecItemNotFound else { throw error(status) }
            return
        }
        let attributes: [String: Any] = [kSecValueData as String: Data(value.utf8),
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly]
        let status = SecItemUpdate(query as CFDictionary, attributes as CFDictionary)
        if status == errSecItemNotFound {
            var item = query
            attributes.forEach { item[$0.key] = $0.value }
            item[kSecAttrSynchronizable as String] = false
            let insertStatus = SecItemAdd(item as CFDictionary, nil)
            guard insertStatus == errSecSuccess else { throw error(insertStatus) }
        } else if status != errSecSuccess { throw error(status) }
    }
    private static func error(_ status: OSStatus) -> NSError {
        NSError(domain: "Keychain", code: Int(status), userInfo: [NSLocalizedDescriptionKey: "密钥保存失败，请重试"])
    }
}
