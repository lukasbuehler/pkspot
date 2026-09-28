import SwiftUI
import UIKit
import UniformTypeIdentifiers

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
    @State private var link: String?
    @State private var loading = true
    @State private var failed = false

    var body: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: 20) {
                Text("Open this location in PK Spot").font(.title2.bold())
                Text("Save the Maps link, then open PK Spot to review the location. Nothing is published.")
                if loading { ProgressView() }
                else if link == nil { Text("No supported Google Maps or Apple Maps link was found.") }
                if failed { Text("Could not save the link. Please try again.").foregroundStyle(.red) }
                Spacer()
                Button("Save Maps link") {
                    guard let link else { return }
                    do { try SharedMapStore.save(link); complete() }
                    catch { failed = true }
                }.buttonStyle(.borderedProminent).disabled(link == nil || loading)
                Button("Cancel", action: cancel)
            }.padding(24).navigationTitle("PK Spot")
        }.task { await readLink() }
    }

    private func readLink() async {
        defer { loading = false }
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
                guard let url = match.url, url.scheme == "https", let host = url.host?.lowercased() else { continue }
                let google = host.range(of: "^(?:(?:www|maps)\\.)?google\\.[a-z]{2,3}(?:\\.[a-z]{2})?$", options: .regularExpression) != nil
                if host == "maps.apple.com" || host == "maps.app.goo.gl" ||
                    ((google || host == "goo.gl") && (url.path == "/maps" || url.path.hasPrefix("/maps/"))) {
                    link = url.absoluteString
                    return
                }
            }
        }
    }
}
