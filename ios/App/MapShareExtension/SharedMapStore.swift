import Foundation

struct SharedMapLink: Codable {
    let id: String
    let text: String
    var location: SharedMapLocation?
    var name: String?
    var spotId: String?
    var createdAt: Double?
}

/// One atomic file per share avoids lost updates between app and extension.
enum SharedMapStore {
    static let group = "group.com.pkspot.app.media"
    static func directory() throws -> URL {
        guard let container = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: group) else {
            throw NSError(domain: "PKSpotMapShare", code: 1)
        }
        let directory = container.appendingPathComponent("map-links", isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        return directory
    }
    static func save(_ text: String, location: SharedMapLocation? = nil, name: String? = nil, spotId: String? = nil) throws {
        let link = SharedMapLink(id: UUID().uuidString, text: text, location: location, name: name, spotId: spotId, createdAt: Date().timeIntervalSince1970 * 1000)
        let url = try directory().appendingPathComponent(link.id + ".json")
        try JSONEncoder().encode(link).write(to: url, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
    }
    static func pending() throws -> [SharedMapLink] {
        try FileManager.default.contentsOfDirectory(at: directory(), includingPropertiesForKeys: nil)
            .filter { $0.pathExtension == "json" }
            .sorted { $0.lastPathComponent < $1.lastPathComponent }
            .compactMap { try? JSONDecoder().decode(SharedMapLink.self, from: Data(contentsOf: $0)) }
            .sorted { ($0.createdAt ?? 0) > ($1.createdAt ?? 0) }
    }
    static func acknowledge(_ id: String) throws {
        guard UUID(uuidString: id) != nil else { throw NSError(domain: "PKSpotMapShare", code: 2) }
        try FileManager.default.removeItem(at: directory().appendingPathComponent(id + ".json"))
    }
}
