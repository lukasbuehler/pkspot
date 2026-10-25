import Capacitor
import MapKit
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
            // needed. Without a handler for the scheme, open the Maps app itself
            // instead of letting the web caller fall back to maps.apple.com.
            UIApplication.shared.open(url, options: [:]) { opened in
                if opened || Self.openInAppleMaps(lat: lat, lng: lng, directions: directions) {
                    call.resolve()
                } else {
                    call.reject("Default navigation is unavailable.")
                }
            }
        }
    }

    private static func openInAppleMaps(lat: Double, lng: Double, directions: Bool) -> Bool {
        let coordinate = CLLocationCoordinate2D(latitude: lat, longitude: lng)
        let item: MKMapItem
        if #available(iOS 26.0, *) {
            item = MKMapItem(location: CLLocation(latitude: lat, longitude: lng), address: nil)
        } else {
            item = MKMapItem(placemark: MKPlacemark(coordinate: coordinate))
        }
        let options: [String: Any] = directions
            ? [MKLaunchOptionsDirectionsModeKey: MKLaunchOptionsDirectionsModeDefault]
            : [MKLaunchOptionsMapCenterKey: NSValue(mkCoordinate: coordinate)]
        return item.openInMaps(launchOptions: options)
    }
}
