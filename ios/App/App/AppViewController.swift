import Capacitor
import WebKit

@objc(AppViewController)
class AppViewController: CAPBridgeViewController {
    private var pageLoadObservation: NSKeyValueObservation?
    private var canGoBackObservation: NSKeyValueObservation?
    private var lastPublishedInsets: UIEdgeInsets?
    private lazy var backItem = UIBarButtonItem(
        title: String(localized: "Back"),
        image: UIImage(systemName: "chevron.backward"),
        primaryAction: UIAction { [weak self] _ in self?.webView?.goBack() }
    )

    override func viewDidLoad() {
        super.viewDidLoad()
        navigationItem.leftBarButtonItem = backItem
        if #available(iOS 27.1, *) {
            registerForTraitChanges(UITraitCollection.systemTraitsAffectingVerticalBarEdge) {
                (self: Self, _: UITraitCollection) in
                self.updateVerticalBar()
            }
        }
        updateVerticalBar()
    }

    /// Shows the navigation bar only where iOS lays it out vertically (iPhone
    /// Duo). There it sits in the side column the system reserves anyway, so the
    /// web layout is unchanged; on every other device it stays hidden. Back
    /// walks the web view's history, which includes Angular route changes.
    private func updateVerticalBar() {
        backItem.isHidden = !(webView?.canGoBack ?? false)
        var vertical = false
        if #available(iOS 27.1, *) {
            vertical = traitCollection.verticalBarEdge != .unspecified
        }
        if navigationController?.isNavigationBarHidden == vertical {
            navigationController?.setNavigationBarHidden(!vertical, animated: false)
        }
    }

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
        canGoBackObservation = webView?.observe(\.canGoBack, options: [.new]) { [weak self] _, _ in
            self?.updateVerticalBar()
        }

        bridge?.registerPluginInstance(StoreReviewPlugin())
        bridge?.registerPluginInstance(LinkPreviewPlugin())
        bridge?.registerPluginInstance(MapSharePlugin())
        bridge?.registerPluginInstance(AgeAssurancePlugin())
        bridge?.registerPluginInstance(DateTimePreferencesPlugin())
        bridge?.registerPluginInstance(GooglePlacePhotoPlugin())
        bridge?.registerPluginInstance(NotificationSettingsPlugin())
        bridge?.registerPluginInstance(MapsLauncherPlugin())
    }
}
