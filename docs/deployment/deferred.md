# Deferred feature rollouts

Features disabled or hidden in 1.2. These tasks are not permission to enable them and do not block the enabled release scope.

Use [the deployment index](../../DEPLOYMENT_TASKS.md) for the shared procedure and maintenance rules. Each task is owned here; do not duplicate it in another checklist.

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

For 1.2, `features.ageVerification` independently gates `google_play`, `apple`,
and `oneid`. OneID is disabled in release/staging/CI builds and enabled only in
web/iOS/Android development configurations. Native release environment files
are local; retain the shared provider defaults there. This is a client rollout
gate, not server authorization: existing backend availability, sandbox allowlists,
and eligibility checks remain authoritative. Do not globally disable the shared
OneID sandbox backend while development testing still uses it.

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
- [ ] The tester confirmed completing the Model Bank sandbox journey. Test any still-unverified Model Bank age outcome,
      cancellation and reconnect. Confirm real age policy and approval records remain
      unchanged. Return links now use the attempt locale and Settings → Account
      (`http://localhost:4200/<locale>/settings/account?oneid=return`); set a reachable HTTPS
      development URL before device testing. This is provider validation still to do,
      not implied by successful deployment or unauthenticated endpoint checks.
- [ ] Deploy `oneIdAgeVerificationCallback` to publish the styled return page.
      The layout is shared by sandbox and production; only the result copy differs.
      It keeps no-store/no-referrer, an explicit return link and no external assets.
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

### Planned training sessions (disabled until coordinated validation)

The new `planned_sessions` flow is separate from legacy Events and completed
SessionRecords. The development UI flag is enabled; production/native flags and
`PLANNED_SESSIONS_ENABLED` remain false. Local implementation does not enable
production session planning. Logging from a planned session now suggests matching
private activity records instead of always creating another manual record. Private
check-in history also links directly to the owner-only activity editor; these record
identifiers are stripped from analytics URLs. Neither action logs activity until the
user saves it. Legacy `/events/community/new` links now redirect
to the private-first session planner.

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
