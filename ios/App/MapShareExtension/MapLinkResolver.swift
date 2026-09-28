import Foundation

struct SharedMapLocation: Codable, Equatable {
    let lat: Double
    let lng: Double
}

struct ResolvedMapLink {
    let url: URL
    let location: SharedMapLocation?
    let name: String?
}

/// Native HTTP can inspect redirects without the browser's CORS proxy.
/// Never contact a redirect destination before checking its scheme and host.
final class MapLinkResolver: NSObject, URLSessionTaskDelegate {
    enum Failure: Error { case unsupported, redirects, response }
    private let configuration: URLSessionConfiguration
    init(configuration: URLSessionConfiguration = .ephemeral) {
        self.configuration = configuration
        super.init()
    }
    func urlSession(_ session: URLSession, task: URLSessionTask,
                    willPerformHTTPRedirection response: HTTPURLResponse,
                    newRequest request: URLRequest,
                    completionHandler: @escaping (URLRequest?) -> Void) {
        completionHandler(nil)
    }

    static func allowed(_ url: URL) -> Bool {
        guard url.scheme == "https", url.user == nil, url.password == nil,
              url.port == nil || url.port == 443, let host = url.host?.lowercased(),
              url.absoluteString.count <= 16384 else { return false }
        if host == "maps.apple.com" || host == "maps.app.goo.gl" { return true }
        let google = host.range(of: "^(?:(?:www|maps)\\.)?google\\.[a-z]{2,3}(?:\\.[a-z]{2})?$", options: .regularExpression) != nil
        return (google || host == "goo.gl") && (url.path == "/maps" || url.path.hasPrefix("/maps/"))
    }

    func resolve(_ initial: URL) async throws -> ResolvedMapLink {
        guard Self.allowed(initial) else { throw Failure.unsupported }
        let config = configuration
        config.timeoutIntervalForRequest = 8
        config.timeoutIntervalForResource = 10
        let session = URLSession(configuration: config, delegate: self, delegateQueue: nil)
        defer { session.invalidateAndCancel() }
        let deadline = Date().addingTimeInterval(10)
        var current = initial
        var visited = Set<URL>()
        for _ in 0..<6 {
            guard Self.allowed(current), visited.insert(current).inserted,
                  deadline.timeIntervalSinceNow > 0 else { throw Failure.redirects }
            // Direct links with coordinates need no network request at all.
            let parsed = Self.parse(current)
            if parsed.location != nil { return parsed }
            var request = URLRequest(url: current)
            request.timeoutInterval = min(8, deadline.timeIntervalSinceNow)
            request.setValue("PKSpot/1.2 map-share", forHTTPHeaderField: "User-Agent")
            // Only headers are needed; do not download the Maps HTML page.
            let (_, response) = try await session.bytes(for: request)
            guard let http = response as? HTTPURLResponse else { throw Failure.response }
            if (300..<400).contains(http.statusCode) {
                guard let target = http.value(forHTTPHeaderField: "Location"),
                      let next = URL(string: target, relativeTo: current)?.absoluteURL,
                      Self.allowed(next) else { throw Failure.unsupported }
                current = next
            } else {
                guard (200..<300).contains(http.statusCode) else { throw Failure.response }
                return parsed
            }
        }
        throw Failure.redirects
    }

    static func parse(_ url: URL) -> ResolvedMapLink {
        let items = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems ?? []
        func value(_ key: String) -> String? { items.first { $0.name == key }?.value }
        func coordinate(_ text: String?) -> SharedMapLocation? {
            guard let text else { return nil }
            let parts = text.split(separator: ",").map { $0.trimmingCharacters(in: .whitespaces) }
            guard parts.count == 2, let lat = Double(parts[0]), let lng = Double(parts[1]),
                  lat.isFinite, lng.isFinite, abs(lat) <= 90, abs(lng) <= 180 else { return nil }
            return SharedMapLocation(lat: lat, lng: lng)
        }
        let query = value("query") ?? value("q")
        var location = coordinate(value("coordinate")) ?? coordinate(query) ?? (url.host == "maps.apple.com" ? coordinate(value("ll")) : nil)
        let path = url.path
        if let regex = try? NSRegularExpression(pattern: "!3d(-?[0-9.]+)!4d(-?[0-9.]+)"),
           let match = regex.firstMatch(in: path, range: NSRange(path.startIndex..., in: path)),
           let lat = Range(match.range(at: 1), in: path), let lng = Range(match.range(at: 2), in: path) {
            location = coordinate("\(path[lat]),\(path[lng])") ?? location
        }
        // /@lat,lng is a camera position, not proof of the shared pin's location.
        let pathName = path.components(separatedBy: "/place/").dropFirst().first?.components(separatedBy: "/").first
        let name = value("name") ?? (coordinate(query) == nil ? query : nil) ?? pathName?.replacingOccurrences(of: "+", with: " ")
        return ResolvedMapLink(url: url, location: location, name: name)
    }
}
