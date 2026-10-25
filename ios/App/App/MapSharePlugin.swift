import Capacitor

@objc(MapSharePlugin)
public class MapSharePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "MapSharePlugin"
    public let jsName = "MapShare"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "pending", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "acknowledge", returnType: CAPPluginReturnPromise)
    ]
    @objc func pending(_ call: CAPPluginCall) {
        do { call.resolve(["links": try SharedMapStore.pending().map { link -> [String: Any] in
            var data: [String: Any] = ["id": link.id, "text": link.text]
            if let point = link.location { data["location"] = ["lat": point.lat, "lng": point.lng] }
            if let name = link.name { data["name"] = name }
            if let spotId = link.spotId { data["spotId"] = spotId }
            if let created = link.createdAt { data["createdAt"] = created }
            return data
        }]) }
        catch { call.reject("Cannot read shared Maps links") }
    }
    @objc func acknowledge(_ call: CAPPluginCall) {
        guard let id = call.getString("id") else { call.reject("Missing share ID"); return }
        do { try SharedMapStore.acknowledge(id); call.resolve() }
        catch { call.reject("Cannot acknowledge shared Maps link") }
    }
}
