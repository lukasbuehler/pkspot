import Capacitor
import StoreKit

@objc(StoreReviewPlugin)
public class StoreReviewPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "StoreReviewPlugin"
    public let jsName = "StoreReview"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "prepare", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "request", returnType: CAPPluginReturnPromise)
    ]

    @objc func prepare(_ call: CAPPluginCall) { call.resolve() }

    @objc func request(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard let controller = self.bridge?.viewController,
                  controller.presentedViewController == nil,
                  let scene = controller.view.window?.windowScene,
                  scene.activationState == .foregroundActive else {
                call.resolve()
                return
            }
            AppStore.requestReview(in: scene)
            call.resolve()
        }
    }
}
