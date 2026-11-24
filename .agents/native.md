# Native apps guide (iOS, Android, Capacitor)

Read this when working in `ios/`, `android/`, on Capacitor plugins, or on
routes that the apps open.

## Deep links

- A new first-level route that should open in the Android app needs a matching
  App Link path rule in `android/app/src/main/AndroidManifest.xml`. App Links
  are path-scoped on purpose, so browser-first URLs such as `/qr/*` stay in the
  browser.

## iOS Capacitor plugins

- App-local plugins are not visible to JavaScript just because the Swift file
  is in the target. Register them in `ios/App/App/AppViewController.swift` with
  `bridge?.registerPluginInstance(...)`.
- Do not register plugins in `ios/App/App/capacitor.config.json`; Capacitor
  sync regenerates it.
- If a plugin method seems to do nothing, look for
  `To Native -> PluginName methodName` in the iOS console. If it is missing,
  suspect registration first.
- Add new Swift files to every Xcode project file that still exists
  (`ios/App/App.xcodeproj`, and `ios/App/PK Spot.xcodeproj` if present).
- A Swift Package imported by app-target files must be added to the app
  target's package dependencies and Frameworks phase. A dependency in
  `CapApp-SPM/Package.swift` alone is not importable there.
- `ios/App/CapApp-SPM/Package.swift` belongs to the Capacitor CLI and is
  rewritten by `cap sync`. Avoid durable manual edits.

## Google Places on iOS

- Maps JS photo URLs can return WebP that iOS WebKit cannot decode. Native
  workarounds use the Google Places SDK, return displayable image data and show
  the required Google and photo attribution.
- App Check from the Capacitor plugin does not cover the native Places SDK. If
  Places returns HTTP 403 with a valid key, wire
  `GMSPlacesClient.setAppCheckTokenProvider(...)` and configure debug App Check
  on simulators.
- Native Places calls use the separate `PLACES_API_KEY` in
  `ios/App/App/GoogleService-Info.plist`, restricted to the bundle ID. The
  website-restricted web `API_KEY` does not authorize native SDK calls.

## Mobile data compatibility

Some Capacitor Firestore versions mishandle `GeoPoint`. See the coordinate rule
in [backend.md](backend.md#coordinates).
