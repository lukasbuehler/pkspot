/**
 * Navigation is a viewport-shape decision, separate from the content density
 * breakpoints. This lets a compact unfolded device use a rail without making
 * every 640px-wide page behave like desktop content.
 */
export type NavigationLayout = "rail" | "bottom" | "menu";
export type MapPanelLayout = "bottom-sheet" | "drawer-overlay" | "drawer-side";

export interface NavigationViewport {
  width: number | null;
  height: number | null;
}

const RAIL_MIN_WIDTH = 640;
const RAIL_MIN_HEIGHT = 560;

export function isAlainViewport({ width, height }: NavigationViewport): boolean {
  if (width === null || height === null) return false;

  return height < 500 || (width < 768 && height < 700);
}

export function getNavigationLayout(
  viewport: NavigationViewport,
): NavigationLayout {
  if (isAlainViewport(viewport)) return "menu";

  const { width, height } = viewport;
  if (width !== null && height !== null && width >= RAIL_MIN_WIDTH && height >= RAIL_MIN_HEIGHT) {
    return "rail";
  }

  return "bottom";
}

/**
 * The map presentation must follow the shell navigation choice. Keeping this
 * in one pure helper prevents a narrow viewport from getting a bottom bar and
 * a side drawer at the same time.
 */
export function getMapPanelLayout(
  viewport: NavigationViewport,
): MapPanelLayout {
  const navigation = getNavigationLayout(viewport);

  if (navigation === "bottom") return "bottom-sheet";

  const { height, width } = viewport;
  if (navigation === "menu") {
    return height !== null && height < 500
      ? "drawer-overlay"
      : "bottom-sheet";
  }

  return width !== null && width < 768 ? "drawer-overlay" : "drawer-side";
}
