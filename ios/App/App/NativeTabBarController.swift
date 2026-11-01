import UIKit

/// The iPhone root: a real `UITabBarController` around the one Capacitor
/// bridge. iOS places bars owned by it (and by each tab's navigation
/// controller) where the device expects them, including the vertical bar of
/// iPhone Duo.
///
/// Every tab shows the same web view. Selecting a tab moves the bridge view
/// controller into that tab's host, so the web app is never reloaded. The
/// Angular router stays the source of truth: a tap only reports the tab to
/// JavaScript (see `NativeTabBarPlugin`), Angular navigates, and the resulting
/// route selects the tab through `apply(_:)`.
final class NativeTabBarController: UITabBarController, UITabBarControllerDelegate {
    struct Item: Equatable {
        let id: String
        let title: String
        let symbol: String
        let badge: Bool
    }

    /// The web theme's Material 3 colours (primary, on-surface-variant and a
    /// surface container); nil values keep the system default.
    struct Colors: Equatable {
        var selected: UIColor?
        var unselected: UIColor?
        var background: UIColor?
    }

    struct State: Equatable {
        var items: [Item] = []
        var overflow: [Item] = []
        var selectedId: String?
        var hidden = true
        var colors = Colors()
    }

    static let moreId = "more"

    let bridgeController: UIViewController
    /// Reports taps on a destination (including overflow choices) to the web app.
    var onSelect: ((String) -> Void)?
    private(set) var state = State()
    private var hosts: [String: UINavigationController] = [:]

    init(bridgeController: UIViewController) {
        self.bridgeController = bridgeController
        super.init(nibName: nil, bundle: nil)
        delegate = self
        // Until Angular configures it, the bar stays hidden around one host.
        let navigation = makeHost(id: "")
        setViewControllers([navigation], animated: false)
        host(of: navigation).adopt(bridgeController)
        setBarHidden(true)
        // The web app is dark-only. Applying it to the whole controller also
        // reaches the bar where iOS moves it (the iPhone Duo vertical bar),
        // the More sheet and the Duo navigation bar.
        overrideUserInterfaceStyle = .dark
        applyColors()
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError("init(coder:) is not supported") }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        (bridgeController as? AppViewController)?.navigationChromeDidChange()
    }

    func apply(_ newState: State) {
        guard newState != state else { return }
        let itemsChanged = newState.items != state.items
        state = newState

        if itemsChanged {
            rebuildTabs()
        }
        applyColors()
        select(id: newState.selectedId)
        setBarHidden(newState.hidden)
        (bridgeController as? AppViewController)?.navigationChromeDidChange()
    }

    /// Whether the tab bar currently covers part of the bridge.
    var isBarHidden: Bool {
        if #available(iOS 18.0, *) { return isTabBarHidden || tabBar.isHidden }
        return tabBar.isHidden
    }

    private func setBarHidden(_ hidden: Bool) {
        guard isBarHidden != hidden else { return }
        if #available(iOS 18.0, *) {
            setTabBarHidden(hidden, animated: false)
        } else {
            tabBar.isHidden = hidden
        }
        view.setNeedsLayout()
    }

    /// Matches the web navigation: primary for the selected item and
    /// on-surface-variant for the others. From iOS 26 the system draws the bar
    /// as Liquid Glass, so only item colours change there; earlier versions
    /// get the app's dark surface.
    private func applyColors() {
        let colors = state.colors
        let appearance = UITabBarAppearance()
        if #available(iOS 26.0, *) {
            appearance.configureWithDefaultBackground()
        } else {
            appearance.configureWithOpaqueBackground()
            appearance.backgroundColor = colors.background ?? .black
        }
        for layout in [appearance.stackedLayoutAppearance,
                       appearance.inlineLayoutAppearance,
                       appearance.compactInlineLayoutAppearance] {
            if let unselected = colors.unselected {
                layout.normal.iconColor = unselected
                layout.normal.titleTextAttributes = [.foregroundColor: unselected]
            }
            if let selected = colors.selected {
                layout.selected.iconColor = selected
                layout.selected.titleTextAttributes = [.foregroundColor: selected]
            }
        }
        tabBar.standardAppearance = appearance
        tabBar.scrollEdgeAppearance = appearance
        // Tint drives the selection glow and highlights the system draws itself.
        tabBar.tintColor = colors.selected
        tabBar.unselectedItemTintColor = colors.unselected
    }

    // MARK: Tabs

    private func rebuildTabs() {
        var next: [UINavigationController] = []
        var nextHosts: [String: UINavigationController] = [:]
        for item in state.items {
            let navigation = hosts[item.id] ?? makeHost(id: item.id)
            navigation.tabBarItem = tabBarItem(for: item)
            next.append(navigation)
            nextHosts[item.id] = navigation
        }
        if next.isEmpty, let current = selectedViewController as? UINavigationController {
            next = [current]
        }
        hosts = nextHosts
        let bridgeHost = bridgeController.parent as? TabHostViewController
        setViewControllers(next, animated: false)
        // The bridge must never be left in a host that is no longer shown.
        if let bridgeHost, !next.contains(where: { host(of: $0) === bridgeHost }),
           let first = next.first {
            selectedViewController = first
            host(of: first).adopt(bridgeController)
        }
    }

    private func select(id: String?) {
        guard let id, let navigation = hosts[id] else { return }
        let target = host(of: navigation)
        if selectedViewController !== navigation {
            target.adopt(bridgeController)
            selectedViewController = navigation
        } else {
            target.adopt(bridgeController)
        }
    }

    private func tabBarItem(for item: Item) -> UITabBarItem {
        let image = UIImage(systemName: item.symbol) ?? UIImage(systemName: "circle")
        let selectedImage = UIImage(systemName: "\(item.symbol).fill") ?? image
        let tabItem = UITabBarItem(title: item.title, image: image, selectedImage: selectedImage)
        tabItem.accessibilityIdentifier = "native-tab-\(item.id)"
        if item.badge {
            // Green marks live activity, matching the web navigation dot.
            tabItem.badgeValue = ""
            tabItem.badgeColor = .systemGreen
        }
        return tabItem
    }

    private func makeHost(id: String) -> UINavigationController {
        let navigation = UINavigationController(rootViewController: TabHostViewController(tabId: id))
        // Shown only where iOS lays it out vertically; see AppViewController.
        navigation.setNavigationBarHidden(true, animated: false)
        return navigation
    }

    private func host(of navigation: UINavigationController) -> TabHostViewController {
        // swiftlint:disable:next force_cast
        navigation.viewControllers.first as! TabHostViewController
    }

    // MARK: UITabBarControllerDelegate

    func tabBarController(_ tabBarController: UITabBarController,
                          shouldSelect viewController: UIViewController) -> Bool {
        guard let navigation = viewController as? UINavigationController else { return false }
        let id = host(of: navigation).tabId
        if id == Self.moreId {
            presentOverflow(from: navigation)
        } else if !id.isEmpty {
            onSelect?(id)
        }
        // Angular selects the tab once its route has changed.
        return false
    }

    private func presentOverflow(from navigation: UINavigationController) {
        guard presentedViewController == nil, !state.overflow.isEmpty else { return }
        let sheet = UIAlertController(title: nil, message: nil, preferredStyle: .actionSheet)
        sheet.overrideUserInterfaceStyle = .dark
        for item in state.overflow {
            let action = UIAlertAction(title: item.title, style: .default) { [weak self] _ in
                self?.onSelect?(item.id)
            }
            sheet.addAction(action)
        }
        sheet.addAction(UIAlertAction(title: String(localized: "Cancel"), style: .cancel))
        if let popover = sheet.popoverPresentationController {
            popover.sourceView = tabBar
            popover.sourceRect = tabBarItemFrame(for: navigation) ?? tabBar.bounds
        }
        present(sheet, animated: true)
    }

    private func tabBarItemFrame(for navigation: UINavigationController) -> CGRect? {
        guard let index = viewControllers?.firstIndex(of: navigation),
              let count = viewControllers?.count, count > 0 else { return nil }
        let width = tabBar.bounds.width / CGFloat(count)
        return CGRect(x: width * CGFloat(index), y: 0, width: width, height: tabBar.bounds.height)
    }

    // MARK: Appearance follows the web view

    override var childForStatusBarStyle: UIViewController? { selectedViewController }
    override var childForStatusBarHidden: UIViewController? { selectedViewController }
    override var childForHomeIndicatorAutoHidden: UIViewController? { selectedViewController }
}

/// The root of one tab. It shows the shared bridge while its tab is selected.
final class TabHostViewController: UIViewController {
    let tabId: String

    init(tabId: String) {
        self.tabId = tabId
        super.init(nibName: nil, bundle: nil)
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError("init(coder:) is not supported") }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .black
    }

    /// Moves `child` (the bridge) here without reloading its web view.
    func adopt(_ child: UIViewController) {
        guard child.parent !== self else { return }
        if child.parent != nil {
            child.willMove(toParent: nil)
            child.view.removeFromSuperview()
            child.removeFromParent()
        }
        addChild(child)
        child.view.frame = view.bounds
        child.view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        view.addSubview(child.view)
        child.didMove(toParent: self)
        setNeedsStatusBarAppearanceUpdate()
    }

    override var childForStatusBarStyle: UIViewController? { children.first }
    override var childForStatusBarHidden: UIViewController? { children.first }
    override var childForHomeIndicatorAutoHidden: UIViewController? { children.first }
}
