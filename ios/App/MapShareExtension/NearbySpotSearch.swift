import Foundation

struct NearbySharedSpot: Identifiable, Decodable {
    let id: String
    struct Name: Decodable {
        let text: String
        init(from decoder: Decoder) throws {
            let single = try decoder.singleValueContainer()
            if let value = try? single.decode(String.self) { text = value; return }
            text = try decoder.container(keyedBy: CodingKeys.self).decode(String.self, forKey: .text)
        }
        private enum CodingKeys: String, CodingKey { case text }
    }
    let name: [String: Name]
    let location: [Double]?
    var label: String {
        let language = Locale.current.language.languageCode?.identifier ?? "en"
        return name[language]?.text ?? name.first(where: { $0.key.hasPrefix(language + "-") })?.value.text ?? name["en"]?.text ?? name.sorted(by: { $0.key < $1.key }).first?.value.text ?? "Spot"
    }
}

/// Public discovery only. This key has the same search-only scope as the web app.
enum NearbySpotSearch {
    struct Results: Decodable {
        struct Hit: Decodable { let document: NearbySharedSpot }
        let hits: [Hit]
    }
    static func search(_ point: SharedMapLocation) async throws -> [NearbySharedSpot] {
        guard let key = Bundle.main.object(forInfoDictionaryKey: "TypesenseSearchKey") as? String else {
            throw URLError(.userAuthenticationRequired)
        }
        var url = URLComponents(string: "https://search.pkspot.app/collections/spots_v2/documents/search")!
        url.queryItems = [
            URLQueryItem(name: "q", value: "*"),
            URLQueryItem(name: "query_by", value: "name_search"),
            URLQueryItem(name: "filter_by", value: "location:(\(point.lat), \(point.lng), 0.15 km)"),
            URLQueryItem(name: "sort_by", value: "location(\(point.lat), \(point.lng)):asc"),
            URLQueryItem(name: "per_page", value: "5"),
            URLQueryItem(name: "include_fields", value: "id,name,location")
        ]
        var request = URLRequest(url: url.url!)
        request.timeoutInterval = 8
        request.setValue("PKSpot/1.2 map-share", forHTTPHeaderField: "User-Agent")
        request.setValue(key, forHTTPHeaderField: "X-TYPESENSE-API-KEY")
        let session = URLSession(configuration: .ephemeral)
        defer { session.invalidateAndCancel() }
        let (data, response) = try await session.data(for: request)
        guard (response as? HTTPURLResponse)?.statusCode == 200, data.count < 250_000 else { throw URLError(.badServerResponse) }
        return try JSONDecoder().decode(Results.self, from: data).hits.map(\.document)
    }
}
