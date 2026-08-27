# PK Spot data flow, projections, and Cloud Functions

This is the operational reference for data interactions in PK Spot. It answers:

- Which document is the source of truth?
- Which fields are normalized or copied elsewhere?
- Which client write or backend event starts a cascade?
- Which Cloud Function performs each step?
- How many logical Firestore reads, writes, and deletes can the step cause?
- Where should a maintainer look when two views disagree?

The reference describes the code on the current `development` branch. The deployed
backend can differ until Functions, rules, indexes, Typesense configuration, and
data migrations are released. Deployment order and outstanding production work
remain in [`DEPLOYMENT_TASKS.md`](DEPLOYMENT_TASKS.md).

## 1. How to read the operation counts

The counts below are **logical document operations performed by PK Spot code**,
not a Firebase invoice prediction.

- `R`, `W`, and `D` mean document reads, writes (create/set/update), and deletes.
- A transaction read or write is still one logical operation. A batch changes
  atomicity and round trips, not the number of document writes.
- A query returning `N` documents is written as `N R`. Empty queries still have
  a minimum billing charge. Queries can also incur index-entry reads.
- Client operations can add reads performed by Firestore Security Rules.
- Realtime listeners are billed when result documents are initially delivered,
  added, or updated, and can be billed again after reconnects.
- Trigger event payloads are not Firestore document reads. Any explicit `.get()`
  or query inside the handler is included.
- Storage downloads/uploads/deletes, FCM sends, Google Maps/Weather/Vision calls,
  Overpass calls, Discord webhooks, IndexNow submissions, and Typesense operations
  are listed separately from Firestore operations.
- Firestore triggers are at-least-once and unordered. Idempotent handlers normally
  converge, but a redelivery can repeat their reads and any non-idempotent side
  effects. See the official [Firestore billing guide](https://firebase.google.com/docs/firestore/pricing)
  and [Firestore trigger limitations](https://firebase.google.com/docs/functions/firestore-events).

Symbols used in formulas:

| Symbol | Meaning |
| --- | --- |
| `S` | Spots affected by an operation |
| `E` | Events scanned or returned by a query |
| `E_s` | discovery events linked to one Spot |
| `E_c` | discovery events linked to one community |
| `C` | affected communities |
| `R_e` | RSVP documents on one event |
| `V_s` | reviews on one Spot |
| `H_s` | challenges on one Spot |
| `F_u` | followers, follows, or registrations returned for one user/query |
| `M` | media objects or media items processed |
| `P` | page size in a resumable maintenance operation |
| `U` | documents whose derived data actually changed |

When an exact billed count matters, run Firestore Query Explain against the
production indexes and inspect Function execution logs. This document supplies
the code-level fan-out and the variables to measure.

## 2. System topology

```text
Angular / Capacitor clients
  |-- direct Firestore writes allowed by rules
  |-- HTTPS callable Functions (Auth and optional/required App Check)
  `-- Cloud Storage uploads
            |
            v
Canonical Firestore documents
  spots, events, users, organizations, imports, reports, edits, registrations
            |
            | Firestore / Auth / Storage triggers
            v
Normalized canonical fields and disposable projections
  event_discovery
  spots.upcoming_events
  community_pages + community_slugs
  public_user_profiles
  notification_intents -> users/{uid}/notifications
  aggregate counters and organization indexes
            |
            | separately configured Firestore-to-Typesense extension
            v
Typesense collections used by search and map discovery
```

All v2 Functions inherit `region: europe-west1` and `maxInstances: 10` from
[`functions/src/index.ts`](functions/src/index.ts), unless a Function declares
different options. `cleanupOnUserDelete` is the remaining first-generation Auth
trigger. Storage handlers declare the production bucket and their own memory,
CPU, timeout, and instance limits.

## 3. Source-of-truth and projection catalog

| Data | Source of truth | Derived / denormalized copies | Maintainer rule |
| --- | --- | --- | --- |
| Spot identity and map data | `spots/{spotId}` plus approved Spot edits | search helpers on the Spot, `community_pages` Spot previews, Typesense Spot document | Change canonical Spot data or its edit workflow; never edit a community preview as if it were canonical. |
| Spot ratings | `spots/{spotId}/reviews/{reviewId}` | `spots.rating`, `num_reviews`, `rating_histogram`; community and Typesense previews | The aggregate is rebuilt from all review docs on every review write. |
| Spot challenges | `spots/{spotId}/challenges/{challengeId}` | `spots.top_challenges` (max 3), `num_challenges` | Challenge documents are canonical; the Spot fields are a card preview. |
| Event | `events/{eventId}` | normalized compatibility/helper fields, `event_discovery/{eventId}`, Spot and community event previews, Typesense Event document | Private/draft data must not be recovered from `event_discovery`; it is deliberately public-only and disposable. |
| Event RSVP | `events/{eventId}/rsvps/{uid}` | `events.rsvp_counts` -> `event_discovery.rsvp_counts` -> `spots.upcoming_events[].rsvp_counts` | Counts are exact recomputed aggregates, not client-maintained increments. Community previews currently carry the field when the page is fully rebuilt, but RSVP-only changes do not trigger their incremental refresh. |
| Event registration | registration doc and `events/{eventId}/admission/state` in one transaction | promotion notification intent; optional reminder relationship | RSVP and registration are distinct. Registration capacity counts do not replace `rsvp_counts`. |
| Community | Spot addresses/landing data, events' `community_keys`, authored community knowledge, and merge docs | `community_pages/{key}`, `community_slugs/{slug}` | Generated sections are disposable; authored cards/links are preserved and merged into regenerated pages. |
| User profile | `users/{uid}` | adult opt-in `public_user_profiles/{uid}`, sitemap/search data | Public projection is field-limited. `getUserProfile` is the viewer-aware read boundary. |
| Private user state | `users/{uid}/private_data/main` and private subcollections | selected public counters such as `visited_spots_count` | Never copy private arrays or notification preferences into public profiles. |
| Follow graph | `users/{uid}/following`, `followers`, and `follow_requests` | `users.follower_count`, `following_count`, notification intents | Both edge directions are intentionally stored; actions must keep them consistent. |
| Organization relationships | Spot `stewardship` / `management` | embedded organization snapshot and `organizations/{id}/verified_spots` / `managed_spots` | Organization name/logo changes fan out to every linked Spot and index entry. |
| Import provenance | private `imports/{importId}` metadata | sanitized `spots.public_import_provenance` | The Spot projection is the public read path. The callable is a cached compatibility fallback. |
| Media upload | quarantined `media_intake/...` object and metadata | review/status docs, approved Storage object, Spot edit or profile URL, resized derivatives | Intake is not public until scanning/approval and side effects complete. |
| Notifications | deterministic `notification_intents/{intentId}` | `users/{uid}/notifications/{intentId}` plus FCM delivery | The intent is durable/cancelable. The user feed is a projection; FCM acceptance is not proof of display. |
| Safety case | `safety_cases/{caseId}` plus private intake/events | projections from legacy reports/actions, outbox and hold docs | Case actions can deliberately mutate or hold the reported target; inspect the case event trail before repairing target data. |
| Sitemap | Firestore sources at generation time | public Storage `sitemap.xml` and IndexNow submissions | The file is a snapshot, regenerated nightly or by the manual HTTP handler. |
| Weather/OSM | upstream APIs | bounded Firestore cache docs | Cache documents are disposable. A cache hit avoids the upstream request, not the initial cache document read. |
| Search | Firestore documents selected by the installed extension | Typesense collections | The extension's live configuration is external to this repo; JSON schemas and alignment tests are the checked-in field contract, but the deployed source collection must be verified separately. |

## 4. Client interaction boundaries

The Angular/Capacitor app uses
[`FirestoreAdapterService`](src/app/services/firebase/firestore-adapter.service.ts)
so web and native code share collection paths while using their platform SDKs.
It uses [`FunctionsAdapterService`](src/app/services/firebase/functions-adapter.service.ts)
for SDK callables, direct native calls, and same-origin SSR/public-callable proxying.
Callable Auth/App Check tokens are supplied by the Firebase protocols; each
handler still performs its own authorization checks.

### SSR App Check identity and hosting adapters

SSR uses the same Firebase Web SDK and `FIREBASE_APP` injection boundary as the
browser, but it cannot use browser reCAPTCHA, Android Play Integrity, or Apple
App Attest. A Firebase app ID identifies the SSR client in token claims and
metrics; it is public metadata and is not sufficient proof for minting a token.

The hosting-neutral contract is
`SsrAppCheckTokenMinter.mintToken(appId)`. `CachedSsrAppCheckTokenMinter`
deduplicates simultaneous renders, caches the returned short-lived token, and
requests a replacement five minutes before expiry. The resulting token is
provided to the Web SDK through `CustomProvider` before Firestore initializes.
This path performs **0 Firestore reads and 0 Firestore writes**. One uncached
App Hosting mint normally entails metadata/credential discovery when needed,
an IAM `signBlob` request, and an App Check `exchangeCustomToken` request.

The Node/App Hosting adapter is
`FirebaseAdminAppCheckTokenMinter`. It calls Firebase Admin
`createToken(appId)` using Application Default Credentials supplied by the App
Hosting/Cloud Run runtime. It does not store a service-account JSON key or an
App Check debug token. `PKSPOT_SSR_FIREBASE_APP_ID` selects the dedicated SSR
Firebase Web app. If it is absent, SSR deliberately retains the current
unattested behavior so the provider can be deployed and observed before
enforcement; a configured app ID without a usable token minter fails closed.

#### Future Cloudflare Workers + static assets adapter

Static assets do not require SSR App Check: Cloudflare can serve them directly.
Only requests rendered by the Angular SSR Worker need a token. Running Angular
or enabling Workers' Node.js compatibility does not give the Worker a Google
runtime identity, so the Worker must supply its own implementation of
`SsrAppCheckTokenMinter`; it must not import the App Hosting
`firebase-admin`/ADC adapter.

The Cloudflare adapter must obtain a trusted signing capability without putting
a private key in the static bundle. Preferred order:

1. Workload Identity Federation or another short-lived identity exchange that
   can authorize the Worker to sign the Firebase custom assertion.
2. A narrowly scoped Google-hosted token broker that authenticates the Worker
   and returns only a short-lived App Check token.
3. A Cloudflare runtime secret containing signing material only as a last
   resort, with rotation and leak response documented before use.

The adapter returns `{ token, expireTimeMillis }`; the shared cache and Angular
Firebase provider remain unchanged. Keep secrets in Worker bindings, never in
`public/`, the static-assets manifest, client environment files, HTML, logs, or
hydration state. Prefer a separate Firebase Web app such as
`PK Spot SSR Cloudflare` so App Check metrics, IAM changes, rollback, and
credential revocation remain independent from App Hosting. Before switching,
run the same localized Spot/event initial-HTML tests with Firestore enforcement
enabled in a non-production project.

### Direct client writes

| User interaction | Primary writes | Immediate backend cascade |
| --- | --- | --- |
| Create/edit profile | `users/{uid}` and `private_data/main` | signup number on create, public-profile sync, follower/visited counters where relevant, Typesense if the external user projection is enabled |
| Follow public account | both `following` and `followers` edge docs | two full edge-count queries, notification intents, user profile projections after count writes |
| Request/accept private follow | `follow_requests` then both edge docs | request/accept notifications and the same count fan-out |
| RSVP | `events/{eventId}/rsvps/{uid}` and client compatibility arrays in `private_data/main` | RSVP recount, reminders, event projection, Spot preview refresh |
| Subscribe to event updates | `live_update_subscribers/{uid}` | reminder reconciliation |
| Create/update/delete event | `events/{eventId}` | normalization, discovery projection, event notifications, Spot/community previews, waitlist reconciliation, Typesense |
| Review Spot | `spots/{spotId}/reviews/{uid}` | full rating recount -> Spot write -> community/search/notification qualification |
| Add/update challenge | `spots/{spotId}/challenges/{challengeId}` | full challenge query -> Spot card aggregate |
| Propose Spot edit | `spots/{spotId}/edits/{editId}` | edit application/review/voting and outcome notifications |
| Create Spot | `createSpotSubmission` callable | atomic empty Spot + CREATE edit + idempotency claim; edit trigger applies payload |
| Report Spot/user/media | report collection or submission callable | public warning/media removal, safety-case projection, Discord, notification intents as applicable |
| Follow community | `users/{uid}/community_follows/{key}` | future event/digest fan-out; merge migration can move the follow |
| Register push client | `users/{uid}/notification_registrations/{registrationId}` | read by delivery; invalid tokens are disabled by the sender |
| Mark notification read/action | notification document or `performNotificationAction` | action can atomically change follow edges or RSVP/private event arrays |
| Upload media | Storage `media_intake/{uid}/{uploadId}/...` | moderation, release, status/review docs, then Spot edit or profile update |
| Contact message | `contact_messages/{id}` | Discord webhook |

Direct writes cost one client write per changed document before rules-dependent
reads and trigger cascades. The native adapter writes mobile-safe plain coordinate
objects; server normalization adds/maintains GeoPoints and search helpers where
supported.

### Client-visible callables

The shipped app currently calls: `getWeather`, `getOsmAmenityTile`,
`resolveMapShortLink`, `beginAgeAssuranceV3`, `updateAgePolicyV3`, legacy
`updateAgePolicyV2`, `getUserProfile`, `getPublicImportProvenance`, event
registration/ownership/live-update callables, community edit/merge callables,
Spot creation/edit/duplicate callables, notification migration/actions, media
report/moderation callables, and public/admin safety-case callables. Callables not
used by normal UI are maintenance or administrator tools; they remain listed in
the complete inventory below.

## 5. Spot write normalization and fan-out

### `spots/{spotId}` write

`updateSpotFieldsOnWrite` is the main Spot listener:

1. It ignores `typesense`, maintenance IDs, and writes that only change
   `public_import_provenance`.
2. If coordinates changed or the address is unusable, it calls Google reverse
   geocoding and may write a normalized address.
3. It derives `amenities_true`, `amenities_false`, storage thumbnail URLs,
   `name_search`, `description_search`, default `rating`/`num_reviews`, tile
   coordinates, community/landing fields, `bounds_raw`, `bounds_center`, and
   `bounds_radius_m`.
4. When needed, it performs nine z16 neighboring-tile queries, filters candidates
   to 5 metres, and stores `duplicate_check`.
5. It rebuilds every community candidate derived from the Spot's before/after
   address/landing state.
6. It writes the Spot only when a derived value changed, preventing an infinite
   self-trigger loop.

Base normalization cost with no geocode/duplicate/community change: `0 R`,
`0..1 W`. Duplicate detection adds 9 queries and the returned candidate reads.
Community cost for each affected candidate is approximately:

```text
active merge query + country Spot query + existing page read + slug query
+ slug conflict reads/writes + event_discovery query + optional child-page query
+ 0..1 community page write
```

The exact count varies with candidate scope, existing aliases, merges, and child
communities. This is intentionally a high-fan-out path; use Function logs and
query result sizes when diagnosing a costly Spot update.

Any Spot update can also wake the separately installed Typesense extension and
`onCommunitySpotRecommendationWrite`. The digest trigger writes only on the
transition from not-qualified to qualified.

### Review, challenge, and organization cascades

- Review write: `V_s R + 1 W` to rebuild `rating`, `num_reviews`, and histogram.
  The resulting Spot write then runs the normal Spot fan-out above.
- Challenge write: `H_s R + 1 W` to store count and at most three released,
  media-bearing challenges, ordered by completion and post count. It then runs
  the Spot listener, but community rebuild is skipped when no community source
  field changed.
- Organization identity update: `S_stewarded + S_managed` query reads and
  `2 * (S_stewarded + S_managed) W`: one embedded Spot snapshot and one
  organization index document per relationship. Spot writes then normalize and
  can sync search/community data.

### Spot creation

`createSpotSubmission` reads the idempotency claim and user in a transaction.
For a first attempt it writes exactly three documents: an empty Spot, a CREATE
edit, and `spot_create_submissions/{hash}`. A replay reads the same two documents
and updates only the claim. `applySpotEditOnCreate` applies the CREATE edit and
records hourly diagnostics; deterministic submission IDs prevent duplicate
Spots when the client retries.

## 6. Events, RSVP counts, and embedded previews

### Event normalization

`updateEventFieldsOnWrite` makes the event model additive and backward compatible:

- `publication_state` and legacy `published` are kept consistent.
- Missing defaults are added for visibility, discoverability, kind,
  schedule/lifecycle/priority, attendance, notification policy, and private
  viewer policy.
- An explicit normalized kind adds a closest legacy category for old clients.
- Valid organization owners receive compatible access defaults.
- Legacy exact timing remains available while server-derived timestamp seconds,
  location/bounds/promo helpers, series-role/qualification keys, venue flags,
  time zone, and fallback description are maintained for search.
- Invalid normalized fields are logged; existing invalid choices are not
  silently replaced.

The handler uses the event snapshot in the trigger and performs `0..1 W`.
That write is loop-safe because only changed fields are written.

### Public discovery projection

Every canonical event write invokes `syncEventDiscoveryOnEventWrite`:

- globally discoverable, public, published events with a name/start/end become
  `event_discovery/{eventId}`;
- private, limited, draft, deleted, or incomplete events delete that projection;
- legacy timestamp-shaped maps are converted back to Firestore `Timestamp`s;
- the projection copies only `EVENT_DISCOVERY_FIELDS`, including `rsvp_counts`.

Cost: `1 W` or `1 D` per canonical event write. The projection is disposable and
must never become a write source.

### Worked RSVP cascade

Suppose the event has `R_e` RSVP documents, links to `S` unique Spots, and affects
`C` community keys.

1. Client writes one RSVP document: `1 W`.
2. `countEventRsvpsOnWrite` reads all `R_e` RSVP docs and writes one exact
   `{going, interested, notgoing, total}` aggregate to the event:
   `R_e R + 1 W`.
3. `onEventRsvpNotificationWrite` reads the event for Going/Interested, then
   reads one subscription and up to three deterministic reminder intents; it
   writes/cancels at most three intents. Removing an RSVP reads up to three
   intents and updates only unsent ones.
4. The event write invokes normalization (`0..1 W`), notification-source logic,
   waitlist reconciliation (normally no-op), and the discovery projection:
   `1 W` to `event_discovery/{eventId}`.
5. `syncSpotUpcomingEventsOnEventWrite` notices `rsvp_counts`. For every affected
   Spot it reads that Spot, queries all `E_s` discovery events linked to it,
   sorts/filter them, retains at most two, and writes the Spot only if different:
   `S * (1 + E_s) R + 0..S W`.
6. Each changed Spot preview may wake Spot normalization and the Typesense
   extension. The Spot listener normally performs no write because
   `upcoming_events` is not a community-source/helper field.

Therefore the core application-code formula for an RSVP that changes every
linked preview is:

```text
Reads  = R_e + reminder reads + S * (1 + E_s)
Writes = 1 RSVP + 1 event aggregate + 1 event_discovery + up to 3 intents + S Spots
```

Community event preview incremental refresh deliberately does **not** include
`rsvp_counts` in its change detector, so an RSVP-only update does not rewrite
community pages. A later full community rebuild will copy the then-current RSVP
aggregate into its event preview. Event and Spot event cards should be compared
against the canonical event first when debugging a mismatch.

### Spot event preview repair

`backfillSpotUpcomingEvents` reads all `E` discovery events once, deduplicates
their linked Spot IDs, then for each Spot performs `1 + E_s R` and `0..1 W`.
It does not scan every Spot. It deletes the maintenance trigger on completion.

### Community event previews

On relevant discovery changes, `rebuildCommunityEventPreviewsOnEventWrite`
uses the union of before/after community keys. Per community it reads `E_c`
linked discovery documents plus the page (`E_c + 1 R`) and writes the page only
when the two-event preview changed (`0..1 W`). It includes published,
non-expired events starting within six months, ordered by start.

### Event registration and waitlist

`registerForEvent` transactionally reads event, user, admission state, existing
registration, and any membership/access documents needed for visibility and
eligibility. It writes the registration and admission state (`2 W`).
`cancelEventRegistration` reads the same base documents plus at most one
waitlisted registration and writes the cancellation, optional promotion, and
state (`2..3 W`). Promotion creates a deterministic notification intent.
Capacity/lifecycle changes can drain the waitlist in pages of at most 200,
up to 25 transactions; each page reads event, state, and returned waiters and
writes every promoted registration plus the state.

## 7. Community pages

Community pages combine generated and authored data:

- generated: membership, priority-sorted Spot previews, standout/category picks,
  top-rated/dry sections, counts, bounds, tiles, breadcrumbs, child communities,
  event previews, aliases, and merge redirects;
- preserved authored data: links, public-safe info cards, resources,
  organisations, athletes, events, selected image, and Maps place ID;
- private signed-in link-card details: `community_pages/{key}/private_info/link_cards`.

A community is published only after `COMMUNITY_PAGE_MIN_SPOTS`. Generated legacy
sections retain at most 10 Spots, standout picks at most 4, category/fallback
picks at their constants, child communities at most 8, and event previews at
most 2. Spot ordering uses the shared `getSpotPriority` policy.

### Incremental Spot rebuild

For every before/after community candidate, the generator queries all Spots in
that country and filters membership in memory. It reads existing merge/page/slug,
event preview, and possible child-community data, then conditionally writes the
page and aliases. It subsequently refreshes the affected country page's embedded
children. A location/address/landing change can therefore rebuild both old and
new locality/country candidates.

### Full rebuild

`rebuildAllCommunityPages` performs:

```text
N_spots R
+ N_merges R
+ per generated community: existing page/slug/conflict/event/child reads
+ N_existing_pages R
+ per written/deactivated community: page and alias writes
+ country child refresh reads/writes
+ 1 maintenance warning write or delete
+ 1 trigger status write
```

This is not a cheap per-request operation. It is a maintenance job and should be
run with the production checklist and logs open.

### Import completion and provenance

An import write first compares its sanitized public provenance. When it changes,
two Spot queries find legacy `import_id` and `source` links. For every block of
up to 200 unique Spots a transaction re-reads the import and each Spot and writes
only changed projections. Approximate cost for `S` unique linked Spots:

```text
Reads  = query results (up to 2S, deduplicated in memory) + S + ceil(S/200)
Writes = 0..S
```

Provenance-only Spot writes are ignored by normal Spot/community normalization,
but may still wake external infrastructure configured directly on the collection.

When an import reaches `COMPLETED`/`PARTIAL`, the community rebuild reads its
imported Spots, queries each affected country once, regenerates affected pages,
removes `community_rebuild_deferred` from every imported Spot, and writes one
maintenance result. Deferred writes prevent every imported Spot from rebuilding
communities independently while the chunk is loading.

## 8. Users and social aggregates

### Profile creation and public projection

- New `users/{uid}`: `assignSignupNumberOnCreate` transaction reads the fresh
  user and `counters/users`, then writes both (`2 R + 2 W`). A retry with an
  assigned number exits.
- Every user write: `syncPublicUserProfileOnWrite` transaction reads the user
  and existing public projection (`2 R`) and writes/deletes at most one public
  profile. Only adult opted-in public fields are projected.
- `getUserProfile`: always reads the target (`1 R`). Owner/public reads stop
  there. Restricted signed-in viewers add the viewer read and, depending on
  audience, follower and reciprocal-follow reads: maximum `4 R` total.

### Counts and check-ins

- Like write: `L_post R + 1 W` for `posts.like_count`.
- Follower write: `F_u R + 1 W` for `users.follower_count`.
- Following write: `F_u R + 1 W` for `users.following_count`.
- Check-in create: `1 W` using `arrayUnion` on private `visited_spots`.
- Private-data write: computes unique visited IDs from the trigger payload and
  performs `1 W` to `users.visited_spots_count`.

The count functions currently recount full subcollections rather than using
distributed counters. Their cost grows linearly with the relationship count.

### Age assurance

Age-policy callables read the authenticated user and platform signal/evidence
documents, then write `users.age_policy` plus short-lived challenge/evidence
state as applicable. The v3 flow keeps ranges/evidence strength, not exact
birthdays, in the product model. `cleanupAgeAssuranceChallenges` deletes expired
challenge documents; `invalidateAgeAssuranceApprovals` is an admin dry-run/apply
maintenance path. Legacy `updateAgePolicy` and `updateAgePolicyV2` remain exported
for released-client compatibility.

## 9. Media Storage pipeline

### Moderated intake

Normal uploads enter `media_intake/{uid}/{uploadId}/{filename}` with destination
and target metadata. `processMediaIntakeUpload`:

1. parses and validates path/metadata;
2. writes `media_upload_reviews/{uploadId}` as scanning and
   `media_upload_status/{uploadId}` as processing (`2 W`);
3. downloads the object, validates type/content, strips reliance on client
   claims, hashes it, and invokes the media safety provider;
4. on allow, writes one approved Storage object, applies one target side effect,
   updates review and status (`2 W`), and deletes the intake object;
5. for a Spot, the side effect reads the uploader (`1 R`) and creates one
   APPEND Spot edit (`1 W`), which then enters the edit review/application flow;
6. for a profile, it updates the user (`1 W`), which refreshes the public profile;
7. on a flagged result, it writes review/status plus one scanner report and,
   for reportable matches, one restricted safety incident. Those writes invoke
   report/safety-case projections and notifications.

Object-finalize triggers can run more than once. Review IDs, upload IDs, released
object metadata, and side-effect existence checks provide convergence. Spot edit
existence checks currently scan all edits for that Spot when replay repair is
needed (`E_spot R`).

### Image and video derivatives

- Eligible image finalize: download one object, generate 200/400/800 derivatives
  (optionally 1600 in maintenance), save each derivative without EXIF/GPS, and
  move the original under `resized_originals/`. Derivative finalizes are ignored.
- Video finalize: download original, create compressed MP4 and thumbnail, upload
  two objects, then delete original. `comp_` files are ignored by the video
  handler; the thumbnail can enter the image-resize handler unless excluded by
  its path/name rules.
- These operations have no normal Firestore cost. Maintenance backfills list
  Storage objects and write one summary/delete one trigger document.

`markMediaUploadSafe` is an admin-only release path. It reads the review and
approved/quarantine objects, prevents release of reportable matches, applies a
missing target side effect, updates review/status/report, creates a moderation
action, and deletes quarantine. The exact operation count depends on audit vs.
intake and whether the approved object or side effect already exists.

## 10. Notifications

### Durable intent and feed projection

Producer triggers create deterministic `notification_intents/{intentId}` docs.
Every intent write invokes `onNotificationIntentWrite`:

- unchanged feed-relevant fields: `0 R / 0 W`;
- create/update: `1 R` for recipient private preferences + `1 W` to
  `users/{uid}/notifications/{intentId}`;
- delete: `1 W` to mark the feed projection inactive.

`onImmediateNotificationIntentCreate` also calls the same projection helper and
immediately claims due intents. Because the generic write trigger runs too, a
new due intent can cause two preference reads/feed writes; the deterministic
same-data projection makes this convergent but it is still logical work.

### Delivery

`sendDueNotificationIntents` runs every minute. Each run performs two queries,
each limited to 100: stale `processing` intents and due `pending` intents. It
rewrites every stale result to pending. Each due intent:

1. transactionally reads and claims the intent (`1 R + 1 W`);
2. conditionally reads event/subscription/community-follow validity;
3. reads recipient private preferences (`1 R`);
4. queries up to 500 enabled notification registrations (`N_reg R`);
5. sends FCM batches grouped by locale/platform;
6. disables each invalid registration (`0..N_invalid W`);
7. writes final sent/skipped/retry/failed state (`1 W`).

The intent is tried at most three times, five minutes apart. FCM acceptance is
stored in privacy-safe delivery diagnostics but does not prove OS display, click,
or action handling.

### Producers and fan-out

- Follow/report/edit/community-info triggers generally read 0..3 source/target
  docs and create/cancel one deterministic intent.
- RSVP reminders support offsets 24h, 2h, and 30m. One RSVP relationship can
  read one subscription plus three existing intents and write at most three.
- Event source changes read all RSVP recipients and, when updates are allowed,
  all live-update subscriptions, then create/cancel/re-time intents per recipient.
- Community event discovery expands merge keys, queries every matching follow
  document in pages of 500, reconciles existing event intents, and writes at
  most one intent per unique recipient.
- A newly qualifying Spot similarly queries followers and writes one digest item
  per unique recipient after reading each recipient's time zone.
- The 15-minute digest job reads at most 500 due items. For each item it re-reads
  the Spot and every relevant follow. It creates at most one intent per
  user/week and updates every consumed item.

### Notification actions

`performNotificationAction` starts with three transaction reads: intent, user
feed projection, and undo state. The selected action adds event/user/edge reads
and atomically writes the relationship or RSVP, compatibility private arrays,
undo record, and feed action state. Those edge/RSVP writes invoke the same count,
reminder, and projection cascades as direct client actions.

## 11. Reports, moderation, and safety cases

Legacy report sources are:

- `spots/{spotId}/reports/{reportId}`
- root `reports/{reportId}` for media/scanner reports
- legacy `media_reports/{reportId}`
- `user_reports/{reportId}`
- `moderation_actions/{actionId}`

Each create can independently invoke a report handler, a notification producer,
and a safety-case projection. Projection handlers use deterministic case IDs and
transactions so redelivery does not create duplicate cases. A newly projected
case normally writes the public case, private intake, first event, optional
access token, and optional email outbox entry. Existing cases are read and
skipped or amended.

Spot reports additionally write public warning fields onto the Spot. Resolving a
report reads all reports for that Spot before removing the warning, so the cost
is `R_reports + 1 report W + 0..1 Spot W`. Media report processing can
transactionally remove the reported media item from its Spot or event. Those
target writes then invoke normal Spot/event projections.

Safety administration is intentionally variable and potentially destructive:
case decisions can create moderation actions, update subject documents, remove
or hold media, restrict user/public profiles, archive subcollections under
`safety_case_holds`, write event/outbox records, and later restore held data.
Use the case event trail, hold document, source report, and moderation action as
a unit. Never estimate a decision as a single write; inspect the selected action
and subject kind in [`safetyCaseAdminFunctions.ts`](functions/src/safetyCaseAdminFunctions.ts).

Maintenance paths (`backfillSafetyCases`, `runSafetyDataCleanup`, reporter
identity backfill, report-warning migration, Typesense resync, metrics aggregation,
and security-metadata cleanup) deliberately scan entire collections or bounded
expiry queries. Their result counts and maintenance docs are the authoritative
per-run totals.

## 12. Imports, search, caches, and sitemap

### Import chunks

One chunk processing attempt reads its import (`1 R`), marks the chunk processing
(`1 W`), writes one deterministic Spot per valid row (`S W`), then transactionally
re-reads import and chunk (`2 R`) and writes both completion counters (`2 W`).
Failure writes the chunk, reads import, and writes import (`1 R + 2 W`). Stable
Spot IDs make retries overwrite rather than duplicate. Each Spot write invokes
normalization, but `community_rebuild_deferred` suppresses incremental community
regeneration until import completion.

### Public import provenance compatibility

`getPublicImportProvenance` has a per-warm-instance 15-minute, 1,000-entry cache.
On a cache hit it performs `0 R`. On a miss it queries up to one Spot by
`import_id`, then if empty up to one by `source` (`1..2` query reads/minimum
charges). If the Spot lacks the projection, it reads the import (`+1 R`). The
rate limiter is also per instance, not a globally exact quota.

### Typesense

Checked-in contracts:

- `typesense_spots_v2`
- `typesense_events_v1` aligned to the public `event_discovery` shape
- `typesense_communities_v1`
- `typesense_users_v1` sourced from public profiles when enabled

The schemas live in [`typesense/`](typesense/) and are verified against Firestore
field maps by
[`typesense-alignment.spec.ts`](src/db/schemas/typesense-alignment.spec.ts).
The Firebase extension installation/configuration is **not checked into this
repository**, so its deployed source collections, allowlist, retry settings, and
exact Typesense request counts must be verified in Firebase Extensions/Function
logs. In particular, the schema/alignment code treats `event_discovery` as the
public search shape while comments in `eventFunctions.ts` still describe the
canonical Event as extension input. The repository alone cannot prove which
collection production watches; verify it before debugging privacy or indexing
behavior. Every watched Firestore create/update/delete can cause one extension
invocation and one corresponding Typesense upsert/delete, including
server-derived writebacks.

### Weather and OSM caches

- `getWeather`: one cache read; fresh hit returns. Expired hit adds one delete.
  Miss calls the selected upstream and writes one cache document. Alert attachment
  can add alert-cache reads/writes. Cleanup runs every five minutes, queries two
  cache collections with a 150 limit each, and deletes every returned doc.
- `getOsmAmenityTile`: one initial cache read, then a transaction/lease read-write
  on stale/miss; a successful upstream fill writes one cache document. Failure
  writes backoff state and can return stale data. Daily cleanup runs at most four
  queries of 300 and deletes all results.
- `resolveMapShortLink`: no Firestore operations. It performs at most six HTTPS
  requests (initial plus five redirects), validates every hop, and returns only
  supported Google/Apple Maps destinations.

### Sitemap

Both sitemap handlers use the same generator. Each run streams:

```text
all Spots + opted-in public user profiles + all community pages
+ all event_discovery docs
```

That is `N_spots + N_public_users + N_communities + N_discovery_events` document
reads, followed by one Storage object write/make-public operation and batched
IndexNow network submissions. It emits only the canonical `pkspot.app` host from
the sitemap helper constants; `origin.pkspot.app` is not a data source.

## 13. Maintenance and debugging rules

1. Start from the canonical document, not the UI that exposed the mismatch.
2. Follow the exact trigger chain in this document and compare update timestamps,
   source IDs, and aggregate values at every projection hop.
3. Check whether the relevant Function version is actually deployed. A local
   source fix does not repair production projections by itself.
4. Search Function logs by canonical document ID, trigger path, intent ID,
   upload ID, import ID, or safety case reference. Do not log raw Auth action
   codes, pasted map URLs, notification tokens, emails, or private report text.
5. For a projection mismatch, first decide whether the source changed, the
   projection trigger failed, or a later stale write won. Firestore trigger order
   is not guaranteed.
6. Prefer the documented idempotent backfill/maintenance trigger. Do not hand-edit
   many projections unless the generator cannot reconstruct them.
7. Before running maintenance, estimate formulas using production counts and
   verify retry/resume behavior. A maintenance document records intent; it does
   not authorize a production deployment or data mutation.
8. After repair, verify the canonical document, every intermediate projection,
   Typesense if applicable, and one old-client-compatible read shape.

### Common mismatch trails

| Symptom | Compare in this order |
| --- | --- |
| Event page RSVP count differs from Spot card | RSVP subcollection -> `events.rsvp_counts` -> `event_discovery.rsvp_counts` -> matching `spots.upcoming_events[]` |
| Event missing from search/map | canonical publication/visibility/discoverability/timing -> `event_discovery` -> Typesense Event document -> client filters |
| Community ordering/count wrong | canonical Spot rating/access/report/media -> Spot helper/landing fields -> regenerated `community_pages` sections -> Typesense community document/client fallback |
| Spot search differs from Spot detail | canonical Spot -> normalization helper fields -> Typesense Spot doc -> search filter/sort parameters |
| Notification visible but push missing | producer source -> intent active/status/send time/preferences -> feed projection -> registration query -> delivery diagnostics -> OS/client click handler |
| Media upload stalls | intake object/metadata -> review -> status -> safety result -> approved object -> Spot edit/profile side effect -> derivative object |
| Attribution missing | Spot `public_import_provenance` -> import link and private import source -> compatibility callable/cache |
| Public profile stale | `users/{uid}` privacy/age/public flags -> `public_user_profiles/{uid}` -> Typesense/sitemap |

## 14. Complete deployed Function inventory

This inventory is generated conceptually from the exports in
[`functions/src/index.ts`](functions/src/index.ts). The regression test at
[`backend-data-flow-documentation.spec.ts`](src/backend-data-flow-documentation.spec.ts)
fails when an exported Function is not named in this document. Functions that
share a row use the same module/domain; individual handlers can have different
authorization and data-dependent operation counts, so follow the source link
before invoking an administrator or maintenance callable.

### Spots, ratings, challenges, and organizations

| Export | Trigger/interface | Primary interaction and cost shape |
| --- | --- | --- |
| `updateSpotFieldsOnWrite` | write `spots/{spotId}` | Main normalization/community path in section 5; 0..1 Spot write plus data-dependent geocode, duplicate, and community work. |
| `updateAllSpotsWithTypesenseFields` | create `maintenance/run-backfill-typesense-fields` | Reads all Spots, writes each runtime Spot for which the helper returns fields, then deletes trigger: `N R + 0..N W + 1 D`. Unlike incremental normalization it does not diff returned fields against persisted values. |
| `backfillAllSpotsWithLandingFields` | create `maintenance/run-backfill-landing` | Reads all Spots, writes each runtime Spot for which the helper returns fields, retains/updates trigger status: `N R + 0..N W + 1 W`. |
| `auditReservedSpotSlugs` | create `maintenance/run-audit-reserved-slugs` | One point read per reserved slug, one `in` Spot query, one status write. |
| `detectDuplicateSpots` | create `maintenance/run-detect-duplicate-spots` | Paged full Spot scan; nine tile queries per geolocated Spot; one Spot write per runtime Spot; state start/end and trigger delete. |
| `updateAllSpotAddresses` | create address maintenance doc | Reads all Spots, may call geocoder and write each; writes progress/result and cleans trigger as implemented. |
| `computeRatingOnWrite` | write `spots/{spotId}/reviews/{reviewId}` | `V_s R + 1 Spot W`. |
| `setTopChallengesForSpotOnWrite` | write `spots/{spotId}/challenges/{challengeId}` | `H_s R + 1 Spot W`; embeds at most three. |
| `syncVerifiedSpotOrganizationSnapshots` | update `organizations/{organizationId}` | Two Spot queries; two writes per linked relationship. |
| `previewSpotDuplicateResolution` | admin callable | Reads report/source/candidate Spot and related metadata; dry preview only. |
| `resolveSpotDuplicate` | admin callable | Transactional/checked merge, report resolution, source cleanup, and downstream Spot normalization; cost depends on selected duplicate plan. |

Source modules: [`spotFunctions.ts`](functions/src/spotFunctions.ts),
[`spotAddressFunctions.ts`](functions/src/spotAddressFunctions.ts),
[`spotRatingFunctions.ts`](functions/src/spotRatingFunctions.ts),
[`spotChallengeFunctions.ts`](functions/src/spotChallengeFunctions.ts),
[`organizationFunctions.ts`](functions/src/organizationFunctions.ts), and
[`spotDuplicateFunctions.ts`](functions/src/spotDuplicateFunctions.ts).

### Spot creation and edits

| Export | Trigger/interface | Primary interaction and cost shape |
| --- | --- | --- |
| `createSpotSubmission` | authenticated callable | Reads claim+user; first call writes Spot+edit+claim, replay updates claim; section 5. |
| `recordSpotCreateGuardBlock` | authenticated callable | Transaction reads/writes claim and writes one hourly metric. |
| `getSpotCreationDiagnostics` | admin callable | Reads hourly metrics plus two bounded claim queries. |
| `cleanupSpotCreateSubmissions` | daily schedule | Reads at most 400 expired claims and 100 metrics; deletes all results. |
| `applySpotEditOnCreate` | create `spots/{spotId}/edits/{editId}` | Validates/applies eligible create/update edits, writes Spot/edit/user statistics/metrics as needed; source- and review-policy-dependent. |
| `reviewVerifiedSpotEdit` | organization/admin callable | Reads edit/Spot/reviewer relationship and writes decision plus applied Spot changes where approved. |
| `setSpotOrganizationRelationship` | organization/admin callable | Transactionally updates Spot relationship and organization index documents. |
| `evaluateSpotEditVotesOnVoteWrite` | write edit vote | Reads edit/votes/eligibility as needed; finalizes and may apply the Spot edit. |
| `evaluatePendingSpotEditVotesOnSchedule` | hourly schedule | Reads pending vote-eligible edits and evaluates each with the same policy. |
| `backfillEditTargetMetadata` | admin maintenance callable | Paged edit scan; dry-run by default; writes missing target metadata when applied. |
| `backfillEditTargetMetadataOnCreate` | create maintenance doc | Same backfill with maintenance state/trigger lifecycle. |

Source modules: [`spotCreationFunctions.ts`](functions/src/spotCreationFunctions.ts),
[`spotEditFunctions.ts`](functions/src/spotEditFunctions.ts), and
[`editMaintenanceFunctions.ts`](functions/src/editMaintenanceFunctions.ts).

### Events and discovery

| Export | Trigger/interface | Primary interaction and cost shape |
| --- | --- | --- |
| `updateEventFieldsOnWrite` | write `events/{eventId}` | Normalizes canonical/compatibility/search fields; 0..1 Event write. |
| `syncEventDiscoveryOnEventWrite` | write `events/{eventId}` | One discovery set/delete. |
| `countEventRsvpsOnWrite` | write `events/{eventId}/rsvps/{uid}` | `R_e R + 1 Event W`. |
| `syncSpotUpcomingEventsOnEventWrite` | write `event_discovery/{eventId}` | `S * (1 + E_s) R + 0..S Spot W`. |
| `backfillSpotUpcomingEvents` | create maintenance doc | `E R + sum(1 + E_s) R + 0..S W + 1 D`. |
| `updateAllEventsWithTypesenseFields` | create maintenance doc | `N_event R + 0..N_event W + 1 D`. |
| `backfillEventModel` | admin callable | Paged canonical event normalization, dry-run capable; per page up to `P R + P W`. |
| `backfillEventTiming` | admin callable | Paged timing normalization, dry-run capable. |
| `backfillEventTimingOnCreate` | create maintenance doc | Same timing repair with maintenance state. |
| `resolveEventTimeZone` | public callable | No Firestore write; resolves time zone for validated coordinates through backend logic. |
| `rebuildEventDiscovery` | admin callable | Reads at most `P+1` events and writes/deletes up to `P` projections. |
| `rebuildEventDiscoveryOnCreate` | create maintenance doc | Resumable wrapper around the same pages plus progress writes. |
| `submitEventOwnershipClaim` | authenticated callable | Reads event/claimant/organization context and creates claim plus audit/notification state. |
| `respondToEventOwnershipClaim` | owner/manager callable | Reads claim and authority; writes response/ownership changes and notification state. |
| `reviewEventOwnershipClaim` | admin callable | Reads claim/event and writes reviewed ownership/audit changes. |
| `applyEventOperationalChange` | manager callable | Transactionally updates canonical operational fields and operation metadata. |
| `publishEventLiveUpdate` | manager callable | Creates a published live-update document and subscriber notification fan-out source. |
| `onEventLiveUpdateCreate` | create `events/{eventId}/live_updates/{updateId}` | Queries subscribers/relationships and creates deterministic notification intents. |

Source modules: [`eventFunctions.ts`](functions/src/eventFunctions.ts),
[`eventDiscoveryFunctions.ts`](functions/src/eventDiscoveryFunctions.ts),
[`eventModelMaintenanceFunctions.ts`](functions/src/eventModelMaintenanceFunctions.ts),
[`eventTimingMaintenanceFunctions.ts`](functions/src/eventTimingMaintenanceFunctions.ts),
[`eventTimeZoneFunctions.ts`](functions/src/eventTimeZoneFunctions.ts),
[`eventOwnershipClaimFunctions.ts`](functions/src/eventOwnershipClaimFunctions.ts), and
[`eventLiveUpdateFunctions.ts`](functions/src/eventLiveUpdateFunctions.ts).

### Event registration

| Export | Trigger/interface | Primary interaction and cost shape |
| --- | --- | --- |
| `registerForEvent` | authenticated callable | Base 4 transaction reads plus conditional membership/access reads; 2 writes. |
| `cancelEventRegistration` | authenticated/manager callable | Base 4 reads, conditional authority and one waitlist query; 2..3 writes. |
| `onEventRegistrationPromotion` | update registration | Reads event and creates one intent for waitlisted -> registered. |
| `reconcileEventWaitlistOnEventUpdate` | update Event | On admission changes, up to 25 pages of 200 waiters; writes each promotion plus state. |

Source: [`eventRegistrationFunctions.ts`](functions/src/eventRegistrationFunctions.ts).

### Communities

| Export | Trigger/interface | Primary interaction and cost shape |
| --- | --- | --- |
| `rebuildCommunityPagesOnImportWrite` | write `imports/{importId}` | Provenance sync on metadata changes; terminal imports rebuild affected communities and clear deferred flags. |
| `rebuildCommunityEventPreviewsOnEventWrite` | write `event_discovery/{eventId}` | Per impacted key `E_c + 1 R + 0..1 W`. |
| `patchCommunityPageOnWrite` | write `community_pages/{key}` | Applies requested legacy merge patch, then runs full rebuild and status write. |
| `rebuildAllCommunityPages` | create `maintenance/run-rebuild-community-pages` | Full high-fan-out rebuild described in section 7. |
| `getCommunityMergeAdminState` | admin callable | Reads target/source pages, Spot groups, aliases, and merge state to preview choices. |
| `mergeUnpublishedLocality` | admin callable | Validates pages/groups, writes merge/redirect/aliases/authored-card changes, then rebuilds. |
| `unmergeUnpublishedLocality` | admin callable | Reads merge/source aliases, restores source and aliases, removes merge, then rebuilds affected state. |
| `saveCommunityKnowledge` | authenticated callable | Creates or updates a community knowledge edit; approved path can update public/private card data. |
| `reviewCommunityEdit` | admin/reviewer callable | Reads edit/community authority and writes decision plus public/private community content. |

Source modules: [`communityFunctions.ts`](functions/src/communityFunctions.ts) and
[`communityEditFunctions.ts`](functions/src/communityEditFunctions.ts).

### Imports and provenance

| Export | Trigger/interface | Primary interaction and cost shape |
| --- | --- | --- |
| `processImportChunkOnCreate` | create import chunk | `1 import R + S Spot W + 2 transaction R + 3..4 status W`; failure path differs; section 12. |
| `retryFailedImportChunksOnCreate` | create `chunks/retry` | Reads every failed chunk, re-runs the chunk cost, deletes retry doc. |
| `getPublicImportProvenance` | public callable | Warm cache hit 0 reads; miss 1..2 Spot queries and optional import read. |
| `backfillPublicImportProvenanceOnCreate` | create maintenance doc | Two-phase paged Spot scan; one import read per unique import in page; 0..P Spot writes plus one checkpoint write per page. |

Source modules: [`importFunctions.ts`](functions/src/importFunctions.ts),
[`importProvenanceFunctions.ts`](functions/src/importProvenanceFunctions.ts), and
[`importProvenanceMaintenanceFunctions.ts`](functions/src/importProvenanceMaintenanceFunctions.ts).

### Media and Storage

| Export | Trigger/interface | Primary interaction and cost shape |
| --- | --- | --- |
| `processMediaIntakeUpload` | finalize `media_intake/...` | Moderation/release pipeline in section 9. |
| `markMediaUploadSafe` | admin callable | Releases eligible quarantine/audit media and repairs target/report/action state. |
| `runMediaIntakeBackfill` | create maintenance doc | Lists intake objects, processes up to requested limit, writes summary, deletes trigger. |
| `reconcilePublishedMediaReviews` | create maintenance doc | Two review queries, object existence/metadata checks, repair writes, summary, trigger delete. |
| `runMediaModerationAudit` | create maintenance doc | Lists configured public prefixes, downloads/scans each eligible object, writes audit review/report/incident records and summary. |
| `processImageUpload` | eligible Storage object finalize | Storage-only download, 3 derivative writes, original move; no Firestore. |
| `backfillStorageImageSizes` | create maintenance doc | Lists source/archive prefixes, creates missing derivatives, writes summary, deletes trigger. |
| `processVideoUpload` | video Storage finalize | Storage-only download, compressed video+thumbnail uploads, original delete. |
| `cleanupAllOrphanedMedia` | admin callable | Scans referenced Firestore media and Storage objects; deletes unreferenced objects according to handler policy. |

Source modules: [`mediaModerationFunctions.ts`](functions/src/mediaModerationFunctions.ts),
[`imageProcessingFunctions.ts`](functions/src/imageProcessingFunctions.ts),
[`storageFunctions.ts`](functions/src/storageFunctions.ts), and
[`mediaCleanupFunctions.ts`](functions/src/mediaCleanupFunctions.ts).

### Reports and safety cases

| Export | Trigger/interface | Primary interaction and cost shape |
| --- | --- | --- |
| `onSpotReportCreate` | create nested Spot report | Reads reporter/Spot context, writes public warning fields, sends Discord. |
| `resolveSpotReport` | admin callable | Updates report, reads all Spot reports, conditionally clears warning fields. |
| `submitMediaReport` | public callable | Validates/rate-limits context and writes canonical report plus private submission metadata. |
| `onMediaReportCreate` | create `media_reports/{id}` | Legacy media report handling; may transactionally remove media from Spot/event. |
| `onRootMediaReportCreate` | create `reports/{id}` | Root media/scanner report handling with the same target-removal policy. |
| `cleanupMediaReportSubmissionMetadata` | daily schedule | Bounded expiry queries; strips/deletes private submission metadata. |
| `onUserReportCreate` | create `user_reports/{id}` | Reads reporter/target context and sends Discord; safety projection is separate. |
| `handleModerationAction` | admin callable | Reads report/target, writes action and target/report status; remove/delete/merge behavior is action-dependent. |
| `createSafetyIncident` | admin callable | Reads source report and creates restricted incident. |
| `getModerationMediaPreview` | admin callable | Reads report/review metadata and returns short-lived controlled preview access. |
| `updateSafetyIncident` | admin callable | Reads incident and writes status/classification/retention audit changes. |
| `submitSafetyCase` | public callable | Rate-limit read/write plus case/private intake/event/access/outbox transaction. |
| `exchangeSafetyCaseAccessLink` | public callable | Transaction reads access+case, consumes token, writes session/private/event state. |
| `getSafetyCaseView` | public session/auth callable | Reads authorized case, private intake, and events needed for redacted view. |
| `addSafetyCaseMessage` | public session/auth callable | Validates access and writes case event plus case update. |
| `appealSafetyCaseDecision` | public session/auth callable | Reads parent/intake and writes appeal case, private copy, events, access/outbox, parent link. |
| `cleanupSafetyCaseSecurityMetadata` | daily schedule | Four bounded expiry queries; strips intake request metadata and deletes expired token/session/limit docs. |
| `listSafetyCases` | admin callable | Bounded filtered case query. |
| `getAdminSafetyCase` | admin callable | Reads case, private intake, related outbox/hold/source details. |
| `updateSafetyCase` | admin callable | Writes admin case metadata and audit event. |
| `decideSafetyCase` | admin callable | High-variance decision/hold/target/action/outbox transaction described in section 11. |
| `restoreSafetyCaseDecision` | admin callable | Reads hold/target and restores held documents/media/profile state plus audit records. |
| `onSpotReportSafetyCaseCreate` | create nested Spot report | Deterministic safety-case projection. |
| `onRootReportSafetyCaseCreate` | create root report | Deterministic safety-case projection. |
| `onLegacyMediaReportSafetyCaseCreate` | create legacy media report | Deterministic safety-case projection. |
| `onUserReportSafetyCaseCreate` | create user report | Deterministic safety-case projection. |
| `onModerationActionSafetyCaseCreate` | create moderation action | Creates/updates linked case event/action state. |
| `backfillSafetyCases` | admin callable | Full scans of all legacy source collections, plus per-source case existence reads/writes. |
| `aggregateSafetyCaseMetrics` | daily schedule | Reads cases in metric window and writes one daily aggregate doc. |
| `runSafetyDataCleanup` | admin callable | Full user and review scans; removes legacy sensitive fields and archives review text. |
| `backfillReportReporterIdentities` | admin callable | Full grouped/legacy/user report scans and identity normalization writes. |
| `migrateSpotReportsToPublicWarnings` | admin callable | Full report scan, one Spot read per reported Spot, conditional warning writes, one state write. |
| `resyncReportedSpotsToTypesenseOnCreate` | create maintenance doc | Queries reported Spots, writes a force-sync field to each, writes state, deletes trigger. |

Source modules: [`spotReportFunctions.ts`](functions/src/spotReportFunctions.ts),
[`mediaReportSubmissionFunctions.ts`](functions/src/mediaReportSubmissionFunctions.ts),
[`mediaReportFunctions.ts`](functions/src/mediaReportFunctions.ts),
[`userReportFunctions.ts`](functions/src/userReportFunctions.ts),
[`moderationActionFunctions.ts`](functions/src/moderationActionFunctions.ts),
[`safetyIncidentFunctions.ts`](functions/src/safetyIncidentFunctions.ts),
[`safetyCaseSubmissionFunctions.ts`](functions/src/safetyCaseSubmissionFunctions.ts),
[`safetyCaseAdminFunctions.ts`](functions/src/safetyCaseAdminFunctions.ts),
[`safetyCaseProjectionFunctions.ts`](functions/src/safetyCaseProjectionFunctions.ts), and
[`safetyDataMaintenanceFunctions.ts`](functions/src/safetyDataMaintenanceFunctions.ts).

### Users, profiles, Auth, and age policy

| Export | Trigger/interface | Primary interaction and cost shape |
| --- | --- | --- |
| `assignSignupNumberOnCreate` | create `users/{uid}` | `2 R + 2 W` transaction if unassigned. |
| `syncPublicUserProfileOnWrite` | write `users/{uid}` | `2 R + 0..1 W/D` transaction. |
| `getUserProfile` | public callable | `1..4 R` depending on viewer/audience. |
| `backfillPublicUserProfiles` | admin callable | Reads all users and all existing projections; apply writes desired profiles, deletes stale, writes state. |
| `activateUserProfilePrivacyCutover` | admin callable | Reads projection state and writes cutover state after exact confirmation. |
| `cleanupOnUserDelete` | Auth user delete | Reads deleted user's `following` and `followers`; deletes every reciprocal edge, then deletes `users/{uid}`: `(F_following + F_followers) R + same number D + 1 user D`. It does not delete the deleted user's own remaining subcollections. The current batch implementation is only safe below 450 edges per direction and must be fixed before relying on larger-account cleanup. |
| `onCheckInCreate` | create user check-in | One private-data `arrayUnion` write. |
| `syncVisitedSpotsCountOnPrivateDataWrite` | write private data | One public user counter write. |
| `updateAgePolicy` | legacy authenticated callable | Reads/writes legacy age policy for old clients. |
| `updateAgePolicyV2` | App Check authenticated callable | Reads/writes v2 policy/evidence-compatible profile state. |
| `beginAgeAssuranceV3` | App Check authenticated callable | Reads user/policy and writes short-lived challenge/evidence state. |
| `updateAgePolicyV3` | App Check authenticated callable | Reads user/challenge/platform signal and writes v3 policy/profile privacy consequences. |
| `invalidateAgeAssuranceApprovals` | admin callable | Dry-run/apply scan of affected users; conditional policy writes. |
| `cleanupAgeAssuranceChallenges` | daily schedule | Reads bounded expired challenges and deletes them. |
| `fixSpotLocations` | create legacy fix doc | Full Spot repair migration for coordinate shape; writes affected Spots. |
| `fixLocaleMaps` | create legacy fix doc | Full Spot locale-map migration; writes affected Spots. |
| `backfillSignupNumbers` | create legacy fix doc | Reads users/counter and assigns missing sequence numbers. |
| `recalculateUserEditStats` | create legacy fix doc | Reads users/edits and rewrites aggregate user edit stats. |

Source modules: [`userSignupFunctions.ts`](functions/src/userSignupFunctions.ts),
[`userProfileFunctions.ts`](functions/src/userProfileFunctions.ts),
[`authFunctions.ts`](functions/src/authFunctions.ts),
[`userFunctions.ts`](functions/src/userFunctions.ts),
[`ageAssuranceFunctions.ts`](functions/src/ageAssuranceFunctions.ts), and
[`fixFunctions.ts`](functions/src/fixFunctions.ts).

### Social and contact

| Export | Trigger/interface | Primary interaction and cost shape |
| --- | --- | --- |
| `countPostLikesOnWrite` | write post like | Full likes query + one post write. |
| `countFollowersOnWrite` | write follower edge | Full followers query + one user write. |
| `countFollowingOnWrite` | write following edge | Full following query + one user write. |
| `onContactMessageCreate` | create contact message | No Firestore reads/writes beyond trigger; sends sanitized Discord webhook. |

Source modules: [`postFunctions.ts`](functions/src/postFunctions.ts) and
[`contactMessageFunctions.ts`](functions/src/contactMessageFunctions.ts).

### Notifications

| Export | Trigger/interface | Primary interaction and cost shape |
| --- | --- | --- |
| `onFollowRequestNotificationCreate` | write follow request | Reads requester and creates/cancels one intent. |
| `onNewFollowerNotificationWrite` | write follower | Reads recipient relationship/profile (up to 3) and creates/cancels one intent. |
| `onFollowingNotificationWrite` | write following | Reads followed user and conditionally creates one private-account acceptance intent. |
| `onEventRsvpNotificationWrite` | write RSVP | Event + subscription + up to 3 intent reads; up to 3 intent writes/cancels. |
| `onEventNotificationSubscriptionWrite` | write live subscriber | Reads event/RSVP/registration relationship and reconciles reminders. |
| `onEventNotificationSourceWrite` | write Event with auth context | Reads all RSVPs and optional subscriptions; per-recipient update/reminder intent work. |
| `onSpotEditNotificationWrite` | write Spot edit | Reads Spot and optional organization; creates one outcome intent. |
| `onSpotReportNotificationWrite` | write Spot report | Creates reporter outcome intent when report status changes. |
| `onMediaReportNotificationWrite` | write legacy media report | Creates reporter outcome intent when status changes. |
| `onRootMediaReportNotificationWrite` | write root report | Creates reporter outcome intent when status changes. |
| `onModerationActionNotificationCreate` | create moderation action | Creates report outcome intent if not already represented. |
| `onCommunityInfoNotificationWrite` | write community edit | Creates author outcome intent. |
| `onNotificationIntentWrite` | write intent | Preference read + feed projection write when projection fields changed. |
| `onImmediateNotificationIntentCreate` | create intent | For due intents, feed sync then delivery claim/process. |
| `sendDueNotificationIntents` | every minute | Two queries <=100; stale reset; due processing in section 10. |
| `performNotificationAction` | authenticated callable | Base 3 transaction reads plus action-specific graph/event reads/writes. |
| `reconcileMyEventNotifications` | authenticated callable | Private data + two candidate queries; 3 relationship reads and subscription/reminder work per candidate, max 250. |
| `getMyEventNotificationMigrationState` | authenticated callable | Private data + two candidate queries + 3 relationship reads per candidate, max 250. |
| `onCommunityEventDiscoveryWrite` | write event discovery | Merge expansion, follow fan-out, intent reconciliation, one intent per recipient. |
| `onCommunitySpotRecommendationWrite` | write Spot | On qualification transition, follow fan-out + time-zone read + one digest item per recipient. |
| `sendCommunitySpotDigests` | every 15 minutes | <=500 item reads; Spot+follow validation per item; one intent/group and one write/item. |
| `migrateCommunityFollowsOnMerge` | write active community merge | Reads target page and every source follow; transaction read target + set/delete per follow. |

Source modules: [`notificationFunctions.ts`](functions/src/notificationFunctions.ts) and
[`communityNotificationFunctions.ts`](functions/src/communityNotificationFunctions.ts).

### Weather, OSM, map links, and sitemap

| Export | Trigger/interface | Primary interaction and cost shape |
| --- | --- | --- |
| `getWeather` | App Check callable | Cache read, optional delete/upstream/cache write, optional alert-cache work. |
| `cleanupExpiredWeatherCache` | every 5 minutes | Two queries <=150, delete every result. |
| `getOsmAmenityTile` | App Check callable | Cache read + lease transaction; optional Overpass and success/failure cache write. |
| `cleanupExpiredOsmAmenityCache` | daily schedule | Up to four queries <=300, delete every result. |
| `resolveMapShortLink` | App Check callable | No Firestore; bounded, allowlisted redirect requests. |
| `generateSitemapOnSchedule` | daily 03:00 UTC | Full projection/source streams, Storage write, IndexNow. |
| `generateSitemapManual` | public HTTP request | Same full sitemap work; endpoint itself does not add authorization. |

Source modules: [`weatherFunctions.ts`](functions/src/weatherFunctions.ts),
[`osmAmenityFunctions.ts`](functions/src/osmAmenityFunctions.ts),
[`mapLinkFunctions.ts`](functions/src/mapLinkFunctions.ts), and
[`sitemapFunctions.ts`](functions/src/sitemapFunctions.ts).

## 15. Non-exported and external behavior

Not every important interaction is a Function export:

- Firestore and Storage Security Rules can perform dependent reads or reject a
  client request before a trigger exists. See [`firestore.rules`](firestore.rules)
  and [`storage.rules`](storage.rules).
- The installed Firestore-to-Typesense extension is external deployment state.
- Angular SSR/public callable proxying can add an HTTP hop but not an extra
  Firestore interaction by itself.
- PostHog and browser/native error reporting are diagnostic side effects. Product
  correctness must not depend on their delivery because privacy tools and ad
  blockers can suppress them.
- Generated image/video Storage objects can themselves fire object-finalize
  handlers; every handler has path/name/content guards to stop recursion.
- Disabled social-card exports (`generateSocialCards`, `onUserProfileUpdate`)
  are intentionally not deployed and therefore not part of the 150-export
  contract.

When adding a Function, projection, aggregate, or client write path, update this
document in the same change. Include the canonical source, trigger, fan-out
variables, retry/idempotency behavior, compatibility impact, and repair trail.
