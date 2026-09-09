import Capacitor
import Foundation
import CryptoKit
import DeviceCheck

#if canImport(DeclaredAgeRange)
import DeclaredAgeRange
#endif

@objc(AgeAssurancePlugin)
public class AgeAssurancePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "AgeAssurancePlugin"
    public let jsName = "AgeAssurance"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getAgeSignal", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getAppleAttestKey", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getBoundAppleAgeSignal", returnType: CAPPluginReturnPromise)
    ]

    private var boundRequestRunning = false

    @objc func getAgeSignal(_ call: CAPPluginCall) {
        Task { @MainActor in call.resolve(await readAgeSignal()) }
    }

    private func keyStorageName(_ uid: String) -> String {
        let digest = SHA256.hash(data: Data(uid.utf8)).map { String(format: "%02x", $0) }.joined()
        return "pkspot.appleAge.key.\(digest)"
    }

    @objc func getAppleAttestKey(_ call: CAPPluginCall) {
        Task { @MainActor in
            guard let uid = call.getString("uid"), !uid.isEmpty,
                  DCAppAttestService.shared.isSupported else {
                call.reject("App Attest is unavailable", "APPLE_ATTEST_UNAVAILABLE")
                return
            }
            do {
                let storage = keyStorageName(uid)
                let key = UserDefaults.standard.string(forKey: storage) ?? ""
                if !key.isEmpty { call.resolve(["keyId": key]); return }
                let generated = try await DCAppAttestService.shared.generateKey()
                UserDefaults.standard.set(generated, forKey: storage)
                call.resolve(["keyId": generated])
            } catch { call.reject("Could not prepare Apple verification", "APPLE_ATTEST_KEY_FAILED") }
        }
    }

    @objc func getBoundAppleAgeSignal(_ call: CAPPluginCall) {
        Task { @MainActor in
            guard !boundRequestRunning, let uid = call.getString("uid"),
                  let challengeId = call.getString("challengeId"),
                  let nonce = call.getString("challengeNonce"),
                  let key = UserDefaults.standard.string(forKey: keyStorageName(uid)),
                  DCAppAttestService.shared.isSupported else {
                call.reject("Apple verification is unavailable or already running", "APPLE_ATTEST_UNAVAILABLE")
                return
            }
            boundRequestRunning = true
            defer { boundRequestRunning = false }
            let registered = call.getBool("keyRegistered") ?? false
            do {
                // Never sign age values provided by JavaScript: obtain them here.
                let signal = await readAgeSignal()
                let body: [String: Any] = ["purpose": "pkspot.apple-age.v1", "uid": uid,
                    "challengeId": challengeId, "nonce": nonce, "signal": signal]
                let payload = try JSONSerialization.data(withJSONObject: body, options: [.sortedKeys])
                let digest = Data(SHA256.hash(data: payload))
                let proof: Data
                if registered {
                    proof = try await DCAppAttestService.shared.generateAssertion(key, clientDataHash: digest)
                } else {
                    proof = try await DCAppAttestService.shared.attestKey(key, clientDataHash: digest)
                }
                call.resolve(["signal": signal, "keyId": key,
                    "payload": String(decoding: payload, as: UTF8.self), "proof": proof.base64EncodedString()])
            } catch {
                // An attestation can only be requested once per key. A failed first
                // registration retries with a fresh key; existing asserted keys persist.
                if !registered { UserDefaults.standard.removeObject(forKey: keyStorageName(uid)) }
                call.reject("Apple verification could not be signed", "APPLE_ATTEST_PROOF_FAILED")
            }
        }
    }

    @MainActor
    private func readAgeSignal() async -> [String: Any] {
        #if canImport(DeclaredAgeRange)
        if #available(iOS 26.0, *) { return await readDeclaredAgeRange() }
        #endif
        return ["platform": "ios", "source": "ios_declared_age_range", "available": false, "response": "unavailable"]
    }

    #if canImport(DeclaredAgeRange)
    @MainActor
    @available(iOS 26.0, *)
    private func readDeclaredAgeRange() async -> [String: Any] {
        let base: [String: Any] = ["platform": "ios", "source": "ios_declared_age_range"]
        do {
            let service = AgeRangeService.shared
            let features = try await resolveAgeFeatureSignal(service)
            guard let viewController = bridge?.viewController else {
                return base.merging(["available": false, "response": "unavailable"]) { _, new in new }
            }
            let response = try await service.requestAgeRange(ageGates: 13, 18, nil, in: viewController)
            var result = base.merging(features) { _, new in new }
            switch response {
            case .sharing(let range):
                result["available"] = true
                result["response"] = "shared"
                if let lower = range.lowerBound { result["ageLower"] = lower }
                if let upper = range.upperBound { result["ageUpper"] = upper }
                if let declaration = range.ageRangeDeclaration { result["ageRangeDeclaration"] = String(describing: declaration) }
            case .declinedSharing:
                result["available"] = true
                result["response"] = "declined"
            @unknown default:
                result["available"] = false
                result["response"] = "unavailable"
            }
            return result
        } catch {
            return base.merging(["available": false, "response": "unavailable"]) { _, new in new }
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
