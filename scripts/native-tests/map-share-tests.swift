import Foundation

@main struct MapShareTests {
    static func main() async throws {
        func parse(_ text: String) -> ResolvedMapLink { MapLinkResolver.parse(URL(string: text)!) }
        assert(parse("https://maps.google.com/maps?q=47.5,8.2").location == SharedMapLocation(lat: 47.5, lng: 8.2))
        assert(parse("https://maps.apple.com/?ll=47.5,8.2&name=Training").name == "Training")
        assert(parse("https://www.google.com/maps/place/Example/@48,9,15z/data=!3d47.5!4d8.2").location == SharedMapLocation(lat: 47.5, lng: 8.2))
        assert(parse("https://www.google.com/maps/@48,9,15z").location == nil, "Camera positions must not become draft pin coordinates")
        assert(parse("https://maps.apple.com/?ll=91,8").location == nil)
        for value in ["http://maps.apple.com/", "https://maps.app.goo.gl.evil.example/abc", "https://google.com.evil.example/maps", "https://maps.apple.com:444/", "https://user@maps.apple.com/"] {
            assert(!MapLinkResolver.allowed(URL(string: value)!))
        }
        assert(MapLinkResolver.allowed(URL(string: "https://maps.app.goo.gl/example")!))
        let old = try JSONDecoder().decode(SharedMapLink.self, from: Data("{\"id\":\"old\",\"text\":\"https://maps.apple.com/\"}".utf8))
        assert(old.location == nil && old.name == nil, "Old link-only drafts remain readable")
        let results = try JSONDecoder().decode(NearbySpotSearch.Results.self, from: Data("{\"hits\":[{\"document\":{\"id\":\"one\",\"name\":{\"en\":{\"text\":\"Walls\",\"timestamp\":{\"seconds\":1}}}}},{\"document\":{\"id\":\"two\",\"name\":{\"en\":\"Rail\"}}}]}".utf8))
        assert(results.hits.map { $0.document.label } == ["Walls", "Rail"])
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [MapResponseFixture.self]
        let resolver = MapLinkResolver(configuration: configuration)
        let result = try await resolver.resolve(URL(string: "https://maps.app.goo.gl/valid")!)
        assert(result.location == SharedMapLocation(lat: 47.5, lng: 8.2))
        assert(MapResponseFixture.requests == ["/valid"], "Coordinate-bearing destinations need no second HTTP request")
        do {
            _ = try await resolver.resolve(URL(string: "https://maps.app.goo.gl/escape")!)
            assertionFailure("Off-domain redirect was accepted")
        } catch MapLinkResolver.Failure.unsupported { }
        assert(MapResponseFixture.requests == ["/valid", "/escape"], "Never request a rejected redirect destination")
        do {
            _ = try await resolver.resolve(URL(string: "https://maps.app.goo.gl/loop")!)
            assertionFailure("Redirect loop was accepted")
        } catch MapLinkResolver.Failure.redirects { }
        print("Map share parser, host validation, legacy drafts and Typesense decoding passed")
    }
}

final class MapResponseFixture: URLProtocol {
    static var requests: [String] = []
    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        let url = request.url!
        Self.requests.append(url.path)
        let target = url.path == "/valid" ? "https://www.google.com/maps?q=47.5,8.2" :
            url.path == "/escape" ? "https://untrusted.example/private" : url.absoluteString
        client?.urlProtocol(self, didReceive: HTTPURLResponse(url: url, statusCode: 302, httpVersion: nil, headerFields: ["Location": target])!, cacheStoragePolicy: .notAllowed)
        client?.urlProtocolDidFinishLoading(self)
    }
    override func stopLoading() { }
}
