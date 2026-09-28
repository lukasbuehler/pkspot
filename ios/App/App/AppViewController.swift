import Capacitor
import WebKit

@objc(AppViewController)
class AppViewController: CAPBridgeViewController {
    private var pageLoadObservation: NSKeyValueObservation?
    private var lastPublishedInsets: UIEdgeInsets?

    // WebKit on foldable simulators can expose stale env(safe-area-inset-*)
    // values until the first rotation. UIKit is the authoritative source; the
    // shared CSS variables keep native and browser layout on the same contract.
    override func viewSafeAreaInsetsDidChange() {
        super.viewSafeAreaInsetsDidChange()
        publishSafeAreaInsets()
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        publishSafeAreaInsets()
    }

    private func publishSafeAreaInsets(force: Bool = false) {
        guard let webView, let window = webView.window else { return }
        // The bridge view fills the window. Its own safeAreaInsets can also
        // lag at cold launch on iOS 27; read the scene window directly.
        let insets = window.safeAreaInsets
        guard force || lastPublishedInsets != insets else { return }
        lastPublishedInsets = insets
        let script = """
        (() => {
          const root = document.documentElement;
          if (!root) return;
          const insets = { top: \(insets.top), right: \(insets.right), bottom: \(insets.bottom), left: \(insets.left) };
          for (const [edge, value] of Object.entries(insets)) {
            root.style.setProperty(`--safe-area-inset-${edge}`, `${value}px`);
          }
        })();
        """
        webView.evaluateJavaScript(script, completionHandler: nil)
    }

    override func capacitorDidLoad() {
        super.capacitorDidLoad()
        pageLoadObservation = webView?.observe(\.isLoading, options: [.new]) { [weak self] webView, _ in
            if !webView.isLoading {
                self?.publishSafeAreaInsets(force: true)
            }
        }

        bridge?.registerPluginInstance(StoreReviewPlugin())
        bridge?.registerPluginInstance(LinkPreviewPlugin())
        bridge?.registerPluginInstance(MapSharePlugin())
        bridge?.registerPluginInstance(AgeAssurancePlugin())
        bridge?.registerPluginInstance(DateTimePreferencesPlugin())
        bridge?.registerPluginInstance(GooglePlacePhotoPlugin())
        bridge?.registerPluginInstance(NotificationSettingsPlugin())
    }
}
