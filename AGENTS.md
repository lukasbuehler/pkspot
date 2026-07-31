# Agent Instructions (Repository Root)

These instructions apply to all work in this repository.

## Angular standards

- This repository uses Angular 22. For Angular-specific work, prefer the official `angular-developer` Codex skill when available and check the installed Angular version before applying version-sensitive guidance.
- Write clean, readable, and well-documented code.
- Do not create separate Markdown documentation files for code changes. Keep durable explanations in code comments when needed, and use chat for temporary explanation.
- Use strict TypeScript settings and prefer type inference when the type is obvious.
- Avoid `any`; use `unknown` when the type is uncertain.
- Use the Angular CLI for scaffolding components, services, directives, pipes, and routes when it fits the task, then adapt the generated code to the repository's conventions.
- Always use standalone Angular components rather than NgModules.
- Do not set `standalone: true` inside Angular decorators. It is the default.
- Use signals for local state and `computed()` for derived state.
- Angular 22 uses zoneless change detection by default. Do not add ZoneJS or
  `provideZoneChangeDetection()` without a documented compatibility reason.
- Async callbacks that update rendered state must write to a template-read
  signal, emit through an Angular output/listener, use `AsyncPipe`, or call
  `ChangeDetectorRef.markForCheck()` explicitly.
- Do not use `NgZone.onStable`, `onUnstable`, or `onMicrotaskEmpty`; use render
  hooks such as `afterNextRender()` or direct browser observers instead.
- Expose writable service state as readonly signals with `.asReadonly()` unless callers intentionally need to write to it.
- Do not use `mutate` on signals; use `update` or `set` instead.
- Do not use `effect()` to propagate state from one signal into another. Use `computed()` for purely derived state and `linkedSignal()` when derived state also needs user overrides.
- Use `resource()` / `httpResource()` for signal-driven async loading when it fits the data flow, and pass the provided abort signal to cancellable fetches.
- Implement lazy loading for feature routes where appropriate.
- Do not use `@HostBinding` or `@HostListener`; put host bindings in the `host` object of the `@Component` or `@Directive` decorator instead.
- Use `NgOptimizedImage` for static images when compatible.
  `NgOptimizedImage` does not work for inline base64 images.
- Keep components focused on a single responsibility.
- Before building entity search, autocomplete, or picker UI, inspect and reuse the shared picker components (for example `app-search-field`, `app-spot-picker`, and `app-entity-reference-autocomplete`). If the required behavior cannot be expressed by an existing component, extend it or extract a reusable focused component instead of implementing an inline one-off picker.
- Use `input()` and `output()` instead of decorator-based inputs and outputs.
- Set `changeDetection: ChangeDetectionStrategy.OnPush` in component decorators.
- Create a separate `.html` template file for every new component, including
  small components. Keep component TypeScript focused on state and behavior.
- Prefer signal forms for new isolated forms on Angular 21+ when the surrounding feature can support them. For existing form-heavy features, keep using typed reactive forms unless a broader migration is intentional.
- Avoid template-driven forms for complex flows.
- Do not use `ngClass`; use `class` bindings instead.
- Do not use `ngStyle`; use `style` bindings instead.
- Keep templates simple and avoid complex logic. Do not call expensive methods from templates; move filtering, sorting, grouping, formatting, or allocation-heavy work into `computed()` signals, memoized helpers, or pure pipes.
- Template method calls are acceptable only for cheap event handlers, stable `track` functions, or trivial reads. If a method allocates arrays/objects, filters data, searches collections, reads layout, or touches services, do not call it from interpolation or bindings.
- Prefer modern Angular template control flow (`@if`, `@for`, `@switch`) instead of structural directives (`*ngIf`, `*ngFor`, `*ngSwitch`) unless explicitly required by framework/tooling constraints.
- Always use a stable identity in `@for` `track` expressions when the list can be reordered, inserted into, or removed from. Use `$index` only for truly static lists.
- Use the async pipe to handle observables in templates.
- Design services around a single responsibility.
- Use `providedIn: 'root'` for singleton services.
- Use `inject()` instead of constructor injection where practical.

If you hit the Codex sandbox error "Abort trap: 6", you need to run it outside the sandbox in the terminal.

## Translation workflow

- The project uses Angular XLIFF 2.0 files in `src/locale`. `src/locale/messages.xlf` is the English source file; translated files are `messages.<locale>.xlf`.
- To refresh translation keys, run `npm run ng -- extract-i18n` from the repository root. This invokes the Angular `extract-i18n` target, which uses `ng-extract-i18n-merge` from `angular.json` to update `messages.xlf`, merge new keys into each configured locale, update changed source text, and remove stale IDs.
- If extraction fails with a sandbox/toolchain trap while Angular is building, rerun the same command outside the sandbox. This is the same class of issue as the `"Abort trap: 6"` note above.
- After extracting, edit the XLIFF locale files directly. The XLIFF files are the source of truth for translations; do not maintain a second translation dictionary in scripts.
- Then run `node scripts/translation_analyzer.js` to find untranslated targets and accidental translations of the product term `Spot`. The analyzer currently checks `de`, `es`, `fr`, `it`, and `nl`; if a new locale should be audited, update the script's `files` list.
- When translating manually, preserve all XLIFF placeholder tags exactly (`<ph .../>`, `<pc ...>...</pc>`) and translate only the human-readable text around them. Do not translate the product term `Spot`; keep it as `Spot` in every language.
- When adding a new app language, update all of these together: `angular.json` `i18n.locales`, the `extract-i18n` `targetFiles` list, `scripts/translation_analyzer.js` `files` list and `INCORRECT_SPOT_TRANSLATIONS`, and any language picker/UI locale list in the app.
- Before considering translation work complete, verify that the XLIFF parses, run `git diff --check`, run `node scripts/translation_analyzer.js`, and run `npm run test:build` so Angular localization and SSR smoke coverage both pass. If `npm run test:build` hits the sandbox trap, rerun it outside the sandbox and report that detail.

## Dependency updates

- Avoid broad dependency updates unless the user explicitly asks for them. Prefer targeted updates with a small, reviewable `package.json` and `package-lock.json` diff.
- For routine non-urgent npm updates, wait 24-72 hours before adopting newly published package versions. This gives the ecosystem time to catch compromised or mistakenly published releases. Treat urgent security fixes case-by-case instead of waiting automatically.
- Do not run `npm audit fix --force` unless the semver-major changes and replacement versions have been reviewed.
- Prefer install commands that avoid lifecycle scripts in CI or inspection contexts, such as `npm ci --ignore-scripts`, then run only the explicit build/test commands needed for verification.

## Deep links

- When adding a new first-level app route that should open in the Android app, update `android/app/src/main/AndroidManifest.xml` with the matching App Link path rule. Android App Links are intentionally path-scoped so reserved browser-first URLs such as `/qr/*` are not claimed by the app.

## iOS and Capacitor

- App-local iOS Capacitor plugins are not available to JavaScript just because the Swift file is in the Xcode target. Register them from `ios/App/App/AppViewController.swift` with `bridge?.registerPluginInstance(...)` so Capacitor exports the plugin header before the web app loads.
- Do not rely on `ios/App/App/capacitor.config.json` for manual plugin registration. It is generated by Capacitor sync and can be overwritten. Put durable manual registration in Swift instead.
- When adding Swift files for app-local plugins or bridge code, add them to both `ios/App/App.xcodeproj` and `ios/App/PK Spot.xcodeproj` if both project files are still present. Builds may use either project.
- If a native plugin method appears to do nothing from Angular, check the iOS console for `To Native -> PluginName methodName`. If that line is missing, suspect missing Capacitor registration before debugging the plugin implementation.
- When adding a Swift Package that app target Swift files import directly, add the package product to the app target's package dependencies and Frameworks phase. A dependency inside `CapApp-SPM/Package.swift` does not automatically make the module importable from `AppDelegate.swift` or other app target Swift files.
- `ios/App/CapApp-SPM/Package.swift` is managed by Capacitor CLI commands. Avoid manual durable changes there unless there is no better option, and expect `cap sync` to rewrite it.
- Google Places photo URLs from Maps JS may produce WebP payloads that fail to decode in iOS WebKit. Native iOS image workarounds should use the Google Places SDK and return displayable image data, then show required Google/photo attribution before release.
- Firebase App Check initialization from the Capacitor plugin does not automatically attach App Check tokens to the native Google Places SDK. If Google Places iOS calls return HTTP 403 while the API key itself is accepted, check that `GMSPlacesClient.setAppCheckTokenProvider(...)` is wired and that simulator/debug App Check is configured when testing locally.
- Native iOS Google Places SDK calls should use a separate `PLACES_API_KEY` in `ios/App/App/GoogleService-Info.plist`, restricted to the iOS bundle ID. The Firebase/web `API_KEY` may be website-restricted for Capacitor webview and Maps JS requests, which does not authorize native SDK requests.

## Firebase region preference

- Prefer deploying new Firebase Cloud Functions in `europe-west1`.
- The Angular app initializes callable functions against `europe-west1`, and `functions/src/index.ts` sets global v2 function options to that region.
- If you add or modify a function that does not inherit those global options, set the region explicitly instead of relying on Firebase's `us-central1` default.
- Existing `us-central1` functions should only stay there intentionally. When migrating an existing function to `europe-west1`, remember that Firebase treats regional functions as separate resources, so the old `us-central1` function may need to be deleted after the Europe deployment is verified.
- Prefer gen 2 Cloud Functions APIs (`firebase-functions/v2/*`). The only current exception is basic Firebase Auth lifecycle triggers that the SDK does not offer in gen 2; keep any such exception isolated and covered by the functions generation policy test.

## Deployment and App Hosting

- Do not create, start, promote, or otherwise operate Firebase App Hosting rollouts. The user deploys the web app by updating the `main` branch, which automatically rolls the update out to App Hosting.
- Do not push or merge changes to `main` unless the user explicitly asks for that release. Local testing and backend-compatible development can remain on the current development branch while production clients and the production web app stay on their previous version.
- Treat a request to deploy Firebase rules, functions, extensions, or other backend resources as separate from an App Hosting release. It never implies permission to update `main` or operate App Hosting.
- Treat `DEPLOYMENT_TASKS.md` as the maintainer-facing source of truth for pre-deployment, deployment, and post-deployment work. Review it before release-related work and surface any applicable unchecked items in the handoff.
- When a change requires release coordination—such as updating Firestore indexes or Typesense schemas, deploying functions or rules, running a migration or backfill, regenerating a sitemap, cleaning up old resources, or completing an external-service check—update `DEPLOYMENT_TASKS.md` in the same change. Add release-specific pending actions with the required order, exact commands or targets where practical, success checks, and any condition for retaining or removing compatibility behavior.
- Keep the reusable release procedure in `DEPLOYMENT_TASKS.md` aligned with the repository's actual scripts and infrastructure. Put one-off work under `Release-specific pending actions`, not in the reusable procedure.
- Never mark a deployment-note item complete unless the action was actually performed and its result verified. A checklist entry documents pending work; it does not grant permission to deploy, mutate production data, or operate App Hosting.
- Once a deployment action and its success condition are performed and verified, remove that item from `DEPLOYMENT_TASKS.md`; remove the entire section when it has no pending work. Git history is the completion record. If only part of an item is complete, rewrite it to describe only the remaining action and success condition.

## Backwards compatibility

- Treat Firestore, Typesense, and Cloud Function payload changes as app-versioned contracts. Mobile apps and older web builds may keep reading existing fields after a deploy, so prefer additive fields and keep legacy fields populated until all supported clients have migrated.
- When adding, renaming, or indexing Firestore fields that should be available in Typesense, update the real `typesense/*.json` schema and the matching `src/db/schemas/typesense-alignment.spec.ts` contract together. Do not update only the alignment test.
- When replacing a UI data shape, map new data back into the previous fields or provide client fallbacks so older app versions degrade gracefully instead of showing empty states.
- Coordinate fields are a mobile compatibility contract. Because some Capacitor Firestore versions have trouble serializing/deserializing `GeoPoint`, client-writeable location data should always include a raw plain-object field such as `location_raw: { lat, lng }` and bounds should include mobile-safe raw forms where available. Browser code may also write the matching `GeoPoint` field, but native/mobile-safe code must not rely on GeoPoint serialization. Cloud Functions should normalize/backfill either shape into both the raw field and GeoPoint field when possible. Derived helper fields such as `bounds_center` and `bounds_radius_m` stay server-owned. Readers should keep fallbacks for both shapes.

## Theme colors

- Use Material 3 system tokens (`var(--mat-sys-primary)`, `var(--mat-sys-secondary)`, etc.) — never hardcoded hex unless used as a fallback.
- Style colored information and status cards as tonal cards: use the matching Material 3 container/on-container colors with a one-pixel role-color outline, an 18px radius, and a separate 40px tonal icon tile with a 13px radius. Keep this structure consistent across primary information, warnings, errors, and other semantic color roles.
- **Green (`--mat-sys-secondary`) is reserved for live / "happening now" things**: active check-ins, live events, the active nav-rail item, "ongoing" status badges, anything indicating a real-time presence.
- **Blue (`--mat-sys-primary`) is the highlight color**: spot pins, primary CTAs ("Sign in", "Add Spot"), important buttons, active selections, links inside body copy.
- **Red (`--mat-sys-error`) is reserved for destructive / past / error states**: past-event banners, validation errors, delete confirmations.
- Tertiary, surface variants, and outline tokens are general-purpose and can be used freely for UI structure.
- Do not use the green accent for static decoration — overuse breaks the "this is happening live" signal.

## Icon workflow

- When introducing a new Material Symbols icon name in templates or code:
  - Ensure the icon name exists in `/Users/lukas/development/personal/pkspot/src/assets/fonts/icons_list.txt`.
  - If missing, add it to `icons_list.txt` (one icon name per line).
  - Run `npm run icons:optimize` from repo root after updating the list.
- The default Material Symbols font is the filled rounded subset from `icons_list.txt`.
- Empty/outlined icons use a second tiny rounded-outline subset:
  - Add only the needed base/alias names to `src/assets/fonts/icons_outline_list.txt` (for example `star`, `star_border`, `mobile`, `mobile_border`).
  - Add an alias in `scripts/optimize_icons.py` when the icon name is not a real Google glyph name (for example `mobile_border` maps to `mobile`).
  - In the template/CSS, select the outline font with `material-symbols-rounded-outline` or `font-family: "Material Symbols Rounded Outlined"`. Adding a name to `icons_outline_list.txt` only makes the glyph available; it does not automatically switch a `<mat-icon>` away from the default filled font.
  - Run `npm run icons:optimize` after changing either icon list.

## Testing

- Before considering work complete, both the relevant tests and the build/SSR smoke test must pass. Do not report a change as done if `npm run test:unit` passes but `npm run test:build` is failing; either fix the build or clearly call out the blocker.
- When adding a new user-facing app route or first-level page, add or update route-level visual coverage in `e2e/visual/routes.visual.spec.ts`. Include stable fixture data for dynamic pages and cover authenticated route states with the screenshot auth fixture instead of relying on live Firebase data.
- For Firestore write-path changes, especially event editing or payload serialization, add or run an emulator integration test that performs the real client write through the app service and adapter. Do not rely only on mocked adapter tests or Firestore rules tests for changes involving `Timestamp`, `GeoPoint`, `deleteField()`, nested arrays/objects, or client/server-owned fields.
- Use `npm run test:unit` for the Vitest unit suite.
- Keep Angular component tests zoneless via the shared Analog TestBed setup so
  tests exercise the same notification model as production.
- Use `npm run test:build` for the build and SSR smoke test. This verifies `npm run build`, copied proxy server files, generated `dist/pkspot/server/build-info.mjs`, localized build output, and that SSR serves real HTML without falling back to client-side rendering.
- Use `npm run test:all` for the main local verification pass before shipping changes. It runs the unit suite and the build/SSR smoke test.
- End-to-end browser coverage remains available via `npm run test:e2e` when needed.
