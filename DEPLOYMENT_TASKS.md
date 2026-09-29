# Deployment tasks

This maintainer document is the source of truth for work immediately before,
during, and after a production release. Deploying `main` updates App Hosting, but
does not automatically deploy Firebase backend resources, update search schemas,
run data migrations, or complete third-party service tasks.

## Release procedure

### Pre-deployment

1. Review the actions in the linked checklists and determine the required
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
   - Verify the live collection against the checked-in schema, including field
     types and `facet` flags. Local contract tests do not verify production.
   - Deploy the matching projection/helper functions, run required backfills,
     and wait for indexing before verifying the actual client query, including
     facets, filters, and sorting. Confirm legacy documents remain in filtered
     results; a successful unfiltered query alone is insufficient.
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
3. Complete every applicable action in the linked checklists, including search
   backfills, sitemap regeneration, migrations, cleanup, and external-service
   checks.
4. Verify completion using the success condition recorded for each action.
5. Monitor affected product metrics and error reports for an appropriate period.

## Task index

Keep this file as the entry point and reusable procedure. Detailed tasks have
one owning document, grouped by purpose:

| Document | Purpose |
| --- | --- |
| [Backend](docs/deployment/backend.md) | Functions, indexes, data jobs and operational fixes |
| [Release verification](docs/deployment/verification.md) | Browser and product-flow acceptance checks |
| [Native release](docs/deployment/native.md) | Signing, builds and device verification |
| [Compatibility](docs/deployment/compatibility.md) | Separately approved rules and privacy cutovers |
| [Infrastructure](docs/deployment/infrastructure.md) | Cloudflare and Typesense migrations, outside the 1.2 critical path |
| [Deferred features](docs/deployment/deferred.md) | Disabled features, outside the enabled 1.2 scope |

## Maintenance contract

- Read this index and the relevant owning checklist before release-related work.
- Update the owning task in the same commit as a release-coordinated change.
- Keep deployment, live verification and native-device verification distinct.
  Local passing tests do not prove any of them.
- Record the dependency order, exact target or command, backwards-compatibility
  requirement, and observable success condition. Label dated inventory as a
  snapshot; recheck it before acting.
- Never mark a task complete from an assumption, a feature flag or a user's
  partial test. Remove it only after its success condition is verified. Rewrite
  partially completed tasks to retain only the remaining work.
- Keep each task in one document. Link to dependencies rather than copying them.
  Moving a task does not complete it or authorize deployment.
- Resolve contradictory evidence explicitly. Prefer newer verified observations
  to old checklist claims, and retain unresolved gaps until checked.
- Check all six documents at release review. Deferred and compatibility work
  does not become a release blocker merely because it remains listed.
