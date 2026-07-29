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

### Event weather forecast pagination and cache serialization hotfix

- [ ] Build and deploy the corrected `getWeather` Function:

  ```sh
  npm --prefix functions run build
  npx firebase deploy --project prod --only functions:getWeather
  ```

  Success condition: loading `/events/uk-nationals-2026` and the WPF Camp event
  produces successful `getWeather` callable responses, renders hourly forecasts
  beyond the provider's first 24-hour page, and creates `weather_cache` documents
  without any undefined event insight fields. Confirm the Function logs no
  longer contain Firestore serialization errors for
  `response.insights.wettestHour`.

### Organization image cropping and media processing

The Functions and storage rules must be deployed before the organization editor
client. Keep the steps in this order so no released client can target an
unsupported storage destination.

- [ ] Build and deploy the updated media processing, moderation, reconciliation,
      and audit Functions:

  ```sh
  npm --prefix functions run build
  npm run deploy:prod:functions
  ```

  Success condition: the production Functions deploy completes and the deployed
  image-processing and moderation code recognizes the `organization_media`
  prefix and the `organization` target kind.
- [ ] Deploy the updated production Storage rules:

  ```sh
  npx firebase use prod
  npm run deploy:rules:storage
  ```

  Success condition: an administrator can write a raster organization logo only
  through `media_intake/organization_media`, a non-administrator and SVG upload
  are denied, and direct client publication to `organization_media` is denied.
- [ ] From the organization admin UI, upload and approve a cropped organization
      logo. Verify the stable organization-ID filename produces 200, 400, and
      800 pixel derivatives under `organization_media`, and that `logo_url`
      contains the 800-pixel derivative URL.
- [ ] Only after the production verification above, release the client through
      the normal `main` workflow. Do not manually operate an App Hosting rollout.

### User profile privacy cutover

The backend rollout is deliberately separate from the client rollout. Do not
activate the final cutover while any supported client still reads another
user's authoritative `users/{uid}` document.

- [x] Deploy the additive profile Functions and compatible Firestore rules
      before releasing the new client:

  ```sh
  npm --prefix functions run build
  npx firebase deploy --project prod --only functions:getUserProfile,functions:syncPublicUserProfileOnWrite,functions:backfillPublicUserProfiles,functions:activateUserProfilePrivacyCutover,functions:updateAgePolicy,firestore:rules
  ```

  Success condition: all targets deploy successfully,
  `maintenance/user-profile-privacy` is still absent or not completed, and a
  released legacy client can still open profiles.

  Completed 27 July 2026. All selected targets deployed successfully; the
  production callable returned a limited profile and an anonymous legacy
  profile read still returned HTTP 200, confirming that cutover is inactive.

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

- [ ] In Google Play Console, confirm PK Spot is linked to Google Cloud project
      number `294969617102`, Play Integrity is enabled for `com.pkspot.app`, and
      the Play Integrity API is enabled in that Cloud project. The production
      Functions runtime service account must be able to obtain a
      `playintegrity`-scoped access token and call `decodeIntegrityToken`.
- [ ] Build and deploy the additive App Check-protected challenge, verification,
      invalidation, and challenge-cleanup Functions:

  ```sh
  npm --prefix functions run build
  npx firebase deploy --project prod --only functions:updateAgePolicyV2,functions:beginAgeAssuranceV3,functions:updateAgePolicyV3,functions:invalidateAgeAssuranceApprovals,functions:cleanupAgeAssuranceChallenges
  ```

  Success condition: all Functions are in `europe-west1`; requests without
  Firebase Auth and App Check are rejected; `updateAgePolicyV2` can update
  participation state but never adult eligibility; and the scheduler deletes
  expired one-time challenges without expiring assurance records.
- [ ] In Firebase App Check, confirm the production Android app uses Play
      Integrity and the production iOS app uses App Attest. Review metrics for
      invalid and unknown requests before the client release. App Check protects
      the callable boundary. Play Integrity's `requestHash` separately binds the
      exact Android age signal, one-time server challenge, and authenticated UID.
- [ ] Deploy the profile projection Functions and updated Firestore rules before
      the client:

  ```sh
  npm --prefix functions run build
  npx firebase deploy --project prod --only functions:getUserProfile,functions:syncPublicUserProfileOnWrite,functions:backfillPublicUserProfiles,firestore:rules
  ```

  Success condition: a self-declared 18+ policy cannot enable or project a
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
      assurance record, and the updated account settings explanation. Do not
      infer this release from the backend deploy.
- [ ] Verify production with representative test accounts: optional age sharing
      declined still permits core participation; a mandatory unresolved signal
      restricts participation; Tier A does not unlock a public profile; and an
      18+ Tier C or D result from a Play-installed, licensed build on a device
      meeting device integrity does.
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

- [x] Deploy the backward-compatible incident runbook Functions before a client
      release:

  ```sh
  npm --prefix functions run build
  npx firebase deploy --project prod --only functions:createSafetyIncident,functions:updateSafetyIncident
  ```

  Completed 27 July 2026. Both Functions deployed successfully.
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

- [ ] Confirm `processMediaIntake` and `runMediaIntakeBackfill` are deployed,
      direct writes to public media paths remain disabled in `storage.rules`,
      and a new test upload completes through the quarantine path.
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
