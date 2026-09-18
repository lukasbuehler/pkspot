import Capacitor

@objc(AppViewController)
class AppViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        super.capacitorDidLoad()

        bridge?.registerPluginInstance(StoreReviewPlugin())
        bridge?.registerPluginInstance(LinkPreviewPlugin())
        bridge?.registerPluginInstance(AgeAssurancePlugin())
        bridge?.registerPluginInstance(DateTimePreferencesPlugin())
        bridge?.registerPluginInstance(GooglePlacePhotoPlugin())
        bridge?.registerPluginInstance(NotificationSettingsPlugin())
    }
}
