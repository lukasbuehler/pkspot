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
        // On iPhone this controller is a child of the selected tab's host, and
        // the bar shows the host's item.
        let barOwner = navigationController?.viewControllers.first ?? self
        if barOwner.navigationItem.leftBarButtonItem !== backItem {
            barOwner.navigationItem.leftBarButtonItem = backItem
        }
        backItem.isHidden = !(webView?.canGoBack ?? false)
        var vertical = false
        if #available(iOS 27.1, *) {
            vertical = traitCollection.verticalBarEdge != .unspecified
        }
        if navigationController?.isNavigationBarHidden == vertical {
            navigationController?.setNavigationBarHidden(!vertical, animated: false)
        }
    }

    /// Called when this controller moves to another tab or the native tab bar
    /// changes, so the vertical bar and the published insets follow.
    func navigationChromeDidChange() {
        updateVerticalBar()
        publishSafeAreaInsets()
    }

    override func didMove(toParent parent: UIViewController?) {
        super.didMove(toParent: parent)
        if parent != nil { navigationChromeDidChange() }
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
        var insets = window.safeAreaInsets
        addNativeTabBarOverlap(to: &insets, in: webView)
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

    /// The native tab bar floats over the web view like the web navigation did.
    /// Publishing it as part of the safe area lets the existing CSS (page
    /// padding, map controls, bottom-sheet clearance) clear it. On iPhone Duo
    /// the bar sits in the reserved side column and usually overlaps nothing.
    private func addNativeTabBarOverlap(to insets: inout UIEdgeInsets, in webView: UIView) {
        guard let controller = tabBarController as? NativeTabBarController, !controller.isBarHidden,
              controller.tabBar.window != nil else { return }
        let tabBar = controller.tabBar
        let bounds = webView.bounds
        let overlap = bounds.intersection(tabBar.convert(tabBar.bounds, to: webView))
        guard !overlap.isNull, !overlap.isEmpty else { return }
        if overlap.width >= overlap.height {
            if overlap.midY > bounds.midY {
                insets.bottom = max(insets.bottom, bounds.maxY - overlap.minY)
            } else {
                insets.top = max(insets.top, overlap.maxY - bounds.minY)
            }
        } else if overlap.midX < bounds.midX {
            insets.left = max(insets.left, overlap.maxX - bounds.minX)
        } else {
            insets.right = max(insets.right, bounds.maxX - overlap.minX)
        }
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
        bridge?.registerPluginInstance(NativeTabBarPlugin())
    }
}
