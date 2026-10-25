import Foundation

@main struct MapShareTests {
    static func main() async throws {
        func parse(_ text: String) -> ResolvedMapLink { MapLinkResolver.parse(URL(string: text)!) }
        assert(parse("https://maps.google.com/maps?q=47.5,8.2").location == SharedMapLocation(lat: 47.5, lng: 8.2))
        assert(parse("https://maps.apple.com/?ll=47.5,8.2&name=Training").name == "Training")
        assert(parse("https://www.google.com/maps/place/Example/@48,9,15z/data=!3d47.5!4d8.2").location == SharedMapLocation(lat: 47.5, lng: 8.2))
        assert(parse("https://www.google.com/maps/@48,9,15z").location == nil, "Camera positions must not become draft pin coordinates")
        assert(parse("https://maps.apple.com/?ll=91,8").location == nil)
        assert(parse("https://maps.google.com?q=Seedammstrasse,+8808+Freienbach").name == "Seedammstrasse, 8808 Freienbach")
        assert(parse("https://maps.google.com?q=A%2BB").name == "A+B")
        for value in ["http://maps.apple.com/", "https://maps.app.goo.gl.evil.example/abc", "https://google.com.evil.example/maps", "https://maps.apple.com:444/", "https://user@maps.apple.com/"] {
            assert(!MapLinkResolver.allowed(URL(string: value)!))
        }
        assert(MapLinkResolver.allowed(URL(string: "https://maps.app.goo.gl/example")!))
        for value in ["https://maps.google.com?q=Training", "https://maps.google.com/?q=47.5,8.2"] {
            assert(MapLinkResolver.allowed(URL(string: value)!))
        }
        for value in ["https://www.google.com/?q=Training", "https://google.com/", "https://maps.google.com.evil.example/?q=Training", "https://maps.google.com/search?q=Training"] {
            assert(!MapLinkResolver.allowed(URL(string: value)!))
        }
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
        for path in ["offline", "denied", "escape", "loop"] {
            let original = URL(string: "https://maps.app.goo.gl/\(path)")!
            let draft = try await resolver.resolveForDraft(original)
            assert(draft.url == original && draft.location == nil && draft.resolutionIncomplete,
                   "Resolution failures must retain the original link as a saveable draft")
        }
        let ready = try await resolver.resolveForDraft(URL(string: "https://maps.app.goo.gl/valid")!)
        assert(!ready.resolutionIncomplete && ready.location != nil)
        do {
            _ = try await resolver.resolveForDraft(URL(string: "https://untrusted.example/private")!)
            assertionFailure("Unsupported input must not become a draft")
        } catch MapLinkResolver.Failure.unsupported { }
        MapResponseFixture.requests = []
        let rootRedirect = try await resolver.resolve(URL(string: "https://maps.app.goo.gl/ios-root")!)
        assert(rootRedirect.location == nil && rootRedirect.name == "Training")
        assert(MapResponseFixture.requests == ["/ios-root"], "Stop at the full Maps URL without requesting a consent page")
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
        if url.path == "/offline" {
            client?.urlProtocol(self, didFailWithError: URLError(.notConnectedToInternet))
            return
        }
        if url.path == "/denied" {
            client?.urlProtocol(self, didReceive: HTTPURLResponse(url: url, statusCode: 403, httpVersion: nil, headerFields: nil)!, cacheStoragePolicy: .notAllowed)
            client?.urlProtocolDidFinishLoading(self)
            return
        }
        let target = url.path == "/valid" ? "https://www.google.com/maps?q=47.5,8.2" :
            url.path == "/ios-root" ? "https://maps.google.com?q=Training&ftid=example" :
            url.host == "maps.google.com" && url.path.isEmpty ? "https://www.google.com/maps?q=47.5,8.2" :
            url.path == "/escape" ? "https://untrusted.example/private" : url.absoluteString
        client?.urlProtocol(self, didReceive: HTTPURLResponse(url: url, statusCode: 302, httpVersion: nil, headerFields: ["Location": target])!, cacheStoragePolicy: .notAllowed)
        client?.urlProtocolDidFinishLoading(self)
    }
    override func stopLoading() { }
}
