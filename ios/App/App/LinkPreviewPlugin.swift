import Capacitor
import LinkPresentation
import UIKit

/// The only activity item is the page URL. The image is share-sheet metadata,
/// never an attachment. Recipient apps still control their own link previews.
private final class PreviewLinkItem: NSObject, UIActivityItemSource {
    let url: URL
    let title: String
    let image: UIImage?
    init(url: URL, title: String, image: UIImage?) {
        self.url = url; self.title = title; self.image = image
    }
    func activityViewControllerPlaceholderItem(_ activityViewController: UIActivityViewController) -> Any { url }
    func activityViewController(_ activityViewController: UIActivityViewController, itemForActivityType activityType: UIActivity.ActivityType?) -> Any? { url }
    func activityViewController(_ activityViewController: UIActivityViewController, subjectForActivityType activityType: UIActivity.ActivityType?) -> String { title }
    func activityViewControllerLinkMetadata(_ activityViewController: UIActivityViewController) -> LPLinkMetadata? {
        let metadata = LPLinkMetadata()
        metadata.originalURL = url
        metadata.url = url
        metadata.title = title
        if let image { metadata.imageProvider = NSItemProvider(object: image) }
        return metadata
    }
}

@objc(LinkPreviewPlugin)
public class LinkPreviewPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "LinkPreviewPlugin"
    public let jsName = "LinkPreview"
    public let pluginMethods = [CAPPluginMethod(name: "share", returnType: CAPPluginReturnPromise)]

    @objc func share(_ call: CAPPluginCall) {
        guard let value = call.getString("url"), let url = URL(string: value),
              url.scheme == "https", url.host == "pkspot.app" else {
            call.reject("Invalid share URL"); return
        }
        let encoded = call.getString("imageBase64") ?? ""
        let image = encoded.count <= 4 * 1024 * 1024 ? Data(base64Encoded: encoded).flatMap { UIImage(data: $0) } : nil
        let item = PreviewLinkItem(url: url, title: call.getString("title") ?? "PK Spot", image: image)
        DispatchQueue.main.async {
            guard let controller = self.bridge?.viewController, controller.presentedViewController == nil else {
                call.reject("Share sheet unavailable"); return
            }
            let sheet = UIActivityViewController(activityItems: [item], applicationActivities: nil)
            sheet.completionWithItemsHandler = { _, completed, _, error in
                if error != nil { call.reject("Sharing failed") }
                else { call.resolve(["cancelled": !completed, "previewApplied": image != nil]) }
            }
            if let popover = sheet.popoverPresentationController {
                popover.sourceView = controller.view
                popover.sourceRect = CGRect(x: controller.view.bounds.midX, y: controller.view.bounds.midY, width: 1, height: 1)
                popover.permittedArrowDirections = []
            }
            controller.present(sheet, animated: true)
        }
    }
}
