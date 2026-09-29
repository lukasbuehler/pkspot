# Compatibility and privacy cutovers

Separately coordinated changes to supported-client access, rules and existing data. Do not bundle these into a routine backend deployment.

Use [the deployment index](../../DEPLOYMENT_TASKS.md) for the shared procedure and maintenance rules. Each task is owned here; do not duplicate it in another checklist.

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

The remaining legacy Community-event endpoints are `createCommunityEvent`,
`updateCommunityEvent`, `cancelCommunityEvent`, and
`demoteCommunityEventsWhenProfileBecomesPrivate`. Verify their deployment status
before enabling that flow. Formal-event authoring has separate remaining live
checks below.

- [ ] Before enabling legacy Community-event authoring, deploy its remaining
      Functions, Firestore rules, and the `events` active-community-listing
      composite index from `firestore.indexes.json`.

  Success condition: the callable endpoints require both Authentication and
  App Check; public Community-event documents project to `event_discovery`, while
  a direct client write cannot set tier, country, region, organizer-user, or
  broadcast fields.

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
