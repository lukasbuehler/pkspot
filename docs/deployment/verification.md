# Release verification

Browser, product-flow and operational checks. These entries are not a list of missing deployments; read each recorded prerequisite and success condition.

Use [the deployment index](../../DEPLOYMENT_TASKS.md) for the shared procedure and maintenance rules. Each task is owned here; do not duplicate it in another checklist.

### Temporary Lindenhof activity preview

- [ ] Before releasing 1.2, remove the development-only Lindenhof override in
      `SpotActivityService.displayMin` (`8CHFHRFUCozO9yeLEq6N`) and its preview-specific
      tests after visual review. It displays a fabricated `10+` activity band
      without writing to Firebase; production environments bypass it.
      Verify Lindenhof displays its stored `recent_activity_min_30d` normally after removal.

### Public status page

- [ ] After the web release, verify the Support page's System status link opens
      `https://status.pkspot.app` in a new tab. Before incorporation, re-check
      Better Stack Free eligibility; move to a permitted plan if needed.

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

### September 2026 dependency security hotfix

- Preserve Angular build-tool compatibility when updating security overrides:
  the builder pins Vite 8.1.5. Forcing Vite 7 ignores SSR prebundle defines and
  crashes `ng serve` in event replay. Refresh local dependencies with
  `npm ci --ignore-scripts` and restart development servers after this update.

- Release the reviewed main-based hotfix through the normal main/App Hosting
  workflow. Verify the localized web app renders real SSR HTML and key map,
  Event, authentication, and navigation flows still work. Angular framework,
  SSR and build tooling are aligned to 22.1.6 locally, including the malformed
  DOCTYPE SSR denial-of-service fix. This dependency update still needs the
  authorized web release. Do not include unfinished 1.2
  features in this release. PR-open workflow triggers remain unchanged.
- Verify an authorized production image upload completes moderation and
  derivative generation on the updated Sharp 0.35.4 Functions. Local image and
  emulator checks passed; deployed revisions and their source lockfiles were
  verified, but no new production test image was uploaded. Do not trigger
  backfills for this verification.
- Re-run root, production-only root, Functions and Horizn importer audits before
  release. All four audits reported zero vulnerabilities on 2026-09-29.
  Firebase CLI 15.31.0 supports the patched csv-parse and stream-json versions;
  retain its upstream integration rather than forcing those major versions
  into an older CLI. The scoped xcode UUID override uses the CommonJS-compatible
  11.1.1 release; project parsing and ID generation were verified locally.
- Assess the Angular host-binding advisory against native
  rendering before deciding whether a separate expedited store build is needed.


Keep an item unchecked until the action has actually been performed and verified.
Remove a completed release-specific section once no follow-up monitoring or
compatibility behavior remains to be tracked.

### Private recovery pauses

- [ ] Following the maintainer-reported rules deployment on 2026-09-07,
      verify recovery-pause access with owner and other-account test sessions
      before the client release.

  Success condition: a signed-in owner can list, create, update, and delete
  `/users/{uid}/recovery_pauses`, while another account cannot read or write
  those records. No Function, index, migration, or Typesense deployment is
  required.

### Canonical editable Spot and media reports

The new clients use callable upserts and withdrawals while the existing direct
Spot-report rule remains temporarily available for supported older clients. The
legacy bridge merges a rapid repeat into the reporter's canonical open report
and records the bridge transition without sending another moderation intake.

The web client is already merged to `main`. That does not deploy Firebase
Functions, so complete the backend rollout and verification below before
considering this report-lifecycle release complete.

- [ ] Verify the released web client and the
      next native release candidate: one user can submit, edit, and withdraw a
      Spot report and a media report; the first submission produces exactly one
      intake alert and safety case, edits produce neither, and withdrawal closes
      only its pending case as reporter-withdrawn. `/reports` must show the open
      report and terminal history; and another user cannot retrieve either report's
      reasons or details.

- [ ] Monitor Function logs and `report_claims` for legacy bridge activity,
      duplicate canonical acceptances, and callable validation errors during the
      supported-client window. The existing Firestore rules deliberately remain
      unchanged in this release so old direct Spot reports can still be bridged.

- [ ] Once supported-client adoption is confirmed, make a separate, reviewed
      rules release that removes direct client creation of `spots/*/reports/*`.
      Confirm bridge activity has remained at zero for the agreed observation
      window before retiring the legacy path.

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

### Event authoring permissions correction

- [ ] Release the client alias-reader fix with the next web/native update. Keep
      existing `event_slugs` aliases when changing canonical slugs. New server
      aliases must remain lowercase for older clients; the new reader also
      accepts the mixed-case aliases emitted by the initial authoring backend.

- [ ] Test authenticated live calls from the updated UI: an unverified admin can
      create a formal event and review suggestions; an unverified ordinary user
      can submit a suggestion but cannot create a formal event. Confirm the
      editor's follow-up update succeeds. With the updated client, verify a
      chosen URL slug is used and a duplicate slug creates no event. Older
      clients omit the optional slug and retain automatic URL generation. The three
      functions are deployed in `europe-west1`; ACTIVE state, localhost CORS
      preflight (204), and unauthenticated rejection (401) were verified for each.
