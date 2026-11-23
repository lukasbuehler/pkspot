# UI guide

Read this before changing how anything looks: colours, cards, panels, menus,
icons or page layout.

## Colours

Use Material 3 system tokens (`var(--mat-sys-primary)` and so on). Hex values
only as fallbacks.

- **Green (`--mat-sys-secondary`) means live:** active check-ins, live events,
  the active nav-rail item, "ongoing" badges. Never use it for decoration, or it
  stops meaning "happening now".
- **Blue (`--mat-sys-primary`) is the highlight:** Spot pins, primary actions
  ("Sign in", "Add Spot"), active selections, links in body text.
- **Red (`--mat-sys-error`) is destructive, past or wrong:** past-event banners,
  validation errors, delete confirmations.
- Tertiary, surface variants and outline tokens are free for structure.

## Tonal cards

Coloured information and status cards all share one structure: the role's
container and on-container colours, a 1 px outline in the role colour, an 18 px
radius, and a separate 40 px tonal icon tile with a 13 px radius.

## Shared components

- Expandable panels: Angular Material `mat-expansion-panel`. No custom
  disclosure panels and no native `details`/`summary`.
- FABs with several actions: the shared `app-fab-menu`
  (`src/app/components/fab-menu`). No `mat-menu` and no other speed dial. Use
  `direction="down"` and `alignment="start"` for top-left navigation; page
  actions use the default upward menu.

## Floating navigation clearance (Alain Mode)

On viewports under 500 px high, or under 768 px wide and under 700 px high, the
app shows the `#alainMenuButton` FAB in the top-left instead of the usual
navigation. A scrolling page whose content starts at the top reserves the space
itself, with the same media condition and
`padding-block-start: max(80px, calc(72px + var(--safe-area-inset-top, env(safe-area-inset-top, 0px))))`.
Never move or restyle the menu FAB to fix a collision. Add an Alain-mode visual
route that uses `assertAlainClearance` on the page header or first interactive
element (at least an 8 px gap).

## Icons

The app ships subsets of Material Symbols Rounded.

- New icon name: add it to `src/assets/fonts/icons_list.txt` (one per line),
  then run `npm run icons:optimize`.
- Outlined icons use a second subset. Add the base name to
  `src/assets/fonts/icons_outline_list.txt`. If the name is not a real Google
  glyph (for example `mobile_border`), add an alias in
  `scripts/optimize_icons.py`. Select the font in the template or CSS with
  `material-symbols-rounded-outline` or
  `font-family: "Material Symbols Rounded Outlined"`; adding the name alone does
  not switch a `<mat-icon>`. Run `npm run icons:optimize` afterwards.

## Visual tests

A new user-facing route or first-level page gets route-level coverage in
`e2e/visual/routes.visual.spec.ts`, with stable fixture data for dynamic pages
and the screenshot auth fixture for signed-in states.
