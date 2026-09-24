import UIKit
import Capacitor
import FirebaseAppCheck
import FirebaseAuth
import FirebaseCore
import GooglePlaces
import UserNotifications

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?
    private let placesAppCheckTokenProvider = GooglePlacesFirebaseAppCheckTokenProvider()

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // Override point for customization after application launch.
        configureFirebase()
        configureGooglePlaces()
        configureNotificationCategories()
        return true
    }

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        // Handle Firebase Auth URL callbacks
        if Auth.auth().canHandle(url) {
            return true
        }
        // Called when the app was launched with a url. Feel free to add additional processing here,
        // but if you want the App API to support tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        // Called when the app was launched with an activity, including Universal Links.
        // Feel free to add additional processing here, but if you want the App API to support
        // tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }

    private func configureGooglePlaces() {
        guard let path = Bundle.main.path(forResource: "GoogleService-Info", ofType: "plist"),
              let config = NSDictionary(contentsOfFile: path),
              let apiKey = googlePlacesApiKey(from: config) else {
            print("Google Places SDK not configured: missing PLACES_API_KEY or API_KEY in GoogleService-Info.plist")
            return
        }

        let accepted = GMSPlacesClient.provideAPIKey(apiKey)
        GMSPlacesClient.setAppCheckTokenProvider(placesAppCheckTokenProvider)
        print("Google Places SDK configured: accepted=\(accepted), version=\(GMSPlacesClient.sdkVersion())")
    }

    private func configureFirebase() {
        guard FirebaseApp.app() == nil else {
            return
        }

        #if DEBUG
        AppCheck.setAppCheckProviderFactory(AppCheckDebugProviderFactory())
        print("Firebase App Check configured with debug provider.")
        #else
        AppCheck.setAppCheckProviderFactory(PKSpotAppCheckProviderFactory())
        print("Firebase App Check configured with production provider.")
        #endif

        FirebaseApp.configure()
    }

    private func configureNotificationCategories() {
        let accept = UNNotificationAction(
            identifier: "accept_follow_request",
            title: NSLocalizedString("Accept", comment: "Accept a follow request"),
            options: [.foreground]
        )
        let decline = UNNotificationAction(
            identifier: "decline_follow_request",
            title: NSLocalizedString("Decline", comment: "Decline a follow request"),
            options: [.destructive, .foreground]
        )
        let followBack = UNNotificationAction(
            identifier: "follow_back",
            title: NSLocalizedString("Follow back", comment: "Follow a new follower back"),
            options: [.foreground]
        )
        let going = UNNotificationAction(
            identifier: "mark_event_going",
            title: NSLocalizedString("I'm going", comment: "Confirm event attendance"),
            options: [.foreground]
        )
        let saveEvent = UNNotificationAction(
            identifier: "save_event_interested",
            title: NSLocalizedString("Save event", comment: "Save a community event"),
            options: [.foreground]
        )

        let categories: Set<UNNotificationCategory> = [
            UNNotificationCategory(
                identifier: "PKSPOT_FOLLOW_REQUEST",
                actions: [accept, decline],
                intentIdentifiers: []
            ),
            UNNotificationCategory(
                identifier: "PKSPOT_NEW_FOLLOWER",
                actions: [followBack],
                intentIdentifiers: []
            ),
            UNNotificationCategory(
                identifier: "PKSPOT_EVENT_REMINDER",
                actions: [going],
                intentIdentifiers: []
            ),
            UNNotificationCategory(
                identifier: "PKSPOT_COMMUNITY_EVENT",
                actions: [saveEvent],
                intentIdentifiers: []
            ),
        ]
        UNUserNotificationCenter.current().setNotificationCategories(categories)
    }

    private func googlePlacesApiKey(from config: NSDictionary) -> String? {
        for key in ["PLACES_API_KEY", "API_KEY"] {
            guard let value = config[key] as? String else {
                continue
            }

            let trimmedValue = value.trimmingCharacters(in: .whitespacesAndNewlines)
            if !trimmedValue.isEmpty {
                return trimmedValue
            }
        }

        return nil
    }
}

private final class PKSpotAppCheckProviderFactory: NSObject, AppCheckProviderFactory {
    func createProvider(with app: FirebaseApp) -> AppCheckProvider? {
        if #available(iOS 14.0, *) {
            return AppAttestProvider(app: app)
        }

        return DeviceCheckProvider(app: app)
    }
}

private final class GooglePlacesFirebaseAppCheckTokenProvider: NSObject, GMSPlacesAppCheckTokenProvider {
    @objc(fetchAppCheckTokenWithCompletion:)
    func fetchAppCheckToken(completion: @escaping GMSAppCheckTokenCompletion) {
        AppCheck.appCheck().token(forcingRefresh: false) { result, error in
            if let error = error {
                print("Google Places App Check token failed: \(error.localizedDescription)")
                completion(nil, error as NSError)
                return
            }

            guard let token = result?.token else {
                let missingTokenError = NSError(
                    domain: "com.pkspot.google-places-app-check",
                    code: 1,
                    userInfo: [NSLocalizedDescriptionKey: "Firebase App Check returned no token."]
                )
                print("Google Places App Check token failed: \(missingTokenError.localizedDescription)")
                completion(nil, missingTokenError)
                return
            }

            completion(token, nil)
        }
    }
}

/// UIKit owns the scene window. Keep app-wide Firebase initialization in
/// AppDelegate and forward scene links through the existing Capacitor/Auth path.
/// This lives with AppDelegate so both maintained Xcode projects compile it.
class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession,
               options connectionOptions: UIScene.ConnectionOptions) {
        guard scene is UIWindowScene else { return }
        // UIKit instantiates Main.storyboard from the scene manifest. Preserve
        // the window accessor used by existing Capacitor plugins.
        (UIApplication.shared.delegate as? AppDelegate)?.window = window
        window?.rootViewController?.loadViewIfNeeded()
        self.scene(scene, openURLContexts: connectionOptions.urlContexts)
        for activity in connectionOptions.userActivities {
            self.scene(scene, continue: activity)
        }
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        guard let delegate = UIApplication.shared.delegate as? AppDelegate else { return }
        for context in URLContexts {
            var options: [UIApplication.OpenURLOptionsKey: Any] = [
                .openInPlace: context.options.openInPlace
            ]
            if let source = context.options.sourceApplication { options[.sourceApplication] = source }
            if let annotation = context.options.annotation { options[.annotation] = annotation }
            _ = delegate.application(UIApplication.shared, open: context.url, options: options)
        }
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        _ = (UIApplication.shared.delegate as? AppDelegate)?.application(
            UIApplication.shared, continue: userActivity, restorationHandler: { _ in })
    }

    func sceneDidDisconnect(_ scene: UIScene) {
        if let delegate = UIApplication.shared.delegate as? AppDelegate, delegate.window === window {
            delegate.window = nil
        }
    }
}
