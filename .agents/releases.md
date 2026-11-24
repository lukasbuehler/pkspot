# Releases and deployment guide

Read this before release work, staging pushes, or any change that needs a
deploy step.

## Hosting

- All web hosting runs on Cloudflare Workers. Firebase Hosting and App Hosting
  are no longer used; Firebase still provides Firestore, Functions, Auth,
  Storage and App Check. A new web surface, such as an admin console, gets its
  own Worker.
- `development` deploys staging at `https://test.pkspot.app` on every push or
  merge. `main` deploys production at `https://pkspot.app` through Cloudflare
  Workers Builds.
- Never deploy, roll back or change the production Workers or their build
  settings by hand unless the user asks.

## Releases

- A release is the PR from `development` to `main`, merged with a merge commit
  (never squash or rebase), so both branches keep the same commits.
- A fix branched from `main` may ship in its own PR to `main`; afterwards merge
  `origin/main` back into `development`.
- Small fixes for an open release PR, such as review findings, may go on its
  head branch directly.
- Each release has a GitHub milestone. A PR merges into `development` only
  when its milestone is the next release.
- A request to deploy Functions, rules, extensions or other backend resources
  is separate from a web release. It never allows updating `main`.

## Deployment checklists

- `DEPLOYMENT_TASKS.md` is the index and the reusable release procedure. Each
  pending task lives in one checklist under `docs/deployment/` (git-ignored,
  maintainer-only). Review them before release work and mention open items in
  the handoff.
- A change that needs a deploy step (indexes, Typesense schemas, Functions or
  rules, migrations, backfills, sitemaps, cleanup, external checks) updates its
  owning checklist while the change is made: order, exact commands, success
  checks, and when compatibility code may go. The checklists are local to the
  maintainer's checkout, so the PR does not carry them; say in the PR and the
  handoff which checklist was updated.
- Keep the reusable procedure in `DEPLOYMENT_TASKS.md` in line with the real
  scripts and infrastructure. One-off work belongs in a checklist.
- A checklist entry is not permission to deploy. Only remove an item after the
  action ran and its success check passed; rewrite partly done items to what
  remains, and drop empty sections. The merged PRs and the deploy history
  are the record.
