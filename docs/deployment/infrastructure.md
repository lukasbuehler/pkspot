# Infrastructure migrations

Cloudflare production cutover and self-hosted Typesense are separate projects, not prerequisites for shipping 1.2 on the current infrastructure.

Use [the deployment index](../../DEPLOYMENT_TASKS.md) for the shared procedure and maintenance rules. Each task is owned here; do not duplicate it in another checklist.

### Public PK Spot MCP Worker

The standalone service lives in `mcp/` and does not depend on the Typesense VM
migration or a web/mobile release. Deployment and directory submissions require
separate maintainer approval. It provides anonymous, read-only discovery and
individual detail tools, with no exports or pagination.

- [ ] Deploy the native-fetch receiver and manual-redirect fixes, then verify
      live MCP search and detail reads. Local workerd now completes a public
      Typesense-to-Firestore read; deployed data access still needs retesting.
      Verify persisted logs/traces redact query strings. Check the dashboard's
      issue detection setting after deployment: Wrangler 4.132.0 and 4.143.0
      do not recognize `observability.issue_detection`.
- [ ] Run `npm ci --prefix mcp --ignore-scripts`, `npm --prefix mcp run check`,
      `npm --prefix mcp test`, `npm --prefix mcp run build`, and the repository
      `npm run test:build`. The MCP build command is a Wrangler dry run.
- [ ] Create a dedicated search-only Typesense key restricted to `spots_v2`,
      `events_v1`, and `communities_v1`. From `mcp/`, use
      `npx wrangler secret put TYPESENSE_SEARCH_KEY` and
      `npx wrangler secret put QUOTA_SECRET` (at least 32 random characters).
      Configure `TYPESENSE_ORIGIN=https://search.pkspot.app` and the actual
      `FIRESTORE_PROJECT_ID` in Worker variables. Do not reuse an admin key.
- [ ] Verify anonymous REST reads of the existing public Spot, Community and
      Event documents against deployed Firestore rules and App Check policy.
      Search only reads IDs from Typesense, then rechecks current public records.
      Confirm unpublished/unlisted/private Events and hidden Community cards
      never appear, even with stale Typesense hits or direct ID requests.
      Permission-denied records are withheld. If legitimate public reads are
      blocked, retain the existing protection and resolve a narrow public read
      integration before launch; do not disable App Check or use an Admin bypass.
- [ ] Add the custom-domain route for `mcp.pkspot.app` in `mcp/wrangler.jsonc`
      after domain approval, deploy with `npm --prefix mcp run deploy`, and verify
      `/health` and `/mcp`. Wrangler provisions the `QuotaStore` SQLite Durable
      Object migration. Keep `workers_dev` and preview URLs disabled. Configure
      edge request-rate protection without browser challenges on `/mcp`.
- [ ] Test initialization, tools/list and all six tools in both ChatGPT and
      Claude. Cover text and community-reference searches, optional host location,
      timezone-aware dates, empty results, upstream outages and rejected bulk
      parameters. Verify canonical links and required import attribution.
      Tune the constants in `mcp/src/quota.ts` using observed provider egress:
      anonymous provider IPs can represent many people. Quotas use daily HMACs
      of Cloudflare-provided IPs and a global daily Durable Object. Every request
      consumes a request slot, including malformed requests and protocol discovery.
      Searches additionally reserve ten record slots and detail reads reserve one.
      Confirm 429/Retry-After, persistence across Worker
      restarts, the global cap, and fail-closed behavior on quota failures.
      This discourages extraction but cannot prevent distributed copying, and
      existing public web/search access has separate exposure to audit.
- [ ] Approve the MCP privacy disclosure before setting optional
      `POSTHOG_API_KEY` and `POSTHOG_HOST` (EU or US ingestion origin). Verify
      event-only `mcp_tool_completed` metrics with no queries, result content,
      network identifiers or persistent person profiles. Confirm analytics
      failures do not break discovery. These metrics measure tool calls, not
      conversation views, link clicks, unique users or cross-platform funnels.
- [ ] Prepare and separately approve ChatGPT and Claude directory submissions,
      using `mcp/submission/pkspot/plugin.json` and the private preparation record
      `mcp/submission/review-preparation.json`. The draft publisher is Lukas Bühler.
      Deploy the public-discovery `openWorldHint: true` annotation before scanning.
      Deploy the ownership challenge route and public token configured in
      `mcp/wrangler.jsonc`; verify GET returns the exact token as plain text at
      `https://mcp.pkspot.app/.well-known/openai-apps-challenge`, then select
      Verify Domain in the existing PK Spot OpenAI draft. Do not mark domain
      verification complete until the portal confirms it.
      Confirm the listing category in the portal, complete individual and domain
      verification, run five positive and three negative conversations in ChatGPT,
      add an accessible walkthrough recording, and review MCP data processing in
      the privacy policy (arguments, optional coarse location, quota identifiers,
      Cloudflare logs/traces and any enabled PostHog metrics). Keep credentials
      and the preparation record outside the upload ZIP. Claude submission is
      deferred until a paid Claude account is available. Obtain approval before
      submitting or publishing either listing,
      including verified publisher/domain, policy/support links, test cases and
      review materials. The MCP server itself is not a submitted directory listing.
      For rollback, remove/disable the Worker route and directory connection;
      existing PK Spot clients and search remain independent.

### Search endpoint and self-hosted Typesense migration

The current Typesense Cloud cluster remains the live source until all steps
below have passed. `search.pkspot.app` is now a stable Cloudflare-proxied
hostname whose origin is that existing Cloud cluster. This does not move data;
already-released clients still use the direct host until their normal update
path reaches them.

- [ ] In the next compatible web and mobile release, load a versioned public
      search connection configuration on app start. Its initial primary is
      `search.pkspot.app`; its bundled and runtime fallback is the current
      Typesense Cloud host. Each endpoint carries its own collection-restricted
      search key. Never return an admin key. Cache the configuration for a
      bounded period and retain the bundled fallback when it cannot be fetched.
- [ ] Implement the self-managed Europe Functions sync before changing the
      current extension. Preserve the verified public source boundaries:
      `spots -> spots_v2`, `event_discovery -> events_v1`, and
      `community_pages -> communities_v1`. Use typed projections, current
      document reads, idempotent upsert/delete, retry-safe dual targets,
      checkpointed backfill and reconciliation. Keep admin keys in Functions
      secrets and deploy in `europe-west1`.
- [ ] Before enabling public-user search, use only
      `public_user_profiles` with `public_search == true`. Do not index
      `users`, private subcollections, age evidence, contact data, or follower
      edges. Apply the checked-in `users_v1` schema and verify a consent
      withdrawal removes the result.
- [ ] Add explicit localized Community fields to `communities_v1`:
      `place_localization.names` and `place_name_overrides` as returned,
      `index: false` objects for locale-correct client rendering, plus a bounded
      indexed `localized_search_names: string[]` field for matching localized
      locality and region strings. Preserve override precedence over provider
      names. Update the schema contract, projection and client query fields,
      then backfill and verify searches find each localized name while the
      client renders its active locale without changing canonical names or
      slugs.
- [ ] Provision the Zurich `e2-small` VM, persistent disk, backups, alerts and
      Cloudflare Tunnel. Import the current Typesense schemas and snapshot,
      enable custom-function dual writes, run the full backfill, and reconcile
      collection counts, IDs, geo filters, facets and representative search
      results before changing the custom hostname origin.
- [ ] Cut the runtime primary configuration to the VM endpoint only after the
      comparison is clean. Retain the direct Typesense Cloud fallback and dual
      synchronization for the agreed old-client support window. Do not disable
      the extension or terminate Typesense Cloud until those older clients are
      no longer supported and the VM restore procedure has been verified.

### Cloudflare edge SSR trial

For 1.2, release the same reviewed revision to Firebase App Hosting production
and Cloudflare staging at `test.pkspot.app`. Keep production on App Hosting
until staging parity and the cutover checks below pass; the local branch merge
does not deploy either host. Review the draft build-19 mobile changelogs before
store submission.

- [ ] After publishing the reviewed 1.2 revision to both hosts, verify that map,
      training, and about pages never open a location permission prompt on load,
      including a granted browser permission without an app opt-in, and a saved
      location opt-in whose browser grant expired. Only
      an explicit location action may request permission. The browser regression
      is `e2e/tests/location-permission.spec.ts`; set `PKSPOT_LOCATION_TEST_URL`
      to a local Worker origin to exercise its staging browser configuration.

The Cloudflare trial is additive and must stay on `test.pkspot.app` until
all localized SSR, Firebase, crawler, and cache checks pass. It does not replace
or operate the App Hosting production rollout. The stable test hostname and its
`*.test.pkspot.app` branch previews must return `X-Robots-Tag: noindex,
nofollow, noarchive`; canonical and social URLs must continue to use
`https://pkspot.app`.

The 2026-09-28 live inventory confirms `mintCloudflareSsrAppCheckToken` is
absent and neither `CLOUDFLARE_SSR_FIREBASE_APP_ID` nor
`CLOUDFLARE_SSR_TOKEN_BROKER_SECRET` exists in Secret Manager. Worker bindings
and the dedicated Firebase app identity remain unverified. Inspect existing apps
before creating another. This broker is for web SSR App Check, not the Typesense
search proxy.

- [ ] Identify or create a separate Firebase Web app named `PK Spot SSR Cloudflare`. Set its
      app ID as the `CLOUDFLARE_SSR_FIREBASE_APP_ID` Function secret and create
      a random, independent `CLOUDFLARE_SSR_TOKEN_BROKER_SECRET`:

  ```sh
  npx firebase apps:create WEB "PK Spot SSR Cloudflare" --project prod
  npx firebase functions:secrets:set CLOUDFLARE_SSR_FIREBASE_APP_ID --project prod
  npx firebase functions:secrets:set CLOUDFLARE_SSR_TOKEN_BROKER_SECRET --project prod
  npx firebase deploy --project prod --only functions:mintCloudflareSsrAppCheckToken
  ```

      Configure the `pkspot-web` Worker with the app ID, deployed broker URL,
      and broker secret as `PKSPOT_SSR_FIREBASE_APP_ID`,
      `PKSPOT_SSR_APP_CHECK_BROKER_URL`, and
      `PKSPOT_SSR_APP_CHECK_BROKER_SECRET` secrets. Never put these values in a
      Wrangler config, client environment file, static asset, or build log. Do
      not reuse App Hosting's existing SSR app ID
      (`1:294969617102:web:08b892460adf0b16313e9f`). The browser bundle keeps
      using the registered production browser app ID while overriding only its
      restricted API key for the test origin.
- [ ] Build the combined six-locale Worker with `npm run build:cloudflare`, then
      run `npm run test:cloudflare -- --skip-build --compare-express` after
      `npm run test:build`, and run `npm run cloudflare:dry-run`. The route
      smoke test reads public IMAX and Swiss Jam fixtures and must pass repeated
      and overlapping SSR requests, all locales, deep links, and shared assets.
      In Workers Builds, use
      `npm run build:cloudflare` as the build command and
      `npx wrangler deploy --config dist/pkspot-cloudflare-worker/wrangler.jsonc`
      as the deploy command. Confirm the upload remains below the current
      Workers script-size limit and starts within Cloudflare's limit.
      Keep final Worker minification enabled and runtime critical CSS inlining
      disabled. Staging reproduced HTTP 503 / Cloudflare 1102 after enabling
      inlining; inspect Worker logs for exceededCpu versus exceededMemory.
      After an approved deployment, repeat sequential and concurrent requests
      and confirm no resource-limit errors before considering the rollback
      verified. Investigate build-time critical CSS separately. Repeat the
      mobile Lighthouse comparison on `test.pkspot.app/en` and `pkspot.app/en`
      using fresh profiles; local route tests do not prove a live speedup.
- [ ] Deploy the generated `pkspot-web` Worker without attaching `pkspot.app`.
      Verify its `workers.dev` URL first, including every locale's initial HTML,
      canonical and social metadata, hashed assets, 404 status, Firebase reads,
      and App Check.
- [ ] Before testing browser integrations, authorize the exact trial origins.
      Keep the restricted staging browser API key in
      `src/environments/firebase.staging.json`, which is shared by the staging
      Angular environment and its generated Cloudflare web-push workers. Keep
      `https://test.pkspot.app/*` and
      `https://*.test.pkspot.app/*` as its website restrictions, and authorize
      only the Google APIs the browser actually uses. Add `test.pkspot.app` and
      any branch preview hosts to Firebase Authentication's authorized domains
      if sign-in will be tested there. The reCAPTCHA Enterprise key already
      permits `test.pkspot.app` when its verified domain list contains `pkspot.app`;
      add the exact `pkspot-web.lukasmc6.workers.dev` hostname separately for
      App Check testing on the Worker preview. Do not disable domain
      verification or authorize all of `workers.dev`.
- [ ] After deploying the hostname update, verify `test.pkspot.app` serves the
      Worker through Cloudflare's managed DNS and certificate, unprefixed paths
      redirect by `Accept-Language`, locale-prefixed paths reach the matching
      Angular SSR bundle, dynamic Spot routes such as `/en/map/spots/imax`
      return Spot-specific `200` HTML instead of redirecting to `/en/map`, and
      responses include the test-site `X-Robots-Tag`.
      Keep the apex `pkspot.app` records on App Hosting during the trial.
- [ ] Put WAF and bot rules into log-only mode first. Confirm verified search
      crawlers and social-card fetchers receive SSR HTML and public images
      without a challenge before enabling blocking or managed challenges.
- [ ] Keep `www.pkspot.app`, `pkfrspot.com`, `pk-spot.com`, and
      `parkourspot.app` on their existing Firebase redirects throughout the
      trial. At the production cutover, move them to Cloudflare Bulk Redirects
      or Redirect Rules instead of Hostpoint forwarding. Preserve the path and
      query string, issue a permanent redirect to `https://pkspot.app`, verify
      HTTPS for every source hostname, and remove each Firebase redirect only
      after its Cloudflare replacement passes those checks.
