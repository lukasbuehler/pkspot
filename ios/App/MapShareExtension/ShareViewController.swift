import SwiftUI
import UIKit
import UniformTypeIdentifiers
import MapKit

@MainActor
final class ShareViewController: UIViewController {
    override func viewDidLoad() {
        super.viewDidLoad()
        let providers = extensionContext?.inputItems.compactMap { $0 as? NSExtensionItem }
            .flatMap { $0.attachments ?? [] } ?? []
        let host = UIHostingController(rootView: MapShareView(providers: providers, complete: { [weak self] in
            self?.extensionContext?.completeRequest(returningItems: nil)
        }, cancel: { [weak self] in
            self?.extensionContext?.cancelRequest(withError: NSError(domain: "PKSpotMapShare", code: 3))
        }))
        addChild(host)
        host.view.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(host.view)
        NSLayoutConstraint.activate([
            host.view.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            host.view.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            host.view.topAnchor.constraint(equalTo: view.topAnchor),
            host.view.bottomAnchor.constraint(equalTo: view.bottomAnchor)
        ])
        host.didMove(toParent: self)
    }
}

private struct MapShareView: View {
    let providers: [NSItemProvider]
    let complete: () -> Void
    let cancel: () -> Void
    @State private var resolved: ResolvedMapLink?
    @State private var sourceURL: URL?
    @State private var name = ""
    @State private var selectedSpot: NearbySharedSpot?
    @State private var nearby: [NearbySharedSpot] = []
    @State private var loading = true
    @State private var failed = false
    @State private var searchFailed = false
    @State private var snapshot: UIImage?

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    Text("Save a Spot draft").font(.title2.bold())
                    Text("Review this location now and finish in PK Spot later. Nothing is published.")
                    if loading { ProgressView().frame(maxWidth: .infinity).accessibilityLabel(Text("Finding location")) }
                    if let snapshot { Image(uiImage: snapshot).resizable().scaledToFit().clipShape(RoundedRectangle(cornerRadius: 18)) }
                    if resolved != nil {
                        TextField("Spot name (optional)", text: $name).textFieldStyle(.roundedBorder)
                        if resolved?.location == nil {
                            Text("This link does not reveal an exact pin location. You can keep it as a draft and choose the location in PK Spot.")
                        } else if searchFailed {
                            Text("Nearby Spots could not be loaded. You can still save a draft.")
                            Button("Try again") { Task { await loadLocation() } }
                        } else if nearby.isEmpty && !loading {
                            Text("No nearby Spots found.")
                        } else if !nearby.isEmpty {
                            Text("Nearby Spots").font(.headline)
                            Text("Choose a match only if it is the same Spot.").font(.subheadline)
                            ForEach(nearby) { spot in
                                Button {
                                    selectedSpot = selectedSpot?.id == spot.id ? nil : spot
                                } label: {
                                    HStack {
                                        Text(spot.label)
                                        Spacer()
                                        Image(systemName: selectedSpot?.id == spot.id ? "checkmark.circle.fill" : "circle")
                                    }.padding(12)
                                }.buttonStyle(.bordered)
                            }
                        }
                    }
                    if failed {
                        Text("Could not load or save this Maps link. Please try again.").foregroundStyle(.red)
                        if sourceURL != nil { Button("Try again") { Task { await loadLocation() } } }
                    } else if !loading && resolved == nil {
                        Text("No supported Google Maps or Apple Maps link was found.")
                    }
                    Button("Save draft") { save() }
                        .buttonStyle(.borderedProminent).disabled(resolved == nil || loading)
                    Button("Cancel", action: cancel)
                }.padding(24)
            }.navigationTitle("PK Spot")
        }.task { await readLink() }
    }

    private func save() {
        guard let resolved else { return }
        do {
            try SharedMapStore.save(resolved.url.absoluteString, location: resolved.location,
                                    name: name.trimmingCharacters(in: .whitespacesAndNewlines), spotId: selectedSpot?.id)
            complete()
        } catch { failed = true }
    }

    private func loadLocation() async {
        guard let sourceURL else { return }
        loading = true; failed = false; searchFailed = false; selectedSpot = nil; nearby = []; snapshot = nil
        defer { loading = false }
        do {
            let result = try await MapLinkResolver().resolve(sourceURL)
            resolved = result
            if name.isEmpty { name = result.name ?? "" }
            if let point = result.location {
                let options = MKMapSnapshotter.Options()
                options.region = MKCoordinateRegion(center: CLLocationCoordinate2D(latitude: point.lat, longitude: point.lng),
                                                    latitudinalMeters: 400, longitudinalMeters: 400)
                options.size = CGSize(width: 560, height: 260)
                options.scale = 2
                // A map preview is optional; search and draft capture remain usable without tiles.
                let snapshotter = MKMapSnapshotter(options: options)
                let previewTimeout = Task {
                    try? await Task.sleep(nanoseconds: 5_000_000_000)
                    if !Task.isCancelled { snapshotter.cancel() }
                }
                defer { previewTimeout.cancel() }
                async let preview = try? snapshotter.start()
                do { nearby = try await NearbySpotSearch.search(point) }
                catch { searchFailed = true }
                if let map = await preview {
                    let renderer = UIGraphicsImageRenderer(size: map.image.size)
                    snapshot = renderer.image { _ in
                        map.image.draw(at: .zero)
                        let pin = map.point(for: options.region.center)
                        UIColor.systemBlue.setFill()
                        UIBezierPath(ovalIn: CGRect(x: pin.x - 7, y: pin.y - 7, width: 14, height: 14)).fill()
                    }
                }
            }
        } catch { failed = true; resolved = nil }
    }

    private func readLink() async {
        for provider in providers {
            let type = provider.hasItemConformingToTypeIdentifier(UTType.url.identifier)
                ? UTType.url.identifier : UTType.plainText.identifier
            guard provider.hasItemConformingToTypeIdentifier(type) else { continue }
            let value: String? = await withCheckedContinuation { continuation in
                provider.loadItem(forTypeIdentifier: type, options: nil) { value, _ in
                    continuation.resume(returning: (value as? URL)?.absoluteString ?? value as? String)
                }
            }
            guard let value, value.count <= 16384,
                  let detector = try? NSDataDetector(types: NSTextCheckingResult.CheckingType.link.rawValue) else { continue }
            for match in detector.matches(in: value, range: NSRange(value.startIndex..., in: value)) {
                guard let url = match.url, MapLinkResolver.allowed(url) else { continue }
                sourceURL = url
                await loadLocation()
                return
            }
        }
        loading = false
    }
}
