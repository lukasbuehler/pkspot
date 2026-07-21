import Capacitor
import Foundation

@objc(DateTimePreferencesPlugin)
public class DateTimePreferencesPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "DateTimePreferencesPlugin"
    public let jsName = "DateTimePreferences"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getPreferences", returnType: CAPPluginReturnPromise)
    ]

    @objc func getPreferences(_ call: CAPPluginCall) {
        let locale = Locale.current
        let timePattern = DateFormatter.dateFormat(
            fromTemplate: "j",
            options: 0,
            locale: locale
        ) ?? "HH"
        call.resolve([
            "locale": locale.identifier.replacingOccurrences(of: "_", with: "-"),
            "hourCycle": timePattern.contains("a") ? "h12" : "h23"
        ])
    }
}
