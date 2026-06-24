import Capacitor
import Foundation

#if canImport(DeclaredAgeRange)
import DeclaredAgeRange
#endif

@objc(AgeAssurancePlugin)
public class AgeAssurancePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "AgeAssurancePlugin"
    public let jsName = "AgeAssurance"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getAgeSignal", returnType: CAPPluginReturnPromise)
    ]

    @objc func getAgeSignal(_ call: CAPPluginCall) {
        #if canImport(DeclaredAgeRange)
        if #available(iOS 26.0, *) {
            Task {
                await resolveDeclaredAgeRange(call)
            }
            return
        }
        #endif

        call.resolve([
            "platform": "ios",
            "source": "ios_declared_age_range",
            "available": false,
            "response": "unavailable",
            "errorMessage": "Declared Age Range is unavailable on this iOS SDK or OS version"
        ])
    }

    #if canImport(DeclaredAgeRange)
    @available(iOS 26.0, *)
    private func resolveDeclaredAgeRange(_ call: CAPPluginCall) async {
        do {
            let service = AgeRangeService.shared
            let ageFeatureSignal = try await resolveAgeFeatureSignal(service)

            guard let viewController = bridge?.viewController else {
                call.resolve([
                    "platform": "ios",
                    "source": "ios_declared_age_range",
                    "available": false,
                    "response": "unavailable",
                    "errorMessage": "Unable to present Declared Age Range UI"
                ].merging(ageFeatureSignal) { current, _ in current })
                return
            }

            let response = try await service.requestAgeRange(ageGates: 13, 18, nil, in: viewController)
            switch response {
            case .sharing(let ageRange):
                call.resolve([
                    "platform": "ios",
                    "source": "ios_declared_age_range",
                    "available": true,
                    "response": "shared",
                    "ageLower": ageRange.lowerBound as Any,
                    "ageUpper": ageRange.upperBound as Any,
                    "ageRangeDeclaration": ageRange.ageRangeDeclaration.map { String(describing: $0) } as Any,
                    "activeParentalControls": ageRange.activeParentalControls.description
                ].merging(ageFeatureSignal) { current, _ in current })
            case .declinedSharing:
                call.resolve([
                    "platform": "ios",
                    "source": "ios_declared_age_range",
                    "available": true,
                    "response": "declined"
                ].merging(ageFeatureSignal) { current, _ in current })
            @unknown default:
                call.resolve([
                    "platform": "ios",
                    "source": "ios_declared_age_range",
                    "available": false,
                    "response": "unavailable",
                    "errorMessage": "Unknown Declared Age Range response"
                ].merging(ageFeatureSignal) { current, _ in current })
            }
        } catch {
            call.resolve([
                "platform": "ios",
                "source": "ios_declared_age_range",
                "available": false,
                "response": "unavailable",
                "errorMessage": error.localizedDescription
            ])
        }
    }

    @available(iOS 26.0, *)
    private func resolveAgeFeatureSignal(_ service: AgeRangeService) async throws -> [String: Any] {
        var signal: [String: Any] = [:]

        if #available(iOS 26.2, *) {
            signal["isEligibleForAgeFeatures"] = try await service.isEligibleForAgeFeatures
        }

        if #available(iOS 26.4, *) {
            signal["requiredRegulatoryFeatures"] = try await service.requiredRegulatoryFeatures.map { String(describing: $0) }
        }

        return signal
    }
    #endif
}
