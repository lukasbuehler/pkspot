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
            let isEligible = try await service.isEligibleForAgeFeatures
            let requiredFeatures = try await service.requiredRegulatoryFeatures.map { String(describing: $0) }

            guard let viewController = bridge?.viewController else {
                call.resolve([
                    "platform": "ios",
                    "source": "ios_declared_age_range",
                    "available": false,
                    "response": "unavailable",
                    "isEligibleForAgeFeatures": isEligible,
                    "requiredRegulatoryFeatures": requiredFeatures,
                    "errorMessage": "Unable to present Declared Age Range UI"
                ])
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
                    "isEligibleForAgeFeatures": isEligible,
                    "requiredRegulatoryFeatures": requiredFeatures,
                    "ageLower": ageRange.lowerBound as Any,
                    "ageUpper": ageRange.upperBound as Any,
                    "ageRangeDeclaration": ageRange.ageRangeDeclaration.map { String(describing: $0) } as Any,
                    "activeParentalControls": ageRange.activeParentalControls.description
                ])
            case .declinedSharing:
                call.resolve([
                    "platform": "ios",
                    "source": "ios_declared_age_range",
                    "available": true,
                    "response": "declined",
                    "isEligibleForAgeFeatures": isEligible,
                    "requiredRegulatoryFeatures": requiredFeatures
                ])
            @unknown default:
                call.resolve([
                    "platform": "ios",
                    "source": "ios_declared_age_range",
                    "available": false,
                    "response": "unavailable",
                    "isEligibleForAgeFeatures": isEligible,
                    "requiredRegulatoryFeatures": requiredFeatures,
                    "errorMessage": "Unknown Declared Age Range response"
                ])
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
    #endif
}
