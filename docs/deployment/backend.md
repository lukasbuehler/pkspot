# Backend deployments and operational fixes

Pending Functions, indexes, provider fixes and data jobs. Check live state before deployment; an existing function may still need a source update.

Use [the deployment index](../../DEPLOYMENT_TASKS.md) for the shared procedure and maintenance rules. Each task is owned here; do not duplicate it in another checklist.

### External backend canary

- [ ] Investigate intermittent Better Stack failures before declaring the probe
      reliable. The monitor is configured and notifying (maintainer confirmed
      2026-09-29). Better Stack supplied exact Google Frontend HTML 500 headers:
      2026-09-28 18:28:22 UTC (incident 60 seconds) and 2026-09-29 01:14:22 UTC
      (incident 39 seconds), both text/html, 323 bytes. Project-wide ERROR logs
      in those windows contain no matching entry. These are not the handler's
      explicit JSON 503 response. Google logs in both five-minute windows contain
      instance startups and successful reads, but no matching 500 or handler
      Firestore error. A separate 05:31:45 CEST request logged a platform
      connection 503 (0.4 ms), followed by startup and 200 responses within
      three seconds. On 2026-09-29, deployed and verified concurrency=2,
      maxInstances=1, no minimum and timeout=10 seconds. Two concurrent
      authenticated probes returned 200 with no-store; a missing token returned
      401. Keep the existing Better Stack monitor and observe incident recurrence.
      Capacity/startup or frontend failure remains a hypothesis,
      not a confirmed Firestore outage. Instance startups occurred at 18:28:56
      and 01:14:28 UTC, after the supplied failure timestamps. If failures
      recur, compare frontend and direct Cloud Run endpoint behavior. Retain
      any future probe request IDs and observe subsequent probe cycles before
      closing this task; the supplied headers contain no correlation ID.
      Keep real failures non-200; do not add cached-success responses.
      Existing endpoint: `https://europe-west1-parkour-base-project.cloudfunctions.net/monitoringHealth`,
      `X-PKSpot-Health-Token` authentication, expected 200 plus `ok`.
      Authenticated GET/HEAD, unauthorized 401 and no-store were verified
      2026-09-28. Live Firestore failure injection remains untested.

### Live function alert follow-up (2026-09-28)

- [ ] Repair the expiry-query/index mismatch in
      `cleanupSafetyCaseSecurityMetadata`. The live 02:40 UTC run failed because
      `safety_case_rate_limits.expires_at` lacks a collection ascending index.
      The checked-in configuration also disables indexing for the queried
      `safety_case_access_tokens.expires_at` and `safety_case_sessions.expires_at`.
      Preserve TTL and older clients; add the required indexes before deploying
      any cleanup changes. Success: indexes ready and the next scheduled cleanup
      completes without `FAILED_PRECONDITION`.
- [ ] Prevent Typesense from indexing incomplete Spot creation writes. The two
      affected Spots were verified in live `spots_v2` with valid coordinates and
      ratings on 2026-09-28, so no repair/backfill is needed for them. Creation
      currently reserves an empty parent document, applies the CREATE edit, then
      normalizes fields in another trigger. The extension indexes intermediate
      snapshots; `location` is required and `rating` is the default sort field.
      Keep the existing search contract and older creation clients compatible;
      index only prepared records rather than inventing coordinates or making
      incomplete Spots searchable. Verify initial creation and subsequent edits
      without missing-field indexing failures.
- [ ] Verify real client traffic on deployed Overpass revision
      `getosmamenitytile-00004-zeq`, then release the client that sends
      `acceptUnavailable: true`. Confirm unavailable responses are retried rather
      than cached as empty tiles, stale fallback and eventual recovery. Legacy
      clients intentionally retain their 503/retry contract. Seven handler/cache
      emulator tests pass; no synthetic upstream outage was induced in production.
- [ ] Deploy the tested weather coverage correction, after backend approval:
      `npx firebase deploy --project prod --only functions:getWeather`.
      Google 404 now maps locally to callable `not-found` with
      `details.reason=coverage-unavailable`; real upstream failures retain
      `unavailable`. Forecast coverage gaps never become successful empty cached
      forecasts. Alert coverage gaps retain `alertsStatus=unavailable` without
      ERROR logging; provider, path and status diagnostics contain no secrets
      or coordinates. Existing successful payloads and client failure handling
      are preserved. Verify covered and uncovered locations through an
      App-Check-valid client, including recovery; confirm missing coverage no
      longer produces callable 503s. Local coverage/outage tests passed on
      2026-09-29; live behavior remains unchanged until deployment.

### Share cards (enabled for 1.2; release verification pending)

The lab (`npm run share-cards:lab`, port 4318) and backend use the same renderer.
The branded static fallback is generated with `npm run share-cards:fallback`
and checked in as `src/assets/banner_1200x630.png`.
- [ ] Deploy `functions:shareCardImage` to `parkour-base-project` to publish the
      updated bundled fallback. Verify a public entity without a prepared card
      returns the branded image. The static website fallback ships with the next
      normal web release; no runtime image generation is required.
- [ ] Deploy the centered photo crops and entity-specific faint backgrounds
      plus logo shadow (renderer `prototype-9`) and compatible
      extensionless-photo resolver in
      `prepareShareCard`, `shareCardImage`, and `cleanupShareCards`. Legacy Spot
      originals may be absent while `_800x800` derivatives exist. Verify a fresh
      Aumatten card (`idlc5zspvPuoau1YYBbG`) includes its two eligible photos.
      The local preview lab uses the same resolver; this does not deploy it.
Only Share clicks generate cards, regardless of rating. There is no backfill,
edit-triggered generation, or crawler-triggered generation. Spot and Event Share
buttons use the common service; community/profile targets are supported by the
backend for future share entry points. Static route artwork remains unchanged.

The seven share-card functions are deployed in `europe-west1` (2026-09-18).
A targeted temporary entry point avoided unrelated Stripe-secret discovery.
The public fallback returned a 1200×630 PNG and preparation without App Check
returned 401. The 1.2 web, staging and native release configurations enable
enhanced share cards; CI keeps preparation disabled for deterministic fixtures.
Existing image processors skip the `share_cards/` prefix.

- [ ] After successful preparation through the app, confirm generated Storage
      objects have no public ACL/download tokens and direct anonymous reads fail.
- [ ] Verify App Check for signed-in and signed-out preparation on web/iOS/Android.
      Test generation, reuse, timeout/offline plain-link sharing, and a second
      Share tap when browser gesture activation expires. Confirm sanitized
      `share-card` failures/outcomes in consent-enabled PostHog and backend logs.
      Native bridge failures must fall back to ordinary link sharing.
- [ ] Run native builds and device tests for `LinkPreview`: iOS uses
      `UIActivityItemSource`/`LPLinkMetadata`; Android uses a text/plain link with a
      ClipData thumbnail and no `EXTRA_STREAM`. Verify multiple receiving apps
      receive a link, never an image attachment. Native UI results are not proof
      of delivery or of the receiving app refreshing its cached preview.
- [ ] Before releasing the enabled share-card flow, complete the backend and
      native checks above. Native environment files are local: verify
      `features.shareCards: true` in both release configurations.
      Verify deployed SSR `og:image` and Twitter images point at the read-only
      gated endpoint for entity routes. No-card responses use bundled artwork;
      canonical page URLs remain unchanged. Preview text currently uses English
      or the source name fallback; cards are shared across UI locales.
- [ ] Verify privacy/deletion and selected-media removal/replacement block the
      old image immediately at the endpoint, before cleanup runs. Check source
      triggers delete stored cards and daily cleanup removes orphaned uploads
      and expired rate-limit records. Existing external preview caches cannot
      be revoked. Verify actual WhatsApp/Messages/Discord preview behavior.

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

### Production error follow-up (2026-09-09)

- [ ] Re-run `getSpotCreationDiagnostics` as an administrator. The old September 9
      cleanup-index readiness claim is superseded by the confirmed September 28
      expiry-query failure; track that repair only under Live function alert
      follow-up above, then verify the next scheduled run.
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

- [ ] Deploy the additive sender receipt trigger after local verification:
      `npx firebase deploy --project prod --only functions:onContactMessageReceiptCreate`.
      It reuses `CONTACT_RESEND_API_KEY`; existing support and Discord triggers
      stay independent. No client update or backfill is required. Submit a new
      contact message with a controlled email address and verify the receipt,
      Reply-To `support@pkspot.app`, and `contact_receipt_delivery/{messageId}`
      status `sent`. Non-email contact handles receive no receipt. A second
      message to the same address within an hour must record `recipient_cooldown`
      while support/Discord delivery continues. Verify malformed addresses,
      duplicate event delivery, and expired-event review before enabling retries.
      The receipt is currently English; localized receipts can follow separately.

Public contact links use `support@pkspot.app`. The Resend contact-email
trigger is deployed and active in `europe-west1`, bound to
`CONTACT_RESEND_API_KEY` version 1. Automatic email retries are disabled.
The existing Discord trigger remains unchanged. This integration forwards
contact messages to support; it is not general user notification email.

- [ ] Verify Reply-To behavior for contact emails. The maintainer confirmed actual
      support-mailbox receipt on 2026-09-28; Discord delivery is also confirmed.
- [ ] Decide whether to enable automatic contact retries. Resend requests carry
      an idempotency key and stop automatic delivery after 23 hours. Discord
      lacks provider idempotency, so ambiguous delivery plus retry can duplicate
      an alert. Until approved and deployed, failed emails need deliberate review
      and separately authorized replay.

- [ ] Check `contact_email_delivery` for `needs_review` after delivery outages.
      Automatic email delivery stops after 23 hours to avoid resending beyond
      the provider's idempotency window. Existing messages need a deliberate,
      separately authorized replay; deploying a creation trigger does not backfill.

### Private check-ins and delayed Spot activity

- [ ] Deploy the additive Spot-name snapshot correction with
      `npx firebase deploy --project prod --only functions:confirmCheckIn`.
      Verify a new check-in retains the name from both legacy string translations
      and `{text, provider}` translations. The updated client resolves names for
      existing nameless visits through the shared cached lookup; no history
      rewrite or backfill is required. The structured-name emulator write passed
      on 2026-09-29. This correction is local, separate from the earlier rollout.

Check-ins are enabled in development, web production, Android and iOS; CI disables
check-ins. Development uses production Firebase. On 2026-09-29 the four new
Functions and compatible `onCheckInCreate` update were deployed and verified
ACTIVE in `europe-west1`. All three callables return localhost preflight 204 and
reject requests lacking credentials with 401; their deployed source enforces
App Check. The statistics scheduler is ENABLED at 03:30 Europe/Zurich. The
aggregate composite index is READY. Five callable integration tests, two rollup
emulator tests and build/SSR checks passed. Authenticated device behavior and
controlled live data outcomes still need the checks below.

- [ ] After Functions deployment, verify missing Auth/App Check and direct writes
      cannot create new-style check-ins; public summaries permit single-document
      reads only. The required check-in rules are already deployed (source
      compared 2026-09-28). Do not bundle a full rules deploy with this batch:
      the local file also retires canonical Event-list compatibility and adds
      unrelated age/localization/planning rules that need their own review.
- [ ] Verify deployed accepted, excluded, duplicate, deleted and expired
      contributions with controlled fixtures. Buckets count distinct accepted
      accounts over 30 days and remain absent below two accounts. Rollup writes
      must preserve concurrent queued jobs; deletion must retain the four-hour
      travel guard without GPS and reject confirmation of a deleted occurrence.
      Local prerequisites: `npm run test:emulator:check-ins` and
      `npm run test:emulator:check-in-rollups`.
- [ ] On Android/iOS release candidates, verify App Check on all three callables,
      explicit location consent, and five-minute expiry. With location Off:
      Locate-me stays visible, opens the explanation, shows no dot, performs no
      nearby lookup, and emits no location-bearing logs. Persistent OS permission
      must appear only after the person's choice. Test private export, single/all
      deletion, and preservation of manual sessions, authored logs and legacy visits.
- [ ] After backend and device checks, release clients and verify Spot details
      makes one non-realtime read for the coarse “Recently trained” card. No
      visitor list, exact count, live presence, check-in notification, or public
      visited-Spot list may appear.

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

### Optional Other event category

- [ ] Deploy `updateEventFieldsOnWrite` with the normalization correction before
      releasing the client fix. A fallback `kind: other` must not re-add the
      deselected `other` category. Verify editing `event_categories` from
      `[jam, other]` to `[jam]` remains `[jam]` after the trigger settles.
      Preserve explicitly selected Other categories; do not bulk-remove them.
