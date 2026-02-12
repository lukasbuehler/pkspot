# Agent Instructions (Repository Root)

These instructions apply to all work in this repository.

## Angular standards

- Follow Angular and TypeScript best practices defined in `/Users/lukas/development/personal/pkspot/.github/copilot-instructions.md`.
- Prefer modern Angular template control flow (`@if`, `@for`, `@switch`) instead of structural directives (`*ngIf`, `*ngFor`, `*ngSwitch`) unless explicitly required by framework/tooling constraints.

## Icon workflow

- When introducing a new Material Symbols icon name in templates or code:
  - Ensure the icon name exists in `/Users/lukas/development/personal/pkspot/src/assets/fonts/icons_list.txt`.
  - If missing, add it to `icons_list.txt` (one icon name per line).
  - Run `npm run icons:optimize` from repo root after updating the list.
