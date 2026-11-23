# Agent instructions

These rules apply to all work in this repository. Topic guides in `.agents/`
hold the details; read the ones your task touches before you start.

| Guide | Read it when you |
| --- | --- |
| [.agents/angular.md](.agents/angular.md) | write or review Angular code in `src/app` |
| [.agents/ui.md](.agents/ui.md) | change colours, cards, panels, menus, icons or page layout |
| [.agents/translations.md](.agents/translations.md) | add or change user-facing text, or translate |
| [.agents/backend.md](.agents/backend.md) | touch Functions, rules, Firestore data, Typesense or client writes |
| [.agents/native.md](.agents/native.md) | work in `ios/` or `android/`, on Capacitor, or add a first-level route |
| [.agents/releases.md](.agents/releases.md) | prepare a release or a change that needs a deploy step |

## Private documents

- Product ideas and plans live in `docs/planning/`, submission work in
  `docs/release/`, and deployment checklists in `docs/deployment/`. `docs/` is
  git-ignored and maintainer-only.
- Never force-add ignored documents, and never copy private plans into tracked
  files, PRs or issues without explicit approval. The repository is public.

## Branches, PRs and permissions

- Do each task on its own branch in its own Git worktree. Name branches by
  purpose: `feat/<topic>`, `bugfix/<topic>`, `perf/<topic>`, `docs/<topic>`.
  Leave uncommitted changes in other worktrees, including the main checkout,
  alone.
- Branch from `origin/development`, the default branch, and open PRs against
  `development`. When a feature needs another unmerged branch, branch from it,
  say so, and retarget the PR once that base merges. Branch from `origin/main`
  only for a fix that must ship without the rest of `development`.
- Ask the user before every GitHub action: pushing, creating or editing a PR,
  commenting, requesting reviews, closing, reopening or merging. Local commits
  and verification need no approval.
- Pushing or merging into `development` deploys staging, and `main` is
  production. Never push or merge to `main` unless the user asks for that
  release. Details in [.agents/releases.md](.agents/releases.md).
- Never rebase or rewrite a branch after it was merged into `development`.

## Testing and pushing

- Before you push, run the tests relevant to your change and say in the PR
  which ones ran:
  - `npm run test:unit` for every code change.
  - The matching `npm run test:emulator:*` suite when you touch Firestore
    rules, Functions or a client write path.
  - `npm run test:build` (build and SSR smoke test) when you touch routes, SSR,
    server code, translations or the build.
  - The relevant Playwright spec when you change a page's behaviour or look.
- GitHub CI runs the full suite on every PR from a branch in this repository
  and on every push to `development` and `main`. Merge only when it is green.
  `npm run test:all` runs everything locally when you need it.
- Do not report work as done while a test you ran or the build fails. Fix it or
  name the blocker.

## Code rules

- Never special-case one event, Spot, user, slug or ID in app code, server
  code, SEO or meta tags. Every entity takes the same data-driven path. Test
  fixtures belong in specs, fixture files or seed data. If a test only passes
  for one fixture, fix the code.
- SEO metadata is derived for any entity by the resolver or server render, and
  checked against more than one entity.
- Treat Firestore, Typesense and Function payloads as versioned contracts:
  prefer additive fields and keep legacy fields filled. Details in
  [.agents/backend.md](.agents/backend.md).
- Keep explanations in code comments. Do not add Markdown files that document
  a code change.

## Dependencies

- No broad updates unless the user asks. Keep `package.json` and lockfile diffs
  small and targeted.
- Wait 24 to 72 hours before adopting a newly published version, except for
  urgent security fixes.
- Never run `npm audit fix --force` without reviewing the major changes.
- Install with `npm ci --ignore-scripts` and run only the scripts you need.

## Tooling

- If the Codex sandbox fails with "Abort trap: 6", run the command outside the
  sandbox.
