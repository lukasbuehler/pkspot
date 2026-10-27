import {
  DestroyRef,
  type EffectRef,
  Injectable,
  InjectionToken,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from "@angular/core";
import { DOCUMENT } from "@angular/common";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { MatDialog } from "@angular/material/dialog";
import {
  Capacitor,
  registerPlugin,
  type PluginListenerHandle,
} from "@capacitor/core";
import { Subject } from "rxjs";
import {
  NATIVE_TAB_BAR_THEME_TOKENS,
  buildNativeTabBarState,
  cssColorToHex,
  type NativeTabBarColors,
  type NativeTabBarState,
  type NativeTabDestination,
} from "../features/native-tab-bar";

export interface NativeTabBarPlugin {
  isAvailable(): Promise<{ available: boolean }>;
  configure(state: NativeTabBarState): Promise<void>;
  addListener(
    eventName: "tabSelected",
    listener: (event: { id: string }) => void,
  ): Promise<PluginListenerHandle>;
}

/** The app-local iOS plugin (`ios/App/App/NativeTabBarPlugin.swift`). */
export const NATIVE_TAB_BAR_PLUGIN = new InjectionToken<NativeTabBarPlugin>(
  "NATIVE_TAB_BAR_PLUGIN",
  {
    factory: () => {
      const plugin = registerPlugin<NativeTabBarPlugin>("NativeTabBar");
      // Never hand the plugin proxy itself to DI: it answers every property,
      // so the injector would treat it as having `ngOnDestroy` and call the
      // unimplemented method when a (server) injector is destroyed.
      return {
        isAvailable: () => plugin.isAvailable(),
        configure: (state) => plugin.configure(state),
        addListener: (eventName, listener) =>
          plugin.addListener(eventName, listener),
      } satisfies NativeTabBarPlugin;
    },
  },
);

/** Capacitor platform name; a token so tests can choose the platform. */
export const NATIVE_TAB_BAR_PLATFORM = new InjectionToken<string>(
  "NATIVE_TAB_BAR_PLATFORM",
  { factory: () => Capacitor.getPlatform() },
);

/**
 * Connects the web navigation to the native iOS tab bar.
 *
 * Only the iPhone app has one: the plugin reports it as available there, and
 * `available()` stays false on the web, Android, iPad and Mac. AppComponent
 * binds its destinations (whose `active` flags follow the route) with
 * `bind`, and handles `selections` like taps on its own navigation buttons.
 */
@Injectable({ providedIn: "root" })
export class NativeTabBarService {
  private readonly _plugin = inject(NATIVE_TAB_BAR_PLUGIN);
  private readonly _document = inject(DOCUMENT);
  private readonly _isIos = inject(NATIVE_TAB_BAR_PLATFORM) === "ios";

  private readonly _available = signal(false);
  /** True once the iPhone app has confirmed its native tab bar. */
  readonly available = this._available.asReadonly();

  private readonly _hideRequests = signal(0);
  private readonly _dialogOpen = signal(false);
  /**
   * Modal web UI (dialogs and full-screen flows) renders under the native
   * bar, so the bar steps aside while any of it is open.
   */
  readonly hidden = computed(
    () => this._hideRequests() > 0 || this._dialogOpen(),
  );

  private readonly _selections = new Subject<string>();
  /** Destination ids the user chose in the native bar or its More sheet. */
  readonly selections = this._selections.asObservable();

  private _lastConfiguration: string | null = null;
  private _themeColors: NativeTabBarColors | null | undefined;

  constructor() {
    if (!this._isIos) return;

    const dialogs = inject(MatDialog);
    dialogs.afterOpened
      .pipe(takeUntilDestroyed())
      .subscribe(() => this._dialogOpen.set(true));
    dialogs.afterAllClosed
      .pipe(takeUntilDestroyed())
      .subscribe(() => this._dialogOpen.set(false));

    let listener: PluginListenerHandle | undefined;
    let destroyed = false;
    inject(DestroyRef).onDestroy(() => {
      destroyed = true;
      void listener?.remove();
    });

    void this._plugin
      .isAvailable()
      .then(async ({ available }) => {
        if (destroyed || !available) return;
        listener = await this._plugin.addListener("tabSelected", ({ id }) =>
          this._selections.next(id),
        );
        this._available.set(true);
      })
      .catch(() => this._available.set(false));
  }

  /**
   * Hides the native bar until the returned function is called, for
   * full-screen flows that are not dialogs.
   */
  requestHidden(): () => void {
    let released = false;
    this._hideRequests.update((count) => count + 1);
    return () => {
      if (released) return;
      released = true;
      this._hideRequests.update((count) => Math.max(0, count - 1));
    };
  }

  /**
   * Keeps the native bar in sync with the shell's destinations: route changes
   * update the selection, and the bar hides whenever the web app does not
   * want it (another navigation layout, dialogs, full-screen flows). Call it
   * in an injection context; the sync ends with that context.
   */
  bind(source: {
    destinations: () => readonly NativeTabDestination[];
    ownsNavigation: () => boolean;
    moreTitle: () => string;
  }): EffectRef {
    return effect(() => {
      if (!this._available()) return;
      const state = buildNativeTabBarState(source.destinations(), {
        moreTitle: source.moreTitle(),
        hidden: !source.ownsNavigation() || this.hidden(),
      });
      untracked(() => this.configure(state));
    });
  }

  /** Sends the tab bar state to native when it changed. */
  configure(state: NativeTabBarState): void {
    if (!this._available()) return;

    const colors = state.colors ?? this._readThemeColors();
    const configuration = colors ? { ...state, colors } : state;
    const serialized = JSON.stringify(configuration);
    if (serialized === this._lastConfiguration) return;
    this._lastConfiguration = serialized;
    void this._plugin.configure(configuration).catch((error: unknown) => {
      this._lastConfiguration = null;
      console.warn("[NativeTabBar] configure failed", error);
    });
  }

  /** The web theme's colours, read once, so both navigations look alike. */
  private _readThemeColors(): NativeTabBarColors | undefined {
    if (this._themeColors !== undefined) return this._themeColors ?? undefined;

    const body = this._document.body;
    const view = this._document.defaultView;
    if (!body || !view) return undefined;
    const probe = this._document.createElement("span");
    probe.style.display = "none";
    body.appendChild(probe);
    const read = (token: string) => {
      probe.style.color = `var(${token})`;
      return cssColorToHex(view.getComputedStyle(probe).color);
    };
    const selected = read(NATIVE_TAB_BAR_THEME_TOKENS.selected);
    const unselected = read(NATIVE_TAB_BAR_THEME_TOKENS.unselected);
    const background = read(NATIVE_TAB_BAR_THEME_TOKENS.background);
    probe.remove();
    this._themeColors =
      selected && unselected && background
        ? { selected, unselected, background }
        : null;
    return this._themeColors ?? undefined;
  }

}
