import Capacitor

@objc(AppViewController)
class AppViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        super.capacitorDidLoad()

        bridge?.registerPluginInstance(AgeAssurancePlugin())
        bridge?.registerPluginInstance(GooglePlacePhotoPlugin())
    }
}
