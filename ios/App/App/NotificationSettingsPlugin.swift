import Capacitor
import FirebaseMessaging
import UIKit
import UserNotifications

@objc(NotificationSettingsPlugin)
public class NotificationSettingsPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "NotificationSettingsPlugin"
    public let jsName = "NotificationSettings"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "openAppNotificationSettings", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getSystemNotificationStatus", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setAutoInitEnabled", returnType: CAPPluginReturnPromise)
    ]

    @objc func openAppNotificationSettings(_ call: CAPPluginCall) {
        guard let url = URL(string: UIApplication.openSettingsURLString) else {
            call.reject("System settings are unavailable.")
            return
        }

        DispatchQueue.main.async {
            UIApplication.shared.open(url, options: [:]) { opened in
                if opened {
                    call.resolve()
                } else {
                    call.reject("Could not open system settings.")
                }
            }
        }
    }

    @objc func getSystemNotificationStatus(_ call: CAPPluginCall) {
        UNUserNotificationCenter.current().getNotificationSettings { settings in
            let enabled = settings.authorizationStatus == .authorized ||
                settings.authorizationStatus == .provisional ||
                settings.authorizationStatus == .ephemeral
            call.resolve(["enabled": enabled])
        }
    }

    @objc func setAutoInitEnabled(_ call: CAPPluginCall) {
        Messaging.messaging().isAutoInitEnabled = call.getBool("enabled") ?? false
        call.resolve()
    }
}
