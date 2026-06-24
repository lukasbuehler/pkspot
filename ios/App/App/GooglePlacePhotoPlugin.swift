import Capacitor
import Foundation
import GooglePlaces
import UIKit

@objc(GooglePlacePhotoPlugin)
public class GooglePlacePhotoPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "GooglePlacePhotoPlugin"
    public let jsName = "GooglePlacePhoto"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getPhoto", returnType: CAPPluginReturnPromise)
    ]

    @objc func getPhoto(_ call: CAPPluginCall) {
        guard let placeId = call.getString("placeId")?.trimmingCharacters(in: .whitespacesAndNewlines),
              !placeId.isEmpty else {
            call.reject("Missing placeId")
            return
        }

        print("GooglePlacePhotoPlugin getPhoto placeId=\(placeId)")

        let maxWidth = clampedImageSize(call.getInt("maxWidth") ?? 300)
        let maxHeight = clampedImageSize(call.getInt("maxHeight") ?? 200)
        let allowAttributed = call.getBool("allowAttributed") ?? false
        let request = GMSFetchPlaceRequest(
            placeID: placeId,
            placeProperties: [GMSPlaceProperty.photos.rawValue],
            sessionToken: nil
        )

        DispatchQueue.main.async {
            GMSPlacesClient.shared().fetchPlace(with: request) { [weak self] place, error in
                guard let self else { return }

                if let error {
                    call.reject("Failed to fetch Google Place photos", nil, error)
                    return
                }

                guard let photos = place?.photos, !photos.isEmpty else {
                    print("GooglePlacePhotoPlugin no photos placeId=\(placeId)")
                    call.resolve([
                        "imageDataUrl": NSNull(),
                        "attributions": [],
                        "skippedReason": "no_photos"
                    ])
                    return
                }

                guard let photo = photos.first(where: { allowAttributed || self.attributionStrings(for: $0).isEmpty }) else {
                    print("GooglePlacePhotoPlugin requires attribution placeId=\(placeId)")
                    call.resolve([
                        "imageDataUrl": NSNull(),
                        "attributions": [],
                        "skippedReason": "requires_attribution"
                    ])
                    return
                }

                self.loadPhoto(photo, maxWidth: maxWidth, maxHeight: maxHeight, call: call)
            }
        }
    }

    private func loadPhoto(
        _ photo: GMSPlacePhotoMetadata,
        maxWidth: Int,
        maxHeight: Int,
        call: CAPPluginCall
    ) {
        let maxSize = CGSize(width: maxWidth, height: maxHeight)
        let request = GMSFetchPhotoRequest(photoMetadata: photo, maxSize: maxSize)

        GMSPlacesClient.shared().fetchPhoto(with: request) { [weak self] image, error in
            guard let self else { return }

            if let error {
                call.reject("Failed to load Google Place photo", nil, error)
                return
            }

            guard let image,
                  let data = image.jpegData(compressionQuality: 0.86) else {
                call.reject("Failed to encode Google Place photo")
                return
            }

            print("GooglePlacePhotoPlugin loaded JPEG bytes=\(data.count)")

            call.resolve([
                "imageDataUrl": "data:image/jpeg;base64,\(data.base64EncodedString())",
                "attributions": self.attributionStrings(for: photo),
                "skippedReason": NSNull()
            ])
        }
    }

    private func clampedImageSize(_ value: Int) -> Int {
        min(max(value, 1), 1600)
    }

    private func attributionStrings(for photo: GMSPlacePhotoMetadata) -> [String] {
        guard let attributions = photo.attributions else {
            return []
        }

        let text = attributions.string.trimmingCharacters(in: .whitespacesAndNewlines)
        return text.isEmpty ? [] : [text]
    }
}
