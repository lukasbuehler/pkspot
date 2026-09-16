# Deployment tasks

This maintainer document is the source of truth for work immediately before,
during, and after a production release. Deploying `main` updates App Hosting, but
does not automatically deploy Firebase backend resources, update search schemas,
run data migrations, or complete third-party service tasks.

## Release procedure

### Pre-deployment

1. Review the release-specific actions below and determine the required
   deployment order. Do not assume the web app should be deployed first.
2. Run the main verification suite:

   ```sh
   npm run test:all
   ```

   If Cloud Functions changed, also run:

   ```sh
   npm --prefix functions run build
   ```

   Before merging the release PR, wait for configured automated reviewers to
   finish and inspect all unresolved review threads. GitHub's mergeable state
   and successful required checks do not prove that asynchronous reviews have
   completed.

3. If `firestore.indexes.json` changed, deploy the production indexes before
   code that depends on them, then wait for every new index to report `Enabled`
   in the Firebase Console:

   ```sh
   npx firebase deploy --project prod --only firestore:indexes
   ```

4. If a Typesense-indexed field or collection schema changed:
   - Update the corresponding `typesense/*.json` source-of-truth schema and
     `src/db/schemas/typesense-alignment.spec.ts`.
   - Run the Typesense contract tests:

     ```sh
     npm run test:unit -- src/db/schemas/typesense-alignment.spec.ts
     ```

   - Apply the schema change to the matching production Typesense collection
     before releasing code that writes, filters, sorts, or queries the new field.
   - Verify the production collection schema contains the expected field and
     type. Add any required document backfill to the post-deployment actions.
5. Deploy compatible Firebase Functions or rules before the web app when the new
   client depends on them. Preserve support for already-released web and mobile
   clients.
6. For a data migration or backfill, confirm its production trigger, payload,
   completion signal, retry behavior, and rollback or recovery plan before
   deploying dependent code.

### Deployment

1. Release the web app by updating `main`; App Hosting deploys it automatically.
   Do not manually create or operate an App Hosting rollout.
2. Deploy Functions, rules, extensions, indexes, and other backend resources
   separately, only when explicitly authorized and in the order documented for
   the release.
3. Do not proceed to dependent steps until each required deployment reports
   success.

### Post-deployment

1. Verify the production app and representative changed routes.
2. Check App Hosting and Cloud Functions logs for new errors.
3. Complete every applicable release-specific action below, including search
   backfills, sitemap regeneration, migrations, cleanup, and external-service
   checks.
4. Verify completion using the success condition recorded for each action.
5. Monitor affected product metrics and error reports for an appropriate period.

## Release-specific pending actions

### Spot and Event localization

- Deploy Firestore rules before releasing the client: `place_names/{key}` permits
  public single-document reads only. `place_name_sources` and `place_name_jobs`
  remain covered by default-deny rules. They are never exposed in SSR payloads.
- With explicit backend deployment authorization, deploy `queueSpotPlaceNames`,
  `queueEventPlaceNames`, `enrichEntityPlaceNames`, `publishEntityPlaceNames`,
  `backfillEntityPlaceNames` in `europe-west1`. Set `GEONAMES_USERNAME=pkspot`. Each hourly worker handles at
  most 20 jobs (at most 80 provider requests); the two workers share cached town results.
- After authorization, call `backfillEntityPlaceNames` as an App Check-verified
  admin, first with `{collection: "spots"}`, then `{collection: "events"}`.
  Repeat each collection with `{collection, startAfter: nextCursor}` until null.
  Private, restricted and community Event sources are skipped. Verify that a
  town without a community page receives names and that source coordinates are
  absent from public `place_names` records. Ambiguous names stay unlocalized.
- Complete Spot preview localization separately: loaded Spot models now render
  their locality labels using cached translations, but plain map/search preview
  records still contain the original locality strings. Materialize the narrow
  translated labels into those previews without adding per-card cache reads.
  Preserve reverse-geocoded address fields and formatted street addresses.
- Verify a French/Italian Spot and Event after the web release: translated titles,
  visible summaries, metadata, unchanged names/slugs, source-language labels,
  Event timezone and cancellation/past state. Confirm restricted pages retain
  their existing noindex behavior. New lookups are read-only Firestore requests;
  SSR never calls GeoNames. Existing plain fields remain unchanged for old apps.
- Posts remain out of scope until their separate refactor. No Post publishing,
  authoring, routing or schema changes are included in this release work.

### Community place names and SSR localization

- For the remaining communities, after explicit backfill authorization, invoke the admin/App-Check
  callable `backfillCommunityPlaceLocalizations` with `{}` and repeat with
  `{startAfter: nextCursor}` until `nextCursor` is null. This queues batches of 50
  documents; the deployed worker handles at most 20 jobs/hour and at most four GeoNames
  requests per job (town search/details, hierarchy, region details). Region details
  are cached by provider ID across towns. Rebuilds automatically enqueue version-1
  town records for regional enrichment; existing version-2 records are retained. Review `needs-review` matches instead of guessing.
  Verify localized names, stable slugs,
  preserved overrides and GeoNames attribution on actual pages before claiming
  the migration complete. Country names need no enrichment. To retry a reviewed
  failed match, correct its geography or remove its queue document and rerun the
  backfill. Keep curated `place_name_overrides` / `place_phrase_overrides` separate
  from provider data; these are server-owned and never overwritten by enrichment.
- Keep legacy English `title`, `description`, `displayName` and geography fields
  for released clients. New SSR/browser presentation derives localized text
  without external lookups. Future name locales are data only, not enabled app
  languages. After the web release, verify French, Italian, German, Spanish and
  Dutch metadata and canonical/hreflang tags. The visible community h1 should
  contain only the localized place name, and browser navigation must retain the
  community-specific tab title instead of resetting it to the generic map title.
- After the client release, verify viewport community cards, markers and search
  previews use localized country names and stored `place_localization.names` /
  `place_name_overrides`, plus `place_localization.region.names` in regional
  subtitles. These are stored Typesense fields requested
  for display, with no new index or per-card Firestore lookup. Unenriched towns
  retain their original names until the remaining community backfill completes.

### v1.2 analytics coverage and crawler verification

- After the web release, inspect community JSON-LD: breadcrumb trails have a
  localized name, and Spot directory entries contain no `aggregateRating`.
  Confirm eligible individual Spot pages still contain their ratings. Reinspect
  affected community URLs in Search Console after recrawling; report labels and
  review-snippet attribution may take time to update.

- After client release, verify PostHog `feature_action_started`,
  `feature_action_succeeded`, `feature_action_failed`, `operation_failed`, and
  exception records on web/iOS/Android with analytics permitted. Filter by
  `feature`, `action`, and `client_version`. Exercise activity logging, check-ins,
  recovery pauses, following, My Events, age-provider operations, and upload vs
  processing completion separately. Confirm denied reads/writes, callable errors,
  listener failures, handled screen errors and unhandled browser rejections are
  visible. New properties must contain no IDs, payloads, photo coordinates,
  notes, age results, tokens, or raw error text. Backend-only scheduled/trigger
  failures remain in Cloud Logging; this is client instrumentation.
- Deploy `generateSitemapOnSchedule` and `generateSitemapManual`, then use the
  existing sitemap regeneration procedure below. Download the live XML and check
  `image:image` entries, public-only events, canonical host, valid XML and the
  50 MB uncompressed sitemap limit. No functions have been deployed for this change.
- After the web release, use Search Console URL Inspection for an event and a
  photo-bearing Spot (for example `/en/events/swissjam26` and
  `/en/map/spots/0184hQEj1uHQvLugm7J3`). Inspect rendered HTML, selected canonical,
  indexing exclusion reason and image access; submit the regenerated sitemap and
  request reindexing as appropriate. Verify missing events return 404, temporary
  failures return 503, and Spot images have alt text. Anonymous HTTP checks on
  2026-09-10 confirmed real event/Spot HTML, Event/Place JSON-LD, a public photo
  returning HTTP 200, and no legacy canonical host in the sitemap. These checks
  do not establish Google's actual indexing decision.


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

### September 2026 dependency security hotfix

- Preserve Angular build-tool compatibility when updating security overrides:
  the builder pins Vite 8.1.5. Forcing Vite 7 ignores SSR prebundle defines and
  crashes `ng serve` in event replay. Refresh local dependencies with
  `npm ci --ignore-scripts` and restart development servers after this update.

- Release the reviewed main-based hotfix through the normal main/App Hosting
  workflow. Verify the localized web app renders real SSR HTML and key map,
  Event, authentication, and navigation flows still work. Angular framework,
  SSR and build tooling are aligned to 22.1.4. Do not include unfinished 1.2
  features in this release. PR-open workflow triggers remain unchanged.
- Verify an authorized production image upload completes moderation and
  derivative generation on the updated Sharp 0.35.4 Functions. Local image and
  emulator checks passed; deployed revisions and their source lockfiles were
  verified, but no new production test image was uploaded. Do not trigger
  backfills for this verification.
- Re-run root, production-only root, Functions and Horizn importer audits before
  release. The hotfix clears production and Functions advisories. Root tooling
  still reports three moderate package findings: csv-parse, stream-json and their
  parent firebase-tools (two underlying advisories). Do not force npm's proposed
  Firebase CLI downgrade or override stream-json 1.x with 3.x: Firebase CLI uses
  CommonJS extensionless subpaths, while 3.x exports ESM src paths. Resolve this
  in a separate compatible CLI update; avoid untrusted Auth/database import
  files in the meantime.
- Assess the Angular host-binding advisory against native
  rendering before deciding whether a separate expedited store build is needed.


Keep an item unchecked until the action has actually been performed and verified.
Remove a completed release-specific section once no follow-up monitoring or
compatibility behavior remains to be tracked.

### Production error follow-up (2026-09-09)

- [ ] Re-run `getSpotCreationDiagnostics` as an administrator and verify the next
      `cleanupSafetyCaseSecurityMetadata` run completes without an index error.
      The required production indexes were deployed and verified READY on 2026-09-09;
      only application-level follow-up remains. No query-code deployment is required.
- [ ] On the next maintainer-approved main release, verify `/en` through the custom
      domain and `pkspot--parkour-base-project.europe-west4.hosted.app` returns 200.
      Unknown Host headers should return a controlled 400; Cloud Run requests
      forwarded with an allowed hostname should render normally. Do not wildcard
      all hosted.app/run.app domains.
- [ ] Verify a deleted Spot returns HTTP 404 and no application ERROR, an incomplete
      Spot returns a controlled 503/noindex fallback, and a genuine backend failure
      remains observable. Review records `6yrlKXeJ1JpYNFmUWG31` and
      `CazctHllD3YJfih3gju6` read-only, then repair location/location_raw only from
      verified source coordinates; the fallback does not repair production data.
- [ ] Audit the unclassified log entries: the supplied buckets account for 83 of
      the reported 99 errors, leaving 16 not explained by this breakdown.

### Contact delivery and support address

Public contact links now use `support@pkspot.app`. The Discord trigger retries
failed requests; a separate Resend email trigger is implemented locally and has
not been deployed or tested with real mail. Messages remain in the private inbox.

- [ ] Confirm the support mailbox receives mail and verify `pkspot.app` in Resend.
      Configure its required DNS records without replacing existing SPF senders.
      The maintainer created `CONTACT_RESEND_API_KEY` version 1 in Google Cloud
      Secret Manager with send-only access to this domain; deployment and a real
      delivery test remain outstanding.
- [ ] Deploy `onContactMessageEmailCreate` after provider setup and separately
      deploy the retry fix for `onContactMessageCreate` with a valid
      `DISCORD_CONTACT_WEBHOOK_URL`. Submit an authorized test message and verify
      receipt at support, Reply-To behavior, and retry/idempotency. Neither the
      return screen nor a Firestore write alone proves notification delivery.
- [ ] Check `contact_email_delivery` for `needs_review` after delivery outages.
      Automatic email delivery stops after 23 hours to avoid resending beyond
      the provider's idempotency window. Existing messages need a deliberate,
      separately authorized replay; deploying a creation trigger does not backfill.

### Private recovery pauses

- [ ] Following the maintainer-reported rules deployment on 2026-09-07,
      verify recovery-pause access with owner and other-account test sessions
      before the client release.

  Success condition: a signed-in owner can list, create, update, and delete
  `/users/{uid}/recovery_pauses`, while another account cannot read or write
  those records. No Function, index, migration, or Typesense deployment is
  required.

### Development-only Stripe shop (deferred beyond 1.2)

The shop is not part of the 1.2 release scope. Keep its code for a later release
and retain the production/native feature gates below.

The web shop is intentionally experimental: it is enabled only by the
development web environment. Production, Android, and iOS all keep the browser
feature flag off, while the Functions runtime parameter defaults to disabled.
Do not turn it on for a production project or release it in a native build
without separately approved payment, tax, fulfillment, and privacy review.

- [ ] For the `test` Firebase project only, create an uncommitted
      `functions/.env.pkfrspot` with `SUPPORT_SHOP_ENABLED=true` and
      `SUPPORT_SHOP_RETURN_URL` set to the exact development `/shop` URL
      (for example `http://localhost:4200/shop`). The Function appends only a
      trusted cart path for multi-item checkout, or a server-known legacy item
      path; it never trusts a browser-provided redirect.
- [ ] Deploy the `support_orders` `user_id ASC, created_at DESC` Firestore
      index to the `test` project and wait until it reports `Enabled` before
      enabling the authenticated customer order history:

  ```sh
  npx firebase deploy --project test --only firestore:indexes
  ```

- [ ] In Stripe **test mode** for that non-production project, set the two
      Firebase Secrets, deploy the five compatible Functions and Firestore
      rules, and register the deployed `stripeSupportWebhook` HTTPS endpoint
      for `checkout.session.completed`,
      `checkout.session.async_payment_succeeded`, and
      `checkout.session.async_payment_failed`:

  ```sh
  npx firebase functions:secrets:set STRIPE_SECRET_KEY --project test
  npx firebase functions:secrets:set STRIPE_WEBHOOK_SECRET --project test
  npm --prefix functions run build
  npx firebase deploy --project test --only functions:createSupportCheckout,functions:listMySupportOrders,functions:listSupportOrders,functions:markSupportOrderFulfilled,functions:stripeSupportWebhook,firestore:rules
  ```

  Enable TWINT in Stripe's test-mode payment methods for the Swiss CHF
  Checkout flow. Do not store a Stripe secret in the Angular environment or
  source tree.
- [ ] Run a test mixed-cart checkout containing direct support and at least one
      sticker pack, plus a cart with multiple sticker packs. Verify the browser
      return alone does not mark any child order paid, the signed webhook marks
      every matching child order paid exactly once, shipping is retained only
      for physical orders, and an admin with App Check can mark each paid
      physical order fulfilled.
- [ ] Before any production or native release, verify all client flags and the
      production `SUPPORT_SHOP_ENABLED` parameter remain `false`. Confirm a
      request to the production webhook endpoint is acknowledged but ignored,
      and that no Stripe production secret, payment method, or checkout
      endpoint is activated as part of this experimental feature.

### Private check-ins and delayed Spot activity

Training is enabled in every build configuration. Check-ins are enabled in
default, development, production, Android, and iOS; CI disables check-ins.
Development connects to the production Firebase project. These flags do not
prove backend readiness: complete the backend steps and device checks below
before releasing the enabled clients.

The production Functions inventory checked on 2026-09-07 has the legacy
`onCheckInCreate` and `syncVisitedSpotsCountOnPrivateDataWrite`, but none of
`confirmCheckIn`, `deleteCheckIn`, `deleteAllCheckIns`, or
`recomputeCheckInActivity`. A rules-only deployment does not enable the new
check-in flow or its public activity rollup. Recheck this inventory when
performing the deployment below.

- [ ] Resolve the check-in deletion/integrity edge cases before release:
      deleting the latest check-in must not reset the short-lived
      impossible-travel guard, and confirming again during the four-hour
      cooldown must not return a deleted check-in/session as a success. Cover
      both flows through the callable emulator tests. Keep any retained abuse
      prevention state minimal and time-bounded, without raw coordinates.
- [ ] Exercise the scheduled rollup with accepted, excluded, duplicate,
      deleted, and expired contributions from multiple accounts. Cover a new
      confirmation concurrent with rollup completion so a stale rollup cannot
      delete its queued job. Verify only distinct accepted accounts in the
      last 30 days affect the public buckets, with no public document below
      two accounts.
- [ ] Verify the deployed legacy `onCheckInCreate` only maintains private
      visited-Spot compatibility and does not add unvalidated legacy writes to
      the new public activity statistics. Keep legacy history/export/deletion
      and retirement of direct `users/{uid}/check_ins` writes as a separate
      compatibility decision after checking supported-client usage.

- [ ] Deploy the required Firestore index and wait for it to become `Enabled`:

  ```sh
  npx firebase deploy --project prod --only firestore:indexes
  ```

- [ ] Deploy the four compatible Functions, then Firestore rules. Confirm the
      scheduled `recomputeCheckInActivity` job is present in `europe-west1` and
      every callable reports `enforceAppCheck: true`:

  ```sh
  npx firebase deploy --project prod --only functions:confirmCheckIn,functions:deleteCheckIn,functions:deleteAllCheckIns,functions:recomputeCheckInActivity
  npx firebase deploy --project prod --only firestore:rules
  ```

  Success condition: unauthenticated, missing-App-Check, and direct Firestore
  attempts cannot create a check-in; only the `spot_activity_public/{spotId}`
  document can be read by the public, and it cannot be listed.

- [ ] On real Android and iOS release candidates, verify an App Check token is
      attached to all three check-in callables and normal “while using the app”
      location permission appears only after a person selects a persistent or
      five-minute choice in the explanation dialog. With location Off, Locate-me
      must remain visible with `location_disabled`, open the explanation dialog,
      show no map dot, make no nearby-Spot lookup, and make no location-bearing
      log. Confirm temporary access stops watching and clears state after five
      minutes.

- [ ] Only after the preceding backend and Android/iOS checks pass, build the
      production web and native releases. Verify the intended feature flags
      for each build configuration and that the private history can export/delete one
      occurrence/delete all without changing a manual session or authored log.

  Success condition: production Spot details make one non-realtime get for the
  coarse “Recently trained” summary only; no visitor list, exact count, active
  state, check-in notification, or public visited-Spot list is present.

### Community voting and trusted organization edits

Community voting is an explicit Spot policy (`edit_policy.community_voting`),
not a test switch. Compatible Functions must be active before a Spot is moved
to that policy. The Firestore rule permits a vote only for a public, pending
community-vote edit, so deploying the rules before the client is required.

- [ ] Deploy the compatible Functions first, then deploy Firestore rules. Verify
      the Functions deployment includes `applySpotEditOnCreate`,
      `evaluateSpotEditVotesOnVoteWrite`, and
      `evaluatePendingSpotEditVotesOnSchedule`, and that the rules deployment
      succeeds before releasing the web client.

- [ ] After both backend deployments succeed, make the separately approved
      production data migration for Dame du Lac (`1QsdgLHOpzDIReNaFDLw`): replace
      `edit_policy.force_voting` with `{ community_voting: true }`; change its
      pending test edit to `VOTING_OPEN` and `visibility: "public"`; retain its
      existing vote summary and timestamps. Read the current document and edit
      ID immediately before the transaction, require the expected pending test
      state, and abort rather than overwriting a newer outcome.

- [ ] Release the web client through the normal `main`-branch workflow, then
      verify with non-production fixtures and the real Dame du Lac vote that an
      organization owner/admin/reviewer edit is immediately approved, an
      ordinary member follows review, and a public community vote is visible,
      records an immediate selected-vote state, and updates its server summary.

### Canonical editable Spot and media reports

The new clients use callable upserts and withdrawals while the existing direct
Spot-report rule remains temporarily available for supported older clients. The
legacy bridge merges a rapid repeat into the reporter's canonical open report
and records the bridge transition without sending another moderation intake.

The web client is already merged to `main`. That does not deploy Firebase
Functions, so complete the backend rollout and verification below before
considering this report-lifecycle release complete.

The production Functions inventory checked on 2026-09-07 still lacks
`submitSpotReport`, `getOwnReportForTarget`, `withdrawOwnSpotReport`,
`listMyReports`, `getOwnMediaReport`, and `withdrawOwnMediaReport`.
`submitMediaReport` exists, but its presence alone does not verify the new
lifecycle implementation. Recheck the inventory at deployment time.

- [ ] Deploy the report lifecycle Functions before releasing clients:

  ```sh
  npx firebase deploy --project prod --only functions:submitSpotReport,functions:getOwnReportForTarget,functions:withdrawOwnSpotReport,functions:listMyReports,functions:submitMediaReport,functions:getOwnMediaReport,functions:withdrawOwnMediaReport,functions:onSpotReportCreate,functions:onSpotReportSafetyCaseCreate,functions:handleModerationAction
  ```

  - Confirm every callable is in `europe-west1`, an authenticated first report
    produces exactly one intake alert and safety case, an edit produces neither,
    and a withdrawal closes only its pending safety case as reporter-withdrawn.

- [ ] After the Functions deployment, verify the released web client and the
      next native release candidate: one user can submit, edit, and withdraw a
      Spot report and a media report; `/reports` shows their open report and
      terminal history; and another user cannot retrieve either report's
      reasons or details.

- [ ] Monitor Function logs and `report_claims` for legacy bridge activity,
      duplicate canonical acceptances, and callable validation errors during the
      supported-client window. The existing Firestore rules deliberately remain
      unchanged in this release so old direct Spot reports can still be bridged.

- [ ] Once supported-client adoption is confirmed, make a separate, reviewed
      rules release that removes direct client creation of `spots/*/reports/*`.
      Confirm bridge activity has remained at zero for the agreed observation
      window before retiring the legacy path.

### Firebase App Check enforcement readiness

The 1.1.5 client warns once per app load when attestation fails, but it does not
enable enforcement. Enforcement must be staged per Firebase product so older
mobile builds and App Hosting SSR are not accidentally denied.

- [ ] Before enforcing Cloud Firestore, verify in a non-production environment
      that a localized Spot URL includes its Spot-specific title, description,
      canonical, `og:image`, and `twitter:image` in the initial SSR HTML while
      enforcement is enabled. Confirm static assets remain directly cacheable
      and do not contain Admin credentials, App Check tokens, or SSR identity
      material.
- [ ] Verify that valid request metrics increase for
      Authentication, Cloud Firestore, Storage, and every protected callable
      before enabling enforcement. Do not enforce a product while supported
      Android, iOS, or cached web clients for that product still report
      outdated-client or invalid requests.
- [ ] Treat callables that already set `enforceAppCheck: true` as the first
      production canaries; verify their legitimate traffic before changing any
      product-wide setting. Then enable enforcement for one eligible Firebase
      product at a time. After each change, smoke-test account creation and
      verification, public Spot and event reads, authenticated writes, media
      loading/upload, Maps-link resolution, and localized SSR. Monitor
      invalid/unknown request metrics and the App Check failure warning; roll
      back that product's enforcement if legitimate clients are rejected.

### Event RSVP and My Events repair

The Firestore rule change accepts the optional millisecond timestamp already
written by notification actions. Deploy it before releasing the client so
existing action-created RSVP documents can be changed in older and newer apps.

- [ ] Verify a signed-in non-admin can change an existing Interested RSVP that
      contains `time_updated_raw_ms` to Going, while writes to another user's
      RSVP remain denied.

- [ ] Release Android and iOS through their normal workflows. Verify past
      Going and Saved events appear only under Past, future Going events remain
      under Going, future Saved events remain under Saved, and an event present
      in both Going and Saved is displayed only once. No data backfill is
      required.

### Spot event-card RSVP counts and weather threshold

The event-preview trigger change is backward compatible and makes future RSVP
aggregate changes self-healing. The maintenance run repairs previews that were
already stale before the trigger fix. It scans event discovery documents and
only refreshes Spots linked from those events; it does not scan every Spot.

- [ ] Release the mobile clients through their normal workflows. Verify a
      49% precipitation forecast remains a neutral “Chance of rain” with its
      percentage visible, while 50% or at least 0.2 mm uses the rain state.
      Confirm a long title for a promoted event stays within the Spot side panel on
      narrow and desktop layouts.

### Follow-request profile links

The client repairs existing follow-request notification links using the requester
ID in the intent payload. Deploy the compatible Function before releasing the
client so new intents and FCM payloads link directly to the requester profile.

- [ ] Build and deploy the notification Function, then create a private-account
      follow request in a non-production fixture. Verify its stored intent,
      in-app notification, and delivered FCM payload target `/u/{requesterId}`.
      From the recipient profile, open the requester profile and verify the
      primary action is “Accept follow request”; accepting it must create both
      follow edges and remove the pending request.

  ```sh
  npm --prefix functions run build
  npx firebase deploy --project prod --only functions:onFollowRequestNotificationCreate
  ```

### Email signup and notification-link repair

The digest Function change is backward-compatible: existing clients can open
the new canonical Spot path. The client additionally repairs already-projected
digest notifications whose historical path is `/train`.

- [ ] Verify a test digest intent and its in-app projection both use the first
      included Spot's `/s/{slug}` path, and that delivered FCM data carries the
      same path. Do not operate an App Hosting rollout as part of this step.

- [ ] Release Android and iOS through their normal workflows. Verify an
      email/password signup completes profile/private-data initialization before
      redirecting. Open a fresh verification email and confirm it completes;
      reopen the consumed link while signed in and confirm the already-verified
      account shows success instead of an endless spinner. An invalid link for an
      unverified account must show the actionable error and emit a privacy-safe
      handled `AuthActionError` without its action code or raw Firebase message.
      Tap one existing `/train` digest notification and one new
      digest on each supported notification surface; the old item must open its
      first Spot (or the map when old push data lacks Spot IDs), and the new item
      must open its first Spot. Exercise every action offered by the test
      notifications and confirm it is handled through the notification center.

- [ ] Monitor the `auth_sign_up_failed` event and handled
      `AccountCreationError` issues in PostHog by `failure_stage`, `error_code`,
      and platform. Confirm exception payloads contain no email addresses,
      display names, passwords, or raw Firebase errors. Check Functions logs for
      digest delivery failures.

- [ ] Configure PostHog source-map injection and upload in the production build
      pipeline before relying on Error Tracking stack frames. Production builds
      currently disable source maps. Use a PostHog personal API key with only
      `error tracking write` and `organization read`, keep it in CI secrets, and
      verify a release's symbol set plus one intentionally captured test error
      before removing this item. The injected browser assets must be the same
      assets released through the normal `main`-branch App Hosting workflow.

### Maps link paste

The client parses full supported URLs locally. Google short links use a narrow,
App Check-protected redirect resolver which validates every redirect hop and
does not log or persist the pasted URL.

- [ ] Complete the remaining post-deployment Maps-link verification. Confirm an
      off-domain redirect is rejected, and verify full links from both supported
      map providers open the expected location.

### Idempotent Spot creation and duplicate administration

This release is additive for already-released clients: existing direct Spot
creation rules and CREATE-edit processing remain available. New clients depend
on the callable and must be released only after the indexes and Functions are
active. This release does not authorize resolving or deleting any existing
production duplicate.

- [ ] With non-production fixtures, verify duplicate-resolution replays create
      one moderation action and an immediately due actionable notification has
      its in-app feed projection before delivery is claimed. Also verify an
      owner, admin, or reviewer of a Spot's reviewing organization receives
      `APPROVED_IMMEDIATE`, while an ordinary member or outsider still receives
      the pending organization-review disposition.

- [ ] Invoke `createSpotSubmission` twice with one non-production draft token
      and verify both responses point to one Spot/edit while the second reports
      `replayed: true`. Do not use a real reported duplicate for this check.

- [ ] Review the 71 unique production duplicate candidate groups in the
      moderation dashboard. Do not resolve or delete candidates without a
      separate administrator decision.

- [ ] Release compatible mobile clients through their normal workflows. Verify
      web and mobile failed/offline creation remains editable and retryable, a
      rapid repeated save produces one Spot, and released older clients can
      still create through the legacy path.

- [ ] In the moderation dashboard, verify the 24-hour and 7-day actual creation
      totals, callable-versus-legacy adoption, client guard blocks, server
      replays, open duplicate report count, platform/app-version breakdown, and
      canonical links for recent prevented cases. Confirm individual claims are
      unavailable to non-admin clients, contain no token or IP data, expire after
      30 days, and hourly aggregates expire after 12 months.

### Immediate notification delivery

The new Firestore trigger is additive and backward compatible. Existing clients
continue to use the same notification documents and payloads; the scheduled
dispatcher remains as the retry and future-reminder path.

- [ ] Create a production follow request and verify its due intent is claimed in
      a few seconds, exactly one delivery is recorded per active registration,
      and the minute dispatcher does not deliver it again. After the mobile
      release, verify Android and iOS action buttons remove their delivered OS
      notification while still completing the action.

### Reported Spot Typesense previews

This rollout is additive and backward compatible. New clients render only the
public `is_reported` state on preview cards; `report_reason` remains a sanitized
compatibility field for released clients. Raw report documents and
`public_notice` must not be added to Typesense.

- [ ] Release the compatible mobile clients through their normal workflows,
      then confirm web and mobile reported Spot previews show only the localized
      Reported badge before opening the Spot.

### Public import provenance and Spot-edit write containment

The additive Spot projection is backward compatible: released clients continue
to use `getPublicImportProvenance`, and new clients fall back to that callable
only in the browser while a legacy Spot has no projection. The field is not part
of the Typesense schema or extension allowlist. The one-time Spot writes below
will nevertheless wake the Typesense extension, so use the default small pages
and watch extension traffic during the live run.

- [ ] After the next 03:00 UTC sitemap cycle, correlate Cloud Functions
      invocation logs, App Hosting requests, and crawler user agents. Confirm
      there are no SSR-originated provenance calls; legacy clients and direct
      browser fallback traffic may remain. Configure invocation and Firestore
      read/write alerts initially at 3x the prior seven-day P95 baseline.

Callable retirement, server-deduplicated UPDATE submissions, and bounded
community-digest fan-out remain separate follow-ups because they require a
supported-client or notification-policy decision.

### Firebase JS SDK client migration

No Firebase backend deployment, schema migration, rules change, or data backfill
is required for this client-only refactor. Push registration does require each
platform's Firebase Messaging API key to permit the client APIs used by Cloud
Messaging.

- [ ] Verify the updated Firebase Messaging API-key allowlists with real token
      registration. With notification permission already granted, focus the
      local app and confirm `getToken()` no longer returns
      `installations/request-failed` or an API-blocked 403. Repeat on production
      web, Android, and iOS, and confirm each platform creates an active
      registration document for the current user. Keep the platform-specific
      application restrictions in place; this check does not require making a
      Firebase key unrestricted.

- [ ] Release the direct Firebase JS SDK client through the normal mobile
      workflows. Smoke-test supported Capacitor builds: restore a signed-in
      session after reload, sign in and out, observe a realtime Firestore update
      without further interaction, call a `europe-west1` Function, upload with
      visible progress, initialize App Check, and register/receive push.

### Unpublished locality community merges

- [ ] As an administrator, open an active locality community,
      confirm the danger zone lists a same-country locality without a community
      page, merge it, and verify the source URL redirects while the target count
      includes its spots. Undo the merge and verify the source spot address is
      unchanged and the target count returns to its previous value. Confirm denied
      callable requests for a non-admin user in Cloud Functions logs.

### Event cancellation and live operations

The compatible backend is deployed. Complete the production checks before
releasing the event-operations UI. No document backfill or Typesense schema
change is required; older clients ignore the additive lifecycle, program, and
live-update metadata.

- [ ] With a non-production test event in the production project, verify it can be
      cancelled while remaining published; its pending attendee reminders become
      cancelled; exactly one eligible operational update is created per attendee;
      explicit event/global opt-outs suppress the update; and a stale operation is
      rejected without changing the event. Confirm the deployed Functions remain
      active in `europe-west1` and inspect their logs for runtime errors.

- [ ] After the client release, verify cancellation/restoration, event
      rescheduling, one program-item delay, and one alternate-plan activation on
      a non-production test event. Confirm the event page, event map, in-app
      notification, and push deep link all show the same resulting state.

- [ ] Verify the deployed backend-normalization source guard, additive
      reschedule timing payload, and FCM delivery diagnostics. On a
      non-production event, trigger a server timing
      normalization and confirm reminder intents move without creating an
      `event_rescheduled` live update or attendee push. Then perform a genuine
      organizer reschedule and confirm it still creates exactly one update and
      eligible attendee notification showing the previous and new event time.
      Release the compatible client and confirm the live-update card shows the
      same change without repeating the English backend title below its localized
      type label. Send one notification to an account with at least two platform
      registrations and verify the intent records per-platform and
      per-registration acceptance, sanitized error codes, app versions, and
      aggregate counts without copying registration tokens. Confirm the stored
      acceptance result is described as FCM transport acceptance rather than
      proof of OS display.

### Notification center actions and report outcomes

The additive callable, projections, triggers, and rules are deployed. Complete
the production checks before releasing clients that render notification actions.
No backfill is required; older notification documents continue to render without
`actions`, `thread_key`, or `image_url`.

- [ ] Verify follow actions are authorized against the notification
      recipient, a decline and follow-back can be undone for ten minutes, event
      actions update the RSVP, and only the reporter can read the sanitized report
      outcome projection. Confirm no internal moderation notes are projected.

- [ ] Build fresh Android and iOS binaries after the backend is compatible.
      Verify action buttons for a follow request, new follower, event reminder,
      and community event; verify the same actions in a supported web browser.
      On Android, confirm each notification stays in its semantic channel and
      rich images fail gracefully when offline. On iOS, confirm notification
      categories are registered before the first push arrives.

- [ ] Verify one waitlist promotion, each selected reminder offset (one day,
      two hours, and 30 minutes), one meaningful event time/location change,
      and one name-only edit. The first four must create the expected threaded
      notification; the name-only edit must not notify attendees.

- [ ] Test the migration dialog with an account whose Going/Interested RSVP
      predates notification subscriptions. Opening Events must show the prompt
      once; accepting must preserve the RSVP, create only missing subscriptions,
      retain explicit per-event overrides, and schedule only reminder windows
      that are still in the future. Also verify that Customize opens notification
      settings and applies changed reminder offsets to migration-managed
      subscriptions.

### Followed-community notifications

This rollout is additive and its backend is deployed. Complete the production
checks before releasing clients that expose the new per-community switches.
Existing follows default to no community event or Spot digest notifications, so
no backfill is required.

- [ ] Verify a newly published
      public event creates one deterministic intent per opted-in follower no earlier
      than 30 days before its start; cancelling the event invalidates the intent; and
      a qualifying Spot is included once in the follower's Friday 18:00 local-time
      digest. Private or member-only events must not enter `event_discovery` and must
      not produce community intents. Confirm the deployed Functions remain active
      in `europe-west1` and inspect their logs for runtime errors.

- [ ] Verify the Spot-edit decision source behavior with one immediate automatic
      approval, one community-vote decision, and one organization review.

  Success condition: the immediate automatic approval does not create an outcome
  notification, while the reviewed decisions do. Legacy pending edits continue
  to resolve without a client migration.

- [ ] Release the localized web and mobile clients through the normal
      `main`/store workflows. On Android, verify the new Community updates group
      contains the Events and Weekly Spot recommendations channels. Follow a
      community for the first time, accept the contextual opt-in, and confirm the
      global and per-community switches are enabled without prompting before that
      user action.

### Event program Spot maps

This contract is additive. No Typesense schema or backend deployment is
required; released clients continue reading the first `spot_ref`.

- [ ] Release the compatible web client before writing program blocks with
      multiple locations. Verify an existing event that only has `spot_ref`
      still shows its Spot card and program time marker.

- [ ] Audit the WPF Camp active program plan after the compatible release.
      Populate each known location in `spot_refs` using only Spots already
      attached to the event, deduplicate references by `kind` and `id`, and
      mirror the first entry into `spot_ref`. Leave unresolved named locations
      unlinked until their Spot IDs are confirmed.

  Success condition: each mapped WPF Camp day chip shows the intended visited
  Spots, multi-location blocks show every Spot, marker times match the effective
  program times, and an older client still displays the first linked Spot.

### Unified safety cases, complaints, and appeals

This rollout is additive and does not require releasing the new web or mobile
clients at the same time. Keep the existing report collections and handlers in
place: the projection triggers deliberately bridge them into `safety_cases`.
The client routes and entry points are intentionally hidden in the current
release. Re-enable them only in the dedicated follow-up described in
`feature-passes/unified-safety-cases/README.md`.

- [ ] Implement and test a self-managed Gen 2 email-delivery Function for
      `safety_case_email_outbox`, adapting only the useful queue-claim and
      delivery-state behavior from Firebase's Apache-2.0 Trigger Email source.
      Use Secret Manager for the transactional provider credentials and keep the
      existing `to` plus `message.{subject,text,html}` producer contract.

- [ ] Confirm a transactional email provider, verified sending domain, sender,
      monitored reply-to address, secret ownership, bounce handling, and
      delivery monitoring. Deploy the email-delivery Function before any
      safety-case producer Functions.

  Success condition: a controlled server-created document with `to` and
  `message.{subject,text,html}` is delivered, and the Function changes
  `delivery.state` from `PENDING` through processing to `SUCCESS`. A deliberate
  invalid-recipient test reaches `ERROR` without exposing its document to
  clients.

- [ ] Verify ordinary and administrator web clients cannot directly
      read or write `safety_cases`, their private/event subcollections,
      `safety_case_access_tokens`, `safety_case_sessions`,
      `safety_case_rate_limits`, `safety_case_email_outbox`,
      `safety_case_holds`, or `safety_case_metrics`; an administrator can read
      but cannot directly write `moderation_holds/**` through the Storage client
      SDK.

- [ ] Build and deploy the compatible safety-case Functions and the changed
      public-profile projection:

  ```sh
  npm --prefix functions run build
  npx firebase deploy --project prod --only functions:submitSafetyCase,functions:exchangeSafetyCaseAccessLink,functions:getSafetyCaseView,functions:addSafetyCaseMessage,functions:appealSafetyCaseDecision,functions:cleanupSafetyCaseSecurityMetadata,functions:listSafetyCases,functions:getAdminSafetyCase,functions:updateSafetyCase,functions:decideSafetyCase,functions:restoreSafetyCaseDecision,functions:onSpotReportSafetyCaseCreate,functions:onRootReportSafetyCaseCreate,functions:onLegacyMediaReportSafetyCaseCreate,functions:onUserReportSafetyCaseCreate,functions:onModerationActionSafetyCaseCreate,functions:backfillSafetyCases,functions:aggregateSafetyCaseMetrics,functions:syncPublicUserProfileOnWrite
  ```

  Success condition: all Functions are in `europe-west1`; existing report
  clients continue to work; a new legacy report creates one deterministic
  safety case; retries do not create duplicates; and a non-active moderation
  state removes the affected public profile projection.

- [ ] Exercise the private access path before releasing clients: submit one
      signed-in case and one guest case, verify the guest email, exchange its
      one-time 24-hour link once, reload with the scoped 30-day session, add
      information, and confirm another account and a token for another case are
      denied.

- [ ] As an authenticated administrator, invoke `backfillSafetyCases` with
      `{ "dry_run": true }`. Reconcile `reports_scanned`, `existing`,
      `would_create`, and `moderation_actions_scanned` against the legacy
      report/action collections. Inspect a sample from every source type.

- [ ] Only after accepting the dry run, invoke `backfillSafetyCases` with
      `{ "dry_run": false }`. Historical imports must not send retrospective
      acknowledgement emails. Re-run the dry run and confirm every historical
      source is now counted as `existing` and `would_create == 0`.

- [ ] With controlled fixtures only, verify one reversible decision for each
      applicable target class: media, Spot, public warning, profile, and
      account. Confirm the hold is written before the visible restriction, the
      public reason and reviewer are recorded, an appeal is linked to the
      original case, and a successful appeal restores the exact held state.
      Record why if staffing makes a different appeal reviewer impossible.

- [ ] Verify the daily metrics document, overdue queue, email delivery states,
      and the security-metadata cleanup. Use aged test fixtures to confirm
      network/device fields are removed after 90 days while the case, evidence,
      decisions, and correspondence remain.

- [ ] Release the localized clients through the normal `main`/store workflows
      only after the backend verification above. Verify `/safety`,
      `/safety/cases/:reference`, `/moderation/cases`, the account-settings
      age-assurance complaint link, terms, privacy information, and support
      navigation. Do not operate App Hosting directly.

- [ ] Update `docs/README.md` and the affected assessments with the production
      release date, versions, evidence, actual response capacity, and first
      metrics review. Do not mark recorded measures complete based only on a
      successful code deployment.

### Android release optimisation follow-up

- [ ] The `46ef` work is now integrated locally on `development`: release
      minification/resource shrinking, bounded notification bitmaps, and the
      Android 9 launch fix. Verify a signed release build, retained
      Capacitor/plugin entry points, mapping output, and real-device flows
      before shipping. Account restoration remains disabled separately below.

### Flexible event timing, locationless discovery, and ownership claims

Keep these steps in order. The production `events_v1` schema is aligned with the
repository schema, including optional location bounds and the new searchable
presentation/type fields.

The maintainer reviewed 1.1.4/1.1.5 adoption on 2026-09-07 and considered legacy
retirement ready. This cutover uses 1.1.4 as the compatibility floor. Release
commits `86ff555b` (Android version
17 / 1.1.4) and `bd050e69` (18 / 1.1.5) both use `event_discovery` for ordinary
event lists; canonical listing is only for administrators or an SSR fallback.
The local rules now disable `legacyEventListCompatibilityEnabled()`. This does
not establish that the new rules have been deployed. Older installed clients
are not assumed to have disappeared; clients relying on canonical enumeration
must update.

- [ ] Deploy the event-list restriction with
      `npx firebase deploy --project prod --only firestore:rules`, then verify
      1.1.4 and 1.1.5 event list/calendar/organization views and direct event
      links. Verify anonymous and ordinary authenticated canonical `/events`
      list requests fail while public `event_discovery` listing and authorized
      direct reads work. Keep non-public authoring and profile demotion off
      until this production check succeeds.

- [ ] When the first globally discoverable locationless date-only event is ready
      for publication, verify it appears in production Typesense without a time
      zone or map location and remains valid in the Events calendar. Production
      currently has no locationless date-only fixture; existing timed events and
      their rebuilt `event_discovery` projections are already verified.

- [ ] Before re-enabling ownership-claim requests in a later client, verify them
      in production with test accounts: organization
      manager submission, current-owner support/contest response,
      administrator rejection, transactional approval, former-owner editor and
      removal outcomes, immutable audit record, and notifications. Keep the
      request entry point hidden until this succeeds.

### Event discovery and adult community authoring

Keep this rollout additive. Missing `listing_tier` is read as `formal`; this is
an internal owner classification, while the UI labels public organization items
as Events and user-organized items as Community events. Do not make unlisted
community events available while supported clients can still list `/events`
directly.

The production Functions inventory checked on 2026-09-07 lacks
`createCommunityEvent`, `updateCommunityEvent`, `cancelCommunityEvent`,
`createFormalEvent`, `submitEventSuggestion`, `reviewEventSuggestion`, and
`demoteCommunityEventsWhenProfileBecomesPrivate`. Deploy the compatible
authoring backend as part of the ordered rollout below before treating client
authoring failures as age-verification failures.

- [ ] Update the production `events_v1` Typesense schema with optional
      `listing_tier`, `country_code`, `region_keys`, and
      `community_broadcast` fields before deploying the
      Functions/client that write or filter them. Then deploy Functions,
      Firestore rules, and the `events` active-community-listing composite
      index from `firestore.indexes.json`.

  Success condition: the callable endpoints require both Authentication and
  App Check; public Community-event documents project to `event_discovery`, while
  a direct client write cannot set tier, country, region, organizer-user, or
  broadcast fields.

- [ ] Run the existing `run-backfill-event-typesense-fields` maintenance flow
      after the schema is live. It must materialize `listing_tier: formal` for
      legacy Events and backfill `region_keys` only from a valid explicit
      `country_code` or `community_keys` value of the exact form
      `country:XX`; never derive a country from locality text. Rebuild
      `event_discovery` and wait for the Firestore-to-Typesense extension to
      finish indexing.

  Success condition: a legacy Event remains in the Events filter; a known
  country Event appears only in its expected region; a locationless Event
  Event remains Worldwide-only.

- [ ] Verify production with test accounts before exposing authoring broadly:
      active verified-18+ evidence is accepted; absent/expired evidence and
      missing App Check are rejected; organization owner/admin direct Event
      publishing works; a public Community event requires a public profile;
      the three-active-public-listing cap is atomic; a cancelled Community event
      frees capacity; and an opt-out Community event creates no community
      notification intent. Verify suggestion rejection retains its private
      audit outcome and approval creates exactly one canonical Event
      plus slug atomically.

- [ ] After the canonical-list restriction and supported-client checks above
      succeed in production, enable `unlistedCommunityAuthoringEnabled()` in
      the backend, deploy the authoring/demotion Functions, and then expose
      public/unlisted visibility in the Community editor and enable
      `privateAccessRolloutEnabled` in the formal Event editor. Both authoring
      controls remain off in the current source. Verify an unlisted Community event is
      openable by direct link and RSVP-able, absent from `event_discovery`,
      Typesense, regional results, and broadcasts; verify removing the
      organizer's public profile demotes their public Community events to
      unlisted and removes their discovery projection.

- [ ] Confirm the Events list and calendar label only Community events; region
      and tier URL filters restore correctly; cover-image placeholders render
      for Events without a cover; and Community authoring never offers media,
      tickets, or programs.
      Release the web/native client through the normal `main` workflow only
      after those production checks. Do not operate App Hosting directly.

### Organization image cropping and media processing

The Functions and storage rules must be deployed before the organization editor
client. Keep the steps in this order so no released client can target an
unsupported storage destination.

- [ ] From the organization admin UI, upload and approve a cropped organization
      logo. Verify the stable organization-ID filename produces 200, 400, and
      800 pixel derivatives under `organization_media`, and that `logo_url`
      contains the 800-pixel derivative URL only after `media_upload_status`
      reports the upload as published. Open the editor from the organization
      page and verify its organization query parameter preselects the correct
      record. Also verify a non-administrator and SVG upload are denied, and
      direct client publication to `organization_media` remains denied.
- [ ] Only after the production verification above, release the client through
      the normal `main` workflow. Do not manually operate an App Hosting rollout.

### User profile privacy cutover

The backend rollout is deliberately separate from the client rollout. Do not
activate the final cutover while any supported client still reads another
user's authoritative `users/{uid}` document.

- [ ] Release the client that reads other users through `getUserProfile`, writes
      `public_profile_enabled` and `public_search`, and resolves public profile
      metadata from `public_user_profiles`. This is a normal App Hosting/mobile
      release and must not be inferred from a backend-only deployment.
- [ ] Monitor profile callable errors and supported-client adoption. Do not
      proceed until every supported client version uses the callable for other
      users.
- [ ] As an authenticated administrator, invoke
      `backfillPublicUserProfiles` with `{ "dry_run": true }`. Review
      `users_scanned`, `public_profiles`, and `stale_profiles`; an existing
      account must not be projected without independently checked adult
      eligibility and explicit public-profile consent.
- [ ] Invoke `backfillPublicUserProfiles` with `{ "dry_run": false }`. Verify
      `maintenance/user-profile-projection.completed == true`, inspect the
      projected count, and sample every projected profile if the count remains
      small.
- [ ] Invoke `activateUserProfilePrivacyCutover` with the exact confirmation
      `restrict-legacy-user-profile-reads` and the oldest client version that is
      still supported. This is the irreversible compatibility boundary for old
      profile readers.
- [ ] Verify after cutover that anonymous and unrelated authenticated clients
      cannot read `users/{uid}`, owners and administrators still can, limited
      callable responses omit profile picture/city/biography/social links, and
      explicitly opted-in adult public profiles remain available.
- [ ] Before enabling user indexing, configure the Typesense extension to
      source `public_user_profiles` (not `users`), apply
      `typesense/typesense_users_v1_schema.json`, and backfill only documents
      with `public_search == true`.
- [ ] Deploy the sitemap Functions and regenerate the sitemap. Confirm only
      `public_user_profiles` with `public_search == true` produce `/u/` URLs.

### Request-bound age assurance v3 and Android Age Signals 0.0.4

The backend and rules must precede the client. Existing clients continue using
the legacy or v2 callable; neither can establish public-profile eligibility.

- [ ] In the 1.1.5 iOS release, verify with a signed-in account on iOS 26 that
      launching the app does not show Apple's age-range request. In Settings →
      Profile access, tap `Check age range` and confirm PK Spot first explains
      why it asks, that only ranges are requested, and that no exact age or
      birthday is requested. Confirm `Not now` opens no system UI and Continue
      opens Apple's age-range request.

- [ ] In Google Play Console, confirm PK Spot is linked to Google Cloud project
      number `294969617102`, Play Integrity is enabled for `com.pkspot.app`, and
      the Play Integrity API is enabled in that Cloud project. The production
      Functions runtime service account must be able to obtain a
      `playintegrity`-scoped access token and call `decodeIntegrityToken`.
- [ ] Verify the deployed additive App Check-protected challenge, verification,
      invalidation, and challenge-cleanup Functions. All Functions must be
      active in `europe-west1`; requests without
      Firebase Auth and App Check are rejected; `updateAgePolicyV2` can update
      participation state but never adult eligibility; and the scheduler deletes
      expired one-time challenges without expiring assurance records.
- [ ] In Firebase App Check, confirm the production Android app uses Play
      Integrity and the production iOS app uses App Attest. Review metrics for
      invalid and unknown requests before the client release. App Check protects
      the callable boundary. Play Integrity's `requestHash` separately binds the
      exact Android age signal, one-time server challenge, and authenticated UID.
- [ ] Verify a self-declared 18+ policy cannot enable or project a
      public profile. Only an active, request-bound Tier C or D 18+ policy can do
      so, and only with the user's explicit public-profile opt-in. An approval
      remains active until a later signal supersedes it or its exact approval basis
  is explicitly invalidated; verification records are retained.
- [ ] From the production moderation dashboard, dry-run both active approval
      bases before any client release:

  ```text
  google_play:platform_age_signal:tier_c:request_bound:v1
  google_play:platform_age_signal:tier_d:request_bound:v1
  ```

  Success condition: each preview returns zero before the first v3 client is
  released. Do not apply the rollback; this only verifies admin access and the
  production query.
- [ ] Release the client containing Android Play Age Signals `0.0.4`, the
      two-step access request, Play Integrity `1.6.0` request binding, normalized
      assurance record, and the account settings recovery flow for rechecking
      the signal or opening PK Spot's Play Store age-sharing controls. Do not
      infer this release from the backend deploy.
- [ ] Verify production with representative test accounts: optional age sharing
      declined still permits core participation; a mandatory unresolved signal
      restricts participation; Tier A does not unlock a public profile; and an
      18+ Tier C or D result from a Play-installed, licensed build on a device
      meeting device integrity does. For a declined result, enable `Share age
      range` from PK Spot's Play Store listing, return to Settings, use `Check
      again`, and confirm the result updates without restarting the app.
- [ ] Monitor `beginAgeAssuranceV3` and `updateAgePolicyV3` App Check failures,
      Play Integrity decode failures, age-signal outcomes, challenge cleanup,
      and public profile projection changes. Keep `updateAgePolicy` and
      `updateAgePolicyV2` for supported legacy clients, then remove them only
      after adoption confirms they are unused.
- [ ] Exercise rollback in a non-production Firebase project: create active
      Tier C fixtures, preview the basis, apply the invalidation, and confirm
      adult eligibility, public profile opt-in, and public search are disabled
      while `age_assurance_records` retains the historical decision.
- [ ] Apple request binding is implemented locally; `APPLE_BOUND_AGE_ENABLED`
      defaults to false. The compatibility endpoint and profile rules now reject
      unbound Apple approvals. Before enabling, verify real App Attest registration
      and assertions from a signed iOS build against a non-production backend;
      malformed-payload and synthetic-signature unit tests are not device evidence.
- [ ] Configure a OneID sandbox client for a hosted multi-method/fallback journey.
      Set `ONEID_PRODUCT` to `age_check`, `age_verification`, or `age_assure` only
      after confirming the enabled methods and threshold-only scope contract with
      OneID. Requested scopes remain `openid age_over_18 product:<configured product>`.
      Hosted document/selfie/mobile/bank/eID methods are allowed with user consent;
      PK Spot does not request identity, DOB, document-image, bank-account or contact
      scopes. The product's default data may differ: verify the actual response and
      do not silently broaden scopes to make a method work.
      `ONEID_AGE_CHECK_METHOD_APPROVED` retains its parameter name for compatibility,
      but now approves the configured journey, not a bank-only method. For production
      verification, keep it and `ONEID_AGE_VERIFICATION_ENABLED` false until vendor
      checks pass. The isolated, UID-restricted sandbox is enabled. New decisions
      use `oneid:provider_threshold:server_to_server_oidc:v3` and record the product,
      not a guessed underlying method. Reviewed v2 bank decisions remain accepted.
      Old v1 approvals require re-verification.
- [ ] Validate the sandbox client after switching its product to `age_verification`
      in both OneID Console and `ONEID_PRODUCT`. Requests remain limited to
      `openid age_over_18 product:age_verification`. Allowlisted sandbox testers
      have 100 starts per UTC day with a 10-second cooldown; production retains
      five starts per UTC day and a 60-second cooldown.
- [ ] Ask OneID to confirm/enable multi-method sandbox journeys for this client.
      After Console and backend both changed to `age_verification`, the tester
      still sees only UK Bank. Confirm mobile-network, international eID and
      document fallback availability, required product/configuration, and whether
      the threshold-only scopes suffice. Do not assume changing to Age Assure
      enables these methods. Testing docs demonstrate Model Bank but do not
      establish full sandbox method coverage: https://docs.oneid.uk/guides/testing.
- [ ] Confirm coverage/pricing in the OneID account. The published age overview
      lists UK bank, international eID and wallet for Age Check, adds mobile networks
      for Age Verification, and the Age Assure page documents document scanning.
      Mobile coverage is market/operator-dependent; do not promise worldwide bank
      or mobile coverage, or Swiss availability. Standalone credit-card age checks
      are not confirmed by the reviewed docs. Ask OneID about card support,
      document countries/types, method routing and fallback availability for this client.
      References: https://docs.oneid.uk/services/age-overview,
      https://docs.oneid.uk/services/age-assure, https://docs.oneid.uk/guides/errors.
- [ ] The tester completed a successful bank sandbox journey. Test both Model Bank age outcomes,
      cancellation and reconnect. Confirm real age policy and approval records remain
      unchanged. Return links now use the attempt locale and Settings → Account
      (`http://localhost:4200/<locale>/settings/account?oneid=return`); set a reachable HTTPS
      development URL before device testing. This is provider validation still to do,
      not implied by successful deployment or unauthenticated endpoint checks.
- [ ] Build updated native apps before testing OneID on iOS/Android. The existing
      AgeAssurance bridge now opens the default system browser using UIApplication
      and ACTION_VIEW, not an in-app browser. Validate browser opening and return
      links on real devices; Angular/unit checks do not compile or validate native code.
- [ ] Validate any future discovery endpoint changes against the pinned issuer
      origin. Public sandbox metadata was checked: token `/token`, UserInfo `/userinfo`,
      JWKS `/keys`, S256 and PS256 match the implementation. Verify nonce, PKCE,
      returned fields, consent screens and method switching against OneID sandbox;
      local `npm run test:emulator:oneid` uses simulated responses and test keys.
- [ ] Before production verification, deploy the affected policy consumers and
      Firestore rules. The five OneID sandbox functions are deployed; the production
      consumers/rules were deliberately outside that deployment. Test app
      backgrounding and returning through `/settings/profile?oneid=return` on web,
      Android and iOS. The client fetches results through an owner-only callable;
      the return URL itself never grants eligibility.
- [ ] Verify Cloud Logging entries for each backend stage and consent-gated client
      failure telemetry. Application logs contain only stage/outcome/safe error codes.
      Review infrastructure request logs separately: callback query strings contain
      temporary codes/state and must be excluded/redacted from retained request logs
      before enabling live verification. Confirm provider retention and PK Spot audit
      retention/revocation policy with the broader safety release checklist.
- [ ] Before enabling production verification, replace sandbox credentials with
      a separately approved production client/secret and repeat the complete flow.
      The deployed sandbox start/callback already bind `ONEID_CLIENT_SECRET` version 1.
- [ ] Resolve unrelated `STRIPE_SECRET_KEY` discovery before a normal full-entry-point
      Functions deploy, or use a narrowly scoped deployment entry point. The sandbox
      deployment used a temporary package with the compiled Functions output and a
      main entry that initializes Admin/global europe-west1 options and exports only
      availability, start, status, callback and cleanup from
      `lib/functions/src/externalAgeVerificationFunctions.js`. Its deploy filter named
      exactly those five functions. Do not create dummy Stripe secrets or deploy shop
      functions merely to unblock OneID.
- [ ] Verify the OneID callback rejects unknown, expired, owned-by-another,
      mismatched-state, mismatched-nonce, replayed, duplicate, invalid-signature,
      and failed-token-exchange responses. Confirm a duplicate completed callback
      is idempotent, the attempt consumes its temporary verifier/nonce, and the
      audit record stores only the 18+ outcome and hashed opaque transaction
      reference—not provider identity data.
- [ ] Test Apple Declared Age Range on an entitled signed iPhone/iPad running
      iOS/iPadOS 26+. Check decline, unavailable API, weak/self-declared,
      guardian, independently checked, and 18+ strong outcomes. Then explicitly
      run the iPad app on an Apple Silicon Mac with macOS 26+ where Apple exposes
      the API. Record whether the iPad compatibility runtime presents the system
      request; do not treat it as a native macOS target.
- [ ] For Apple request binding, enable the App Attest capability and regenerate
      provisioning profiles. Both the manual age assertion and Firebase App Check
      remain required. The verifier pins team `WJ3MX3Y7U8`, bundle `com.pkspot.app`,
      and production App Attest attestations; simulator/debug proofs are not accepted.
      Verify these values against the signed target before deployment.
- [ ] Deploy `beginAppleAgeAssurance`, `finishAppleAgeAssurance`, `updateAgePolicyV2`,
      `cleanupAgeAssuranceChallenges`, `cleanupOnUserDelete`, the affected profile/
      Event consumers, and Firestore rules in the test project first. Enable
      `APPLE_BOUND_AGE_ENABLED` only there for signed-device tests. Cover first key
      registration, subsequent assertions, expired/replayed/tampered challenges,
      account switching, concurrent counters, reinstall, declined sharing, and
      weak declarations. Confirm no unbound endpoint grants adulthood and account
      deletion removes `apple_age_keys` and its pending challenge. Review the
      `node-app-attest` verifier with a real Apple attestation before production.
      Bindings authenticate the native request, not an Apple-signed age certificate;
      approval still depends on the declaration method and separately approved policy.
- [ ] Run a non-production invalidation for each new basis, including
      `oneid:provider_threshold:server_to_server_oidc:v3`, reviewed v2 records, and any
      Apple request-bound basis actually returned by device testing. Confirm adult eligibility,
      public-profile opt-in, and public search are disabled while historical
      `age_assurance_records` remain available only to administrators.

### Online-safety operational readiness

- [ ] Keep `maintenance/spot-report-privacy.completed` unset until supported
      clients no longer read raw `spots/{spotId}/reports/{reportId}` documents.
      When that compatibility window ends, invoke
      `migrateSpotReportsToPublicWarnings` as an administrator; it writes
      sanitized public warnings before marking the raw reports private.

  Success condition: every active legacy Spot report has an appropriate
  `public_notice`, ordinary clients can read the warning but cannot read raw
  report text or reporter identity, and administrators retain raw-report
  access. Do not set the maintenance flag manually.

- [ ] Verify in production that an administrator can still update a legacy
      incident that does not yet have runbook fields.
- [ ] Obtain written UK advice on whether the Swiss-operated service currently
      meets the outside-UK nexus for the CSEA reporting duty and identify the
      present service provider. If it is in scope and does not already report to
      NCMEC, register that provider and nominated organisation administrator for
      the NCA Child Sexual Exploitation and Abuse Industry Reporting Portal.
      Record the registration owner and a backup operator outside the app.
- [ ] Complete and retain the written UK children’s access assessment, illegal
      content risk assessment, and—if children are likely to access the
      service—children’s risk assessment. Record the evidence, measures,
      residual risks, owner, approval date, and next review date.
- [ ] Record that PK Spot is not in Ofcom’s 10 July 2026 register of categorised
      services, then re-check the register and the assessment whenever user
      numbers or functionality change materially.
- [ ] Run a tabletop incident from a test media report through containment,
      evidence preservation, route selection, external-reference recording,
      audit events, and closure. Do not upload unlawful material for the test.
- [ ] Assign a primary and backup moderator and test that both can reach reports
      and incident records while ordinary users cannot.
- [ ] Schedule at least annual assessment review and an assessment before any
      significant service change, including messaging, comments, challenges,
      recommendations, public user search, or a material expansion of UK use.

### Media quarantine crossover

Run this operation after the compatible media-moderation Functions and Storage
rules are deployed. It processes objects that reached `media_intake` before the
live Storage trigger handled them. Allowed media is published and removed from
quarantine; flagged or failed media remains quarantined for administrator
review.

- [ ] Confirm a new test upload completes through the quarantine path and direct
      writes to public media paths remain denied by the deployed Storage rules.
- [ ] Create the Firestore trigger document
      `maintenance/run-process-media-intake-backfill`. Use a small positive
      numeric `limit` for the first production pass; omit `limit` only after
      that pass has completed successfully.
- [ ] Wait for the trigger document to be deleted, then inspect
      `maintenance/last-media-intake-backfill`. Record its `completedAt` and the
      `scanned`, `approved`, `blocked`, `needs_review`, `scan_failed`, and
      `skipped` counts.
- [ ] Verify a sample of `approved` objects exists at its published path and no
      longer exists under `media_intake`. Review every `blocked`,
      `needs_review`, and `scan_failed` item in the moderation console; do not
      delete retained evidence or manually release a reportable match.
- [ ] Repeat the backfill without `limit` to catch remaining unprocessed
      objects. Final-status reviews are intentionally counted as `skipped`, so
      completion means there are no unexplained intake objects or unresolved
      `scan_failed` reviews—not that the quarantine prefix is empty.

### Retire the `de-CH` app locale

Complete these steps in order after the locale-removal change is live in App
Hosting:

- [ ] Verify representative legacy URLs permanently redirect to their German
      equivalents and preserve the rest of the path:

  ```sh
  curl --head https://pkspot.app/de-CH
  curl --head https://pkspot.app/de-CH/map/communities/zuerich
  ```

  Both responses must be `301`; their `Location` headers should be `/de` and
  `/de/map/communities/zuerich`, respectively.

- [ ] Build and deploy only the two production sitemap functions:

  ```sh
  npm --prefix functions run build
  npx firebase deploy --project prod --only functions:generateSitemapOnSchedule,functions:generateSitemapManual
  ```

- [ ] Regenerate the production sitemap immediately instead of waiting for the
      nightly schedule:

  ```sh
  curl --fail --show-error https://europe-west1-parkour-base-project.cloudfunctions.net/generateSitemapManual
  ```

- [ ] Download the newly generated sitemap and confirm that `de-CH` has
      disappeared while German URLs remain:

  ```sh
  curl --fail --silent --show-error --location https://pkspot.app/sitemap.xml \
    --output /tmp/pkspot-sitemap.xml
  rg -n 'de-CH' /tmp/pkspot-sitemap.xml
  rg -m 5 'https://pkspot.app/de/' /tmp/pkspot-sitemap.xml
  ```

  The first `rg` command must return no matches; the second must show German
  entries.

- [ ] In Google Search Console, resubmit `https://pkspot.app/sitemap.xml`, inspect
      one former `de-CH` URL with the live test, and confirm Google sees its `301`
      destination.
- [ ] Over the following weeks, monitor the Page indexing report and German
      search performance. Keep the `de-CH` redirects in place indefinitely; they
      preserve existing links and transfer search signals to `/de`.

### Native gallery photos (selective integration; not enabled)

The complete earlier prototype is preserved in local commit `813cac7e` on
`codex/native-media-ingestion`. Its reusable Spot matching and JPEG preparation
helpers are integrated on `development`; the draft inbox, video intake, native
share entry points, and moderation changes are not activated or merged wholesale.
No gallery-sharing feature is ready to release from this foundation alone.

- [ ] Implement the direct photos-only flow: share/select photos, confirm suggested
      Spot groups, upload, and show retry/cancel/progress without a draft inbox.
      Use photo EXIF/shared metadata, never the device's current location as the
      photo location. Individual photo coordinates and capture times stay local;
      fetch candidate Spot data without sending exact photo positions. For new
      Spots, suggest the local group average and let the user drag the pin; only
      the confirmed Spot location is submitted through normal Spot creation.
      Reuse the shared Spot picker in the Angular app. Locationless photos require
      explicit assignment. Keep user-uploaded Spot videos out of this feature.
- [ ] Port Android image-only share intents and iOS Share Extension after the
      direct flow is ready. Add the native plugins to the app targets/bridges,
      configure iOS App Groups and signing, and validate extension authentication
      and App Check before allowing uploads from the extension. Do not rely on
      the iOS extension automatically launching the containing app.
- [ ] Finish native HEIC/orientation/capture-time handling, memory-bounded image
      preparation, and local metadata use. Verify uploaded derivatives contain
      no source GPS/EXIF; unavailable metadata must not prevent manual assignment.
- [ ] Replace the prototype's persistence and retry behavior: commit local files
      and assignments atomically before deleting originals, preserve progress on
      repeated native delivery, and make server attachment atomic/idempotent.
      Keep native originals until preparation and durable handoff succeed.
- [ ] Cover new routes with fixture-based visual tests and test cold/warm sharing,
      offline recovery, cancellation, repeated delivery, multi-Spot batches,
      malformed metadata, and denied permissions on real iOS and Android devices.
      Existing matching/preparation unit tests do not establish native readiness.

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

### Planned training sessions (disabled until coordinated validation)

The new `planned_sessions` flow is separate from legacy Events and completed
SessionRecords. All environment flags and `PLANNED_SESSIONS_ENABLED` default to
false. Local implementation does not enable production session planning.

- [ ] Deploy the additive `planned_sessions` and `session_plans` indexes and
      server-only rules first. Verify the collection-group `sessionId` index is
      READY. Older clients continue to use legacy Events; do not copy private
      plans into `events`, `event_discovery`, Typesense, or sitemap exports.
- [ ] Deploy `plannedSessions`, `schedulePlannedSessionReminder`,
      `refreshPlannedSessionPlans`, `sendDueNotificationIntents` and `onImmediateNotificationIntentCreate`
      with their new send-time access checks, and `cleanupOnUserDelete`. Keep
      `PLANNED_SESSIONS_ENABLED=false` until the non-production checks pass.
- [ ] Test authenticated callables with real App Check in a non-production
      project, including private invitation/revocation, reciprocal blocks,
      anonymous community link views, private saves, explicit visible attendance,
      edits/cancellation and account deletion. `npm run
      test:emulator:planned-sessions` tests handler transactions and Firestore
      read denial; it does not attest a device or exercise a deployed callable.
- [ ] Test reminder delivery on web, Android and iOS with notification preferences
      enabled. Only generic copy may reach the lock screen. Check time changes,
      cancellation, revoked invitations, deleted accounts and notification taps.
      Native store builds may need the existing `/events` link rules adjusted if
      they constrain route depth. No check-in or activity is created by saving.
- [ ] Before enabling community discovery, complete the OneID vendor finalization
      checks above. Deploy the updated Firestore profile rules alongside the
      OneID and profile/event functions before enabling the provider. The session
      predicate accepts only the shared reviewed OneID policy; the provider and planned-session feature flags remain disabled.
- [ ] Review the limited first session release: one existing Spot per session,
      no recurrence, no organization-managed minor rosters, at most 50 private
      invitations, and support contact rather than a dedicated session report
      intake. Finish scoped session reporting and moderation before enabling
      broader community discovery. Friendship never implicitly reveals attendance.
- [ ] After these checks, enable the server parameter before enabling
      `features.plannedSessions` in the intended clients. Verify the updated UI
      and private save/check-in/activity flow locally before any web release.
