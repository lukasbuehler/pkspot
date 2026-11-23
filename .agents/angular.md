# Angular guide

Read this before writing or reviewing Angular code in `src/app`. The app uses
Angular 22; check the installed version before applying version-sensitive
advice. Prefer the official `angular-developer` skill when your tool has it.

## Conventions this repository chose

- Standalone components only. Do not set `standalone: true`; it is the default.
- `changeDetection: ChangeDetectionStrategy.OnPush` on every component.
- A separate `.html` template file for every new component, even small ones.
- `input()`, `output()` and `inject()`; no decorator inputs or constructor
  injection where `inject()` works.
- Host bindings go in the decorator's `host` object, never `@HostBinding` or
  `@HostListener`.
- `class` and `style` bindings, never `ngClass` or `ngStyle`.
- `@if`, `@for` and `@switch`, never the structural directives. `@for` tracks a
  stable identity; `$index` only for lists that never change.
- Strict TypeScript. Avoid `any`; use `unknown` when the type is uncertain.
- New isolated forms may use signal forms. Form-heavy features keep typed
  reactive forms. No template-driven forms for complex flows.
- `NgOptimizedImage` for static images where it works (not for base64 images).
- Lazy-load feature routes. Singleton services use `providedIn: 'root'`.
- Durable explanations go in code comments, not in new Markdown files.

## Signals and zoneless change detection

- The app is zoneless. Do not add ZoneJS or `provideZoneChangeDetection()`.
- Async callbacks that change rendered state must write a signal the template
  reads, emit through an output, use `AsyncPipe`, or call `markForCheck()`.
- Never use `NgZone.onStable`, `onUnstable` or `onMicrotaskEmpty`; use
  `afterNextRender()` or a browser observer.
- `computed()` for derived state, `linkedSignal()` when derived state can also
  be overridden. Never use `effect()` to copy one signal into another.
- `set` and `update` only; never `mutate`.
- Services expose writable state with `.asReadonly()`.
- `resource()` / `httpResource()` for signal-driven loading; pass the abort
  signal to cancellable fetches.

## Templates

- No expensive calls in templates. Filtering, sorting, grouping, formatting and
  anything that allocates belongs in `computed()`, a memoized helper or a pure
  pipe. Template method calls are only for cheap event handlers, `track`
  functions and trivial reads.

## Reuse before you build

- Search, autocomplete and pickers: reuse `app-search-field`,
  `app-spot-picker` and `app-entity-reference-autocomplete`. Extend them or
  extract a shared component; never build a one-off picker inline.
- For UI building blocks (panels, FAB menus, cards, colours) read
  [ui.md](ui.md).

## Tests

- Component tests stay zoneless through the shared Analog TestBed setup.

## Runtime debugging

For bugs in signal state, DI, rendering, browser-only behaviour, network or
performance, use Chrome DevTools MCP when available, together with source
reading and a regression test. A runtime graph alone is not proof.

- The Angular in-page tools exist only in development builds; inspect a local
  dev server.
- After the app loads, call `list_3p_developer_tools`. Run
  `angular:signal_graph` on a component host element for its signals,
  computeds, effects and template consumers, and `angular:di_graph` for
  injectors and provider resolution. Confirm findings in source.
- Use an isolated browser profile and local fixtures. Never inspect a signed-in
  production session unless the user explicitly allows it.
- If these tools are missing, say so briefly and continue with Playwright,
  unit tests and source-level debugging.
