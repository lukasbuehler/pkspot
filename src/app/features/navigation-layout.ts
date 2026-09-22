/**
 * Navigation is a viewport-shape decision, separate from the content density
 * breakpoints. This lets a compact unfolded device use a rail without making
 * every 640px-wide page behave like desktop content.
 */
export type NavigationLayout = "rail" | "bottom" | "menu";

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
