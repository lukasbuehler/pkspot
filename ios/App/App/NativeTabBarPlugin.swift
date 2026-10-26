import Capacitor
import UIKit

/// Bridges `NativeTabBarController` to the Angular navigation.
///
/// Angular sends the whole tab bar state with `configure` (destinations in
/// order, including the "more" tab when there is an overflow, the overflow
/// destinations, the selection from the current route and visibility). Taps come back as
/// `tabSelected` events; Angular navigates and then sends the new selection.
@objc(NativeTabBarPlugin)
public class NativeTabBarPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "NativeTabBarPlugin"
    public let jsName = "NativeTabBar"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isAvailable", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "configure", returnType: CAPPluginReturnPromise)
    ]

    private var controller: NativeTabBarController? {
        bridge?.viewController?.tabBarController as? NativeTabBarController
    }

    @objc func isAvailable(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            call.resolve(["available": self.controller != nil])
        }
    }

    @objc func configure(_ call: CAPPluginCall) {
        let items = Self.items(call.getArray("items", JSObject.self) ?? [])
        let overflow = Self.items(call.getArray("overflow", JSObject.self) ?? [])
        let selectedId = call.getString("selectedId")
        let hidden = call.getBool("hidden") ?? true
        let tintColor = call.getString("tintColor").flatMap(Self.color(hex:))

        DispatchQueue.main.async {
            guard let controller = self.controller else {
                call.reject("Native tab bar is not available")
                return
            }
            controller.onSelect = { [weak self] id in
                self?.notifyListeners("tabSelected", data: ["id": id])
            }
            controller.apply(.init(
                items: items, overflow: overflow,
                selectedId: selectedId, hidden: hidden, tintColor: tintColor))
            call.resolve()
        }
    }

    private static func items(_ objects: [JSObject]) -> [NativeTabBarController.Item] {
        objects.compactMap { object in
            guard let id = object["id"] as? String, let title = object["title"] as? String else { return nil }
            return NativeTabBarController.Item(
                id: id, title: title,
                symbol: object["symbol"] as? String ?? "circle",
                badge: object["badge"] as? Bool ?? false)
        }
    }

    /// Parses `#rrggbb` (as computed from the web theme's CSS variables).
    private static func color(hex: String) -> UIColor? {
        let value = hex.trimmingCharacters(in: .whitespaces).trimmingCharacters(in: CharacterSet(charactersIn: "#"))
        guard value.count == 6, let rgb = UInt32(value, radix: 16) else { return nil }
        return UIColor(red: CGFloat((rgb >> 16) & 0xff) / 255,
                       green: CGFloat((rgb >> 8) & 0xff) / 255,
                       blue: CGFloat(rgb & 0xff) / 255, alpha: 1)
    }
}
