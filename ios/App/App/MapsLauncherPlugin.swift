import Capacitor
import UIKit

/// Hands locations to the user's default navigation app where iOS supports it.
@objc(MapsLauncherPlugin)
public class MapsLauncherPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "MapsLauncherPlugin"
    public let jsName = "MapsLauncher"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "open", returnType: CAPPluginReturnPromise)
    ]

    @objc func open(_ call: CAPPluginCall) {
        guard let lat = call.getDouble("lat"), let lng = call.getDouble("lng"),
              lat.isFinite, lng.isFinite,
              (-90...90).contains(lat), (-180...180).contains(lng) else {
            call.reject("Invalid map coordinates.")
            return
        }
        let directions = call.getBool("directions") ?? false
        var link = URLComponents()
        link.scheme = "geo-navigation"
        link.host = ""
        link.path = directions ? "/directions" : "/place"
        link.queryItems = [URLQueryItem(
            name: directions ? "destination" : "coordinate",
            value: "\(lat),\(lng)"
        )]
        guard let url = link.url else {
            call.reject("Could not create map link.")
            return
        }
        DispatchQueue.main.async {
            // Open directly rather than canOpenURL: no scheme-query permission is
            // needed. The web caller uses Apple Maps when no handler is available.
            UIApplication.shared.open(url, options: [:]) { opened in
                if opened { call.resolve() }
                else { call.reject("Default navigation is unavailable.") }
            }
        }
    }
}
