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

Keep an item unchecked until the action has actually been performed and verified.
Remove a completed release-specific section once no follow-up monitoring or
compatibility behavior remains to be tracked.

### Firebase App Check enforcement readiness

The 1.1.5 client warns once per app load when attestation fails, but it does not
enable enforcement. Enforcement must be staged per Firebase product so older
mobile builds and App Hosting SSR are not accidentally denied.

- [ ] Before enabling the SSR app ID, verify the App Hosting runtime service
      account (`firebase-app-hosting-compute@parkour-base-project.iam.gserviceaccount.com`)
      can sign its custom App Check assertion. Enable the IAM Service Account
      Credentials API if needed and grant `iam.serviceAccounts.signBlob` only
      on the signing service account (normally by granting **Service Account
      Token Creator** to the runtime account on itself), not project-wide.
      Verify the effective principal and narrow binding in IAM rather than
      adding a downloaded service-account key.
- [ ] Deploy the configured SSR provider while Firestore enforcement remains
      off. Render several localized Spot and event URLs, then confirm App Check
      verification metrics contain valid traffic for the dedicated SSR app ID
      (`1:294969617102:web:08b892460adf0b16313e9f`). In App Hosting logs, verify
      `[SSR AppCheck] Token minted.` appears with a one-hour TTL and no
      `[SSR AppCheck] Token mint failed.` entries. Logs include sanitized error
      type/code/message data but never include the minted token. The Cloudflare
      Workers + static-assets design and its required
      `SsrAppCheckTokenMinter` adapter are documented in
      `DATA_FLOW_AND_FUNCTIONS.md`; Angular SSR alone is not an attestation.
- [ ] Before enforcing Cloud Firestore, verify in a non-production environment
      that a localized Spot URL includes its Spot-specific title, description,
      canonical, `og:image`, and `twitter:image` in the initial SSR HTML while
      enforcement is enabled. Confirm static assets remain directly cacheable
      and do not contain Admin credentials, App Check tokens, or SSR identity
      material.
- [ ] Release the production web App Check change that attaches App Check to the
      default Firebase app, then verify that valid request metrics increase for
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

### Community event and Spot ranking repair

The 1.1.5 client filters expired cached event previews at render time and sorts
community picks with the shared map priority. Deploying and rebuilding the
generator also corrects the stored order for older clients and future pages.

- [ ] Deploy the community page generator before releasing the 1.1.5 clients:

  ```sh
  npx firebase deploy --project prod --only functions:rebuildAllCommunityPages
  ```

- [ ] Request a full community rebuild and wait for the maintenance document
      to report `status: DONE`:

  ```sh
  FIREBASE_PROJECT=parkour-base-project node scripts/request_community_rebuild.js
  ```

  - Verify Basel's Standout Spots use the same shared rating, access, iconic,
    media, and report priority as the map, and no expired event is rendered on
    a representative community page.

### Event RSVP and My Events repair

The Firestore rule change accepts the optional millisecond timestamp already
written by notification actions. Deploy it before releasing the client so
existing action-created RSVP documents can be changed in older and newer apps.

- [ ] Deploy the RSVP-compatible Firestore rules:

  ```sh
  npx firebase deploy --project prod --only firestore:rules
  ```

  - Verify a signed-in non-admin can change an existing Interested RSVP that
    contains `time_updated_raw_ms` to Going, while writes to another user's
    RSVP remain denied.

- [ ] Release web, Android, and iOS through their normal workflows. Verify past
      Going and Saved events appear only under Past, future Going events remain
      under Going, future Saved events remain under Saved, and an event present
      in both Going and Saved is displayed only once. No data backfill is
      required.

### Spot event-card RSVP counts and weather threshold

The event-preview trigger change is backward compatible and makes future RSVP
aggregate changes self-healing. The maintenance run repairs previews that were
already stale before the trigger fix. It scans event discovery documents and
only refreshes Spots linked from those events; it does not scan every Spot.

- [ ] Deploy the Spot event-preview trigger, its bounded backfill helper, and
      the weather callable before releasing the client:

  ```sh
  npx firebase deploy --project prod --only functions:syncSpotUpcomingEventsOnEventWrite,functions:backfillSpotUpcomingEvents,functions:getWeather
  ```

  - Verify all three Functions report location `europe-west1`. Change one test
    RSVP and confirm the canonical `events/{eventId}.rsvp_counts`, matching
    `event_discovery/{eventId}.rsvp_counts`, and the linked
    `spots/{spotId}.upcoming_events[].rsvp_counts` converge to the same value.

- [ ] Create `maintenance/run-backfill-spot-upcoming-events` with any contents
      once, wait for the Function to delete it, and verify the representative
      Spot card that was stale now matches the event page. Check Function logs
      for failures before continuing; recreating the maintenance document is
      the retry mechanism.

- [ ] Release the client through the normal web and mobile workflows. Verify a
      49% precipitation forecast remains a neutral “Chance of rain” with its
      percentage visible, while 50% or at least 0.2 mm uses the rain state.
      Confirm a long title for a promoted event stays within the Spot side panel on
      narrow and desktop layouts.

### Email signup and notification-link repair

The digest Function change is backward-compatible: existing clients can open
the new canonical Spot path. The client additionally repairs already-projected
digest notifications whose historical path is `/train`.

- [ ] Deploy the community digest producer and notification delivery Functions
      before releasing the clients:

  ```sh
  npx firebase deploy --project prod --only functions:sendCommunitySpotDigests,functions:sendDueNotificationIntents,functions:onImmediateNotificationIntentCreate,functions:onNotificationIntentWrite
  ```

  - Verify a test digest intent and its in-app projection both use the first
    included Spot's `/s/{slug}` path, and that delivered FCM data carries the
    same path. Do not operate an App Hosting rollout as part of this step.

- [ ] Release web, Android, and iOS through their normal workflows. Verify an
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

### Google Maps and Apple Maps link paste

The client parses full supported URLs locally. Google short links use a narrow,
App Check-protected redirect resolver which validates every redirect hop and
does not log or persist the pasted URL.

- [ ] Complete the post-deployment Maps-link verification. Confirm requests
      without valid App Check and off-domain redirects remain rejected, and
      confirm application logs contain no raw pasted URLs. Then paste
      `https://maps.app.goo.gl/v53ih4b5vdjweTB57` into map search: the pasted
      URL and autocomplete loading indicator must remain visible while
      resolving, and the result must open the Google Place for `Spital Lachen
      AG` (with its destination coordinates as fallback). Also verify full
      Google Maps and Apple Maps links open the expected location.

### Idempotent Spot creation and duplicate administration

This release is additive for already-released clients: existing direct Spot
creation rules and CREATE-edit processing remain available. New clients depend
on the callable and must be released only after the indexes and Functions are
active. This release does not authorize resolving or deleting any existing
production duplicate.

- [ ] Deploy `firestore.indexes.json` to production and wait for both new
      `spot_create_submissions` diagnostics indexes (`last_attempt_at` with
      `attempt_count`, and `last_attempt_at` with `guard_block_count`) to report
      `Enabled`. Do this before deploying the diagnostics Function:

  ```sh
  npx firebase deploy --project prod --only firestore:indexes
  ```

- [ ] Deploy the backward-compatible duplicate administration, diagnostics,
      report-warning, safety-case, and immediate-notification Function updates:

  ```sh
  npx firebase deploy --project prod --only functions:getSpotCreationDiagnostics,functions:resolveSpotDuplicate,functions:detectDuplicateSpots,functions:applySpotEditOnCreate,functions:onSpotReportCreate,functions:onModerationActionNotificationCreate,functions:onModerationActionSafetyCaseCreate,functions:onImmediateNotificationIntentCreate,functions:onNotificationIntentWrite
  ```

      Verify every listed Function reports location `europe-west1` in the
      Firebase Functions inventory; fail the release if any differs. Also verify
      the deployment succeeds, duplicate-resolution
      replays create one moderation action, and an immediately due actionable
      notification has its in-app feed projection before delivery is claimed.
      Also verify an owner, admin, or reviewer of a Spot's reviewing organization
      receives `APPROVED_IMMEDIATE`, while an ordinary member or outsider still
      receives the pending organization-review disposition.

- [ ] Invoke `createSpotSubmission` twice with one non-production draft token
      and verify both responses point to one Spot/edit while the second reports
      `replayed: true`. Do not use a real reported duplicate for this check.

- [ ] Review the 71 unique production duplicate candidate groups in the
      moderation dashboard. Do not resolve or delete candidates without a
      separate administrator decision.

- [ ] Release compatible web and mobile clients through their normal workflows.
      Verify a failed/offline creation remains editable and retryable, a rapid
      repeated save produces one Spot, and released older clients can still
      create through the legacy path.

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

- [ ] Release the compatible client through the normal web and mobile workflows,
      then confirm a reported Spot preview shows only the localized Reported
      badge before opening the Spot.

### Public import provenance and Spot-edit write containment

The additive Spot projection is backward compatible: released clients continue
to use `getPublicImportProvenance`, and new clients fall back to that callable
only in the browser while a legacy Spot has no projection. The field is not part
of the Typesense schema or extension allowlist. The one-time Spot writes below
will nevertheless wake the Typesense extension, so use the default small pages
and watch extension traffic during the live run.

- [ ] Reauthenticate Firebase, then deploy the compatible projection and
      write-containment Functions. Do not run the migration yet:

  ```sh
  firebase login --reauth
  npx firebase deploy --project prod --only functions:getPublicImportProvenance,functions:processImportChunkOnCreate,functions:retryFailedImportChunksOnCreate,functions:rebuildCommunityPagesOnImportWrite,functions:updateSpotFieldsOnWrite,functions:patchCommunityPageOnWrite,functions:rebuildAllCommunityPages,functions:syncPublicUserProfileOnWrite,functions:backfillPublicImportProvenanceOnCreate
  ```

      Verify every deployed gen 2 Function is active in `europe-west1`, a new
      import writes either an object or explicit `null`, and the compatibility
      callable still serves an older client.

- [ ] Immediately after the compatible Functions are verified, release the
      field-aware, browser-only fallback client through the normal `main`
      workflow. If `main` cannot be released immediately, pause import writes
      until the client release completes so no new Spot misses its projection.
      Verify localized SSR neither renders import-specific attribution nor
      invokes `getPublicImportProvenance`; projected and legacy production Spots
      must load their attribution after hydration.

- [ ] In Firestore, create
      `maintenance/run-backfill-public-import-provenance` with
      `{ dry_run: true, page_size: 100 }`. Wait for the trigger document to be
      deleted and `maintenance/public-import-provenance-backfill.status` to be
      `DONE`; review `counts.changed`, `counts.missing_imports`, and confirm
      `counts.written` is zero.

- [ ] Delete/recreate the same trigger document with
      `{ dry_run: false, page_size: 100 }`. Wait for retained state `DONE`,
      confirm `counts.written` matches the reviewed candidates, rerun it once to
      verify `counts.changed` and `counts.written` are zero, and sample an
      attributed import plus an import with no public credit.

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

- [ ] Release the direct Firebase JS SDK client through the normal `main` and
      mobile release workflows. Smoke-test production web and supported
      Capacitor builds: restore a signed-in session after reload, sign in and
      out, observe a realtime Firestore update without further interaction,
      call a `europe-west1` Function, upload with visible progress, initialize
      App Check, and register/receive web push. Confirm localized SSR returns
      real HTML and production logs contain no browser-only Firebase or
      `Service messaging is not available` errors.

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

### Flexible event timing, locationless discovery, and ownership claims

Keep these steps in order. The production `events_v1` schema is aligned with the
repository schema, including optional location bounds and the new searchable
presentation/type fields.

- [ ] Keep `legacyEventListCompatibilityEnabled()` enabled while supported
      released clients still list the canonical `/events` collection. During
      this window, create only globally discoverable public events, including
      through Admin SDK maintenance tools; Firestore rules enforce that
      constraint for client writes but cannot constrain Admin SDK writes.

  Success condition: released web and mobile clients can still list and open
  existing events, while the new client lists public events from
  `event_discovery`. Retire the switch and deploy Firestore rules only after the
  oldest supported mobile version no longer lists `/events` directly.

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
- [ ] Before adding browser age-assurance providers, require a signed or
      backend-to-backend provider result rather than accepting a client-asserted
      outcome. Map it into the existing PK Spot age bands, confidence classes,
      method categories, provider method, policy basis, verification timestamp,
      and audit record without storing unnecessary identity data.

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
