# Agent Instructions (Repository Root)

These instructions apply to all work in this repository.

## Angular standards

- Write clean, readable, and well-documented code.
- Do not create separate Markdown documentation files for code changes. Keep durable explanations in code comments when needed, and use chat for temporary explanation.
- Use strict TypeScript settings and prefer type inference when the type is obvious.
- Avoid `any`; use `unknown` when the type is uncertain.
- Always use standalone Angular components rather than NgModules.
- Do not set `standalone: true` inside Angular decorators. It is the default.
- Use signals for local state and `computed()` for derived state.
- Do not use `mutate` on signals; use `update` or `set` instead.
- Implement lazy loading for feature routes where appropriate.
- Do not use `@HostBinding` or `@HostListener`; put host bindings in the `host` object of the `@Component` or `@Directive` decorator instead.
- Use `NgOptimizedImage` for static images when compatible.
  `NgOptimizedImage` does not work for inline base64 images.
- Keep components focused on a single responsibility.
- Use `input()` and `output()` instead of decorator-based inputs and outputs.
- Set `changeDetection: ChangeDetectionStrategy.OnPush` in component decorators.
- Prefer inline templates for small components.
- Prefer reactive forms instead of template-driven forms.
- Do not use `ngClass`; use `class` bindings instead.
- Do not use `ngStyle`; use `style` bindings instead.
- Keep templates simple and avoid complex logic.
- Prefer modern Angular template control flow (`@if`, `@for`, `@switch`) instead of structural directives (`*ngIf`, `*ngFor`, `*ngSwitch`) unless explicitly required by framework/tooling constraints.
- Use the async pipe to handle observables in templates.
- Design services around a single responsibility.
- Use `providedIn: 'root'` for singleton services.
- Use `inject()` instead of constructor injection where practical.

## Theme colors

- Use Material 3 system tokens (`var(--mat-sys-primary)`, `var(--mat-sys-secondary)`, etc.) — never hardcoded hex unless used as a fallback.
- **Green (`--mat-sys-secondary`) is reserved for live / "happening now" things**: active check-ins, live events, the active nav-rail item, "ongoing" status badges, anything indicating a real-time presence.
- **Blue (`--mat-sys-primary`) is the highlight color**: spot pins, primary CTAs ("Sign in", "Add Spot"), important buttons, active selections, links inside body copy.
- **Red (`--mat-sys-error`) is reserved for destructive / past / error states**: past-event banners, validation errors, delete confirmations.
- Tertiary, surface variants, and outline tokens are general-purpose and can be used freely for UI structure.
- Do not use the green accent for static decoration — overuse breaks the "this is happening live" signal.

## Icon workflow

- When introducing a new Material Symbols icon name in templates or code:
  - Ensure the icon name exists in `/Users/lukas/development/personal/pkspot/src/assets/fonts/icons_list.txt`.
  - If missing, add it to `icons_list.txt` (one icon name per line).
  - Run `npm run icons:optimize` from repo root after updating the list.

## Testing

- Use `npm run test:unit` for the Vitest unit suite.
- Use `npm run test:build` for the build and SSR smoke test. This verifies `npm run build`, copied proxy server files, generated `dist/pkspot/server/build-info.mjs`, localized build output, and that SSR serves real HTML without falling back to client-side rendering.
- Use `npm run test:all` for the main local verification pass before shipping changes. It runs the unit suite and the build/SSR smoke test.
- End-to-end browser coverage remains available via `npm run test:e2e` when needed.
