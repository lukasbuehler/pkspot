# Native release readiness

Build, signing and physical-device checks. Restore Credentials remain disabled; their conditional tasks do not block the current release.

Use [the deployment index](../../DEPLOYMENT_TASKS.md) for the shared procedure and maintenance rules. Each task is owned here; do not duplicate it in another checklist.

### Android Maps sharing and mobile cropping

- [ ] Rebuild Android and stress-test vector-map panning and pinch zooming.
      Verify the map and navigation remain responsive, including after
      background/resume. Local fixes isolate rendering-setting changes from
      camera signals and bound tile allocation; the reported full WebView
      freeze still requires reproduction and confirmation on the device.

- [ ] Build and install the updated Android app to register the new text-share target.
      Verify Google Maps sharing from both a stopped and running PK Spot app,
      keyboard clipboard insertion of a short Maps link, and crop controls in
      portrait and landscape with display cutouts. `resolveMapShortLink` is
      deployed and ACTIVE in europe-west1; existing callable payloads are unchanged.
      Local browser tests do not prove Android share-sheet delivery.

### iOS scene lifecycle and Capacitor 8.5.2

- [ ] With the new scene manifest, verify cold launch on an existing supported
      physical iOS device, then background/resume, cold/warm universal
      links, Google sign-in callbacks, notification taps, and native sharing.
      Test cold launch, rotation, folding/unfolding, and keyboard opening on
      iPhone Duo: navigation must follow layout width/height without rotating
      first, and controls must clear safe areas once. Check menu/search alignment,
      the sheet's horizontal safe edges and non-selectable handle, and continuous
      drawer backgrounds under top/side insets. The map fills the viewport except
      for the reserved leading unsafe strip in the short overlay-drawer layout.
      Verify folding keeps the rail and Alain menu mutually exclusive, and map
      mini FABs remain available beside an open half-width drawer.
      Confirm horizontal chip swipes inside the sheet scroll the row without
      moving the sheet, while vertical sheet dragging still works on-device.
      Check Google/OSM credits and the Google logo clear safe edges and rounded
      corners, with the map FABs above the credit rows.
      Recheck nested native links and document reloads with locale prefixes,
      query parameters and fragments after syncing the new mobile entry pages.
      Confirm the requested route opens and no missing index.html error occurs.
      Tap spot cards in the map sheet and confirm selection does not reload the
      WebView. Check the App Check failure dialog with a long error URL stays
      inside safe edges, and the native menu FAB retains its top gap off the map.
      Rebuild/sync native assets before testing (`npm run build:ios:dev`).
      Simulator launch and web SSR checks do not establish device readiness.

### Voluntary native review requests

- With analytics permitted, verify `store_review_request_attempted`,
  `store_review_request_returned`, and `store_review_api_failed` in PostHog on
  the released native build. A returned API call does not prove display or a
  submitted review. Settings links use `outbound_link_clicked` with
  `link_type=app_store_review` or `google_play_review`.

- Before shipping native builds, verify the review flow on iOS development devices
  and a Google Play internal-test installation. TestFlight does not display the
  StoreKit review prompt, and store quotas may suppress production prompts.
- Verify 14 days since first observed native use, three distinct usage days and
  three newly logged activities, then five quiet seconds after returning to the
  successfully loaded activity overview. Editing an entry does not count. No
  prompt during an unfinished session, upload, overlay, backgrounding or interaction.
- Verify that input or navigation cancels the opportunity, including while Play
  prepares its sheet; every request attempt starts a six-calendar-month cooldown.
  History stays on the device and resets when app data is cleared. Settings links
  remain independent. No backend deployment is needed.

### Android release optimisation follow-up

- [ ] The `46ef` work is now integrated locally on `development`: release
      minification/resource shrinking, bounded notification bitmaps, and the
      Android 9 launch fix. Verify a signed release build, retained
      Capacitor/plugin entry points, mapping output, and real-device flows
      before shipping. Account restoration remains disabled separately below.

### Experimental native sharing for 1.2

Android image shares now enter the shared Spot picker and existing moderated
upload dialog. This first slice accepts up to eight photos for one existing Spot,
prepares JPEG derivatives without source EXIF, and retains private native copies
until upload completion or explicit discard. It has no advertised navigation
entry. Video intake, automatic EXIF grouping and new-Spot creation remain deferred.
The original larger prototype stays on `codex/native-media-ingestion`.

iOS Maps shares now resolve supported links with native HTTP, show a MapKit
preview and read-only nearby Typesense results, and save structured App Group
drafts. The map add menu shows a pending-draft count. Review opens a matched
Spot or prefills the normal creation flow. Drafts remain until explicitly removed.
The extension does not launch the containing app or call Firebase; web and Android
short-link resolution remain unchanged.

- [ ] Verify provisioning for the registered `group.com.pkspot.app.media` on
      the app (`com.pkspot.app`) and Maps Share Extension (`com.pkspot.app.mapshare`).
      Refresh profiles and build/install from Xcode. Both project files
      contain the target, embedded extension, shared store and bridge registration.
      Success: Google Maps and Apple Maps offer PK Spot; direct and short links
      show the selected pin (not the camera center), nearby matches and a map
      preview. Saving survives app termination. Opening PK Spot shows the draft
      count without redirecting unexpectedly; review/create/cancel retain the
      draft and explicit removal persists. Also test offline/error recovery and
      links without exact coordinates. Signed device behavior remains unverified.
- [ ] Install the new Android build and verify single/multiple photo sharing from
      Google Photos with PK Spot stopped and running. Check signed-out recovery,
      cancellation, failed preparation, interrupted upload, retry and explicit
      discard. Confirm originals are retained until completion/discard and
      uploaded derivatives contain no GPS/EXIF. Browser tests and compilation do
      not prove URI grants, photo decoding or native share-sheet delivery.
- [ ] Before extending this feature, implement automatic Spot suggestions and
      multi-Spot batches using local photo metadata, never device location. Keep
      precise photo locations/capture times local, use the shared Spot picker,
      and route confirmed new-Spot positions through normal Spot creation.
- [ ] Verify native nearby search and MapKit previews on a signed device using
      `search.pkspot.app`. The extension uses the existing public search-only key
      in its Info.plist; rotate that copy alongside the web/mobile search key.
      A live read-only nearby query returned 200, including object-form translated
      names. Swift tests cover parser accuracy, rejected redirect hosts/loops,
      legacy link-only drafts and both Typesense name shapes. Simulator compilation
      and browser snapshots do not prove the share-sheet or App Group handoff.
- [ ] Design an owner-only contribution list for created and edited Spots,
      separate from unpublished local drafts. Derive it from real submission/edit
      records, preserve existing fields, enforce owner-only reads and avoid
      indexing this personal history in public Typesense collections. Plan a
      compatible backfill for older contributions before presenting it as complete.

### Android quality and Restore Credentials readiness

The August 2026 Android vitals overview had limited data and no aggregate
crash, ANR, memory, start-up, rendering, or battery rate. A subsequent crash
detail identified one Android 9 launch cluster; treat the following as a
release-readiness sequence, not as evidence that the current release exceeds a
Play threshold. Restore Credentials are checkpointed but disabled: the Angular
injection token defaults to false, the manifest does not register the backup
agent, and the Functions entry point does not export restoration endpoints.
The quality fixes can ship independently.

- [ ] Before enabling restoration, implement server-side credential revocation
      for explicit sign-out/account deletion, prevent in-flight restoration or
      provisioning from overriding a later sign-in/sign-out, and revalidate the
      credential counter inside the consuming transaction. Test disabled and
      revoked accounts, concurrent challenges, and device-transfer races.
- [ ] Add and deploy the `restore_credentials.credential_id` collection-group
      index, verify it is ready, and test the actual lookup. Only after these
      checks and the device checks below pass, restore the Function exports,
      deploy them, register the backup agent, and enable the client token.
      Do not enable or deploy restoration as part of the Android quality fix.

- [ ] The Android 9 production crash on Motorola moto e6 play was caused by
      `windowLayoutInDisplayCutoutMode="always"`: value 3 is unsupported below
      Android 11 and AppCompat fails while Capacitor creates its content view.
      Before releasing, cold-launch the signed binary on Android 9 (or an API 28
      emulator) and an Android 15+ device with a simulated display cutout. The
      Android 9 launch must reach the WebView; Android 15+ must remain
      edge-to-edge with safe-area content unobscured. Do not restore the
      unsupported `always` XML value; Android 15 interprets `shortEdges` as
      `always` for this non-floating, target-SDK-36 activity.

- [ ] Deploy the five Restore Credentials Functions before releasing an Android
      client that calls them:

  ```sh
  npm --prefix functions run build
  npx firebase deploy --project prod --only functions:beginRestoreCredentialRegistration,functions:finishRestoreCredentialRegistration,functions:beginRestoreCredentialAuthentication,functions:finishRestoreCredentialAuthentication,functions:cleanupExpiredRestoreCredentialChallenges
  ```

  Success condition: every Function is in `europe-west1`; registration rejects
  requests without both Firebase Auth and App Check; authentication accepts no
  client-supplied origin, has a short-lived one-time challenge and network rate
  limit, validates the WebAuthn signature and counter, and only issues a custom
  token for a still-existing Firebase account.

- [ ] Before that deploy, compare the production Android signing-certificate
      SHA-256 fingerprints in `https://pkspot.app/.well-known/assetlinks.json`
      with the server-owned Android WebAuthn origins in
      `restoreCredentialFunctions.ts`. Include every current production signing
      certificate required for supported releases; never add a debug or local
      certificate to the production origin allow-list.

- [ ] Build a signed release after the missing local mobile environment files
      (`src/environments/environment.android.ts` and its shared
      `environment.android` import) are available in the release environment:

  ```sh
  npm run build:android:prod
  cd android && ./gradlew :app:bundleRelease
  ```

  Inspect the release bundle with Android Studio's APK Analyzer and retain the
  mapping file. Confirm R8 minification, optimization, and resource shrinking
  are enabled, then smoke-test every custom Capacitor plugin, notifications,
  App Check, Google sign-in (including the Custom Tabs fallback), media, maps,
  deep links, and age assurance on the release-signed binary. Increment the
  Android version code only as part of the approved store release.

- [ ] Test Restore Credentials on a Play-services-capable Android 9+ device and
      a second device transfer. A normal first install must remain signed out
      with no sheet or account chooser. A restore key may be provisioned only
      after a user deliberately completes Android sign-in or sign-up; then
      transfer the app with cloud backup and a device-to-device setup. Confirm
      Android's backup callback restores the account without opening the app;
      if setup networking is unavailable, confirm the first foreground launch
      retries silently. Confirm explicit sign-out and account deletion clear
      the local/cloud restore credential and a subsequent transfer does not
      sign the user back in.

- [ ] Preserve the existing notification consent decision. The background
      restore signs Firebase Auth in but intentionally does not re-enable FCM
      auto-initialization or send a registration token before the user opens
      PK Spot. Once opened, verify the existing consent-aware notification
      service restores a previously granted registration. Do not add background
      notification reactivation without a separate product/privacy decision.

- [ ] Watch Play Console for populated P50/P90 RSS, bitmap-memory, DEX, crash,
      ANR, startup, rendering, and battery data after enough release users have
      accumulated. Record the exact affected Android version, percentile,
      device class, and time window before making further memory changes.
      Confirm notification images stay bounded to a 1024 px longest edge; use a
      heap/profile capture to identify any other concrete allocation source
      before changing WebView cache behavior or image rendering.
