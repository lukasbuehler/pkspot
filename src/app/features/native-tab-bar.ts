/** A navigation destination as the app shell describes it. */
export interface NativeTabDestination {
  id: string;
  name: string;
  icon: string;
  alwaysVisible?: boolean;
  liveIndicator?: boolean;
  /** Whether the current route belongs to this destination. */
  active: boolean;
}

/** One tab or overflow entry as `NativeTabBarPlugin.configure` expects it. */
export interface NativeTabItem {
  id: string;
  title: string;
  /** SF Symbol name; native uses the `.fill` variant when selected. */
  symbol: string;
  badge: boolean;
}

/** `#rrggbb` colours from the web theme, so both navigations look alike. */
export interface NativeTabBarColors {
  /** Selected item: the Material 3 primary highlight. */
  selected: string;
  /** Other items: on-surface-variant. */
  unselected: string;
  /** Bar surface where the system does not draw glass. */
  background: string;
}

/** Theme tokens read for `NativeTabBarColors`. */
export const NATIVE_TAB_BAR_THEME_TOKENS: Readonly<
  Record<keyof NativeTabBarColors, string>
> = {
  selected: "--mat-sys-primary",
  unselected: "--mat-sys-on-surface-variant",
  background: "--mat-sys-surface-container",
};

export interface NativeTabBarState {
  items: NativeTabItem[];
  overflow: NativeTabItem[];
  selectedId: string | null;
  hidden: boolean;
  colors?: NativeTabBarColors;
}

export const NATIVE_TAB_BAR_MORE_ID = "more";
/** A compact iPhone tab bar fits five items before they get cramped. */
export const NATIVE_TAB_BAR_MAX_ITEMS = 5;

/** SF Symbols closest to the Material Symbols used by the web navigation. */
const SF_SYMBOLS: Readonly<Record<string, string>> = {
  map: "map",
  steps: "figure.run",
  event: "calendar",
  language: "globe",
  shopping_bag: "bag",
  info: "info.circle",
  gavel: "hammer",
  mobile_border: "iphone",
  person: "person.crop.circle",
  manage_accounts: "person.crop.circle",
  more_horiz: "ellipsis.circle",
};

export function nativeTabSymbol(materialIcon: string): string {
  return SF_SYMBOLS[materialIcon] ?? "circle";
}

/**
 * Where the native bar exists it replaces every web navigation: the bottom
 * bar, the rail and the short-layout Alain menu. iOS keeps the bar visible in
 * landscape and moves it into the iPhone Duo's vertical bar, so the web
 * never needs its fallback menu there.
 */
export function nativeTabBarOwnsNavigation(
  available: boolean,
  embedded: boolean,
): boolean {
  return available && !embedded;
}

/**
 * Splits destinations into tabs and a More overflow like the web bottom bar:
 * destinations keep their order, always-visible ones (the account) stay last,
 * and More takes the last regular slot when everything does not fit.
 */
export function buildNativeTabBarState(
  destinations: readonly NativeTabDestination[],
  options: { moreTitle: string; hidden: boolean },
): NativeTabBarState {
  const regular = destinations.filter((item) => !item.alwaysVisible);
  const pinned = destinations.filter((item) => item.alwaysVisible);
  const regularSlots = Math.max(1, NATIVE_TAB_BAR_MAX_ITEMS - pinned.length);
  const needsMore = regular.length > regularSlots;
  const visibleRegular = needsMore
    ? regular.slice(0, regularSlots - 1)
    : regular;
  const overflowDestinations = needsMore ? regular.slice(regularSlots - 1) : [];

  const toItem = (item: NativeTabDestination): NativeTabItem => ({
    id: item.id,
    title: item.name,
    symbol: nativeTabSymbol(item.icon),
    badge: !!item.liveIndicator,
  });
  const overflow = overflowDestinations.map(toItem);
  const items = [
    ...visibleRegular.map(toItem),
    ...(needsMore
      ? [
          {
            id: NATIVE_TAB_BAR_MORE_ID,
            title: options.moreTitle,
            symbol: nativeTabSymbol("more_horiz"),
            badge: overflow.some((item) => item.badge),
          },
        ]
      : []),
    ...pinned.map(toItem),
  ];

  const activeTab = [...visibleRegular, ...pinned].find((item) => item.active);
  const selectedId =
    activeTab?.id ??
    (overflowDestinations.some((item) => item.active)
      ? NATIVE_TAB_BAR_MORE_ID
      : null);

  return {
    items,
    overflow,
    selectedId,
    hidden: options.hidden,
  };
}

/** Converts a computed CSS `rgb()`/`rgba()` color to `#rrggbb`. */
export function cssColorToHex(color: string): string | undefined {
  const match = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/u.exec(color.trim());
  if (!match) return undefined;
  return `#${match
    .slice(1, 4)
    .map((channel) => Number(channel).toString(16).padStart(2, "0"))
    .join("")}`;
}
