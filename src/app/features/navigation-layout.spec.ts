import { describe, expect, it } from "vitest";
import {
  getMapPanelLayout,
  getNavigationLayout,
  isAlainViewport,
} from "./navigation-layout";

describe("navigation layout", () => {
  it("keeps short or compact viewports in Alain menu mode", () => {
    expect(getNavigationLayout({ width: 678, height: 466 })).toBe("menu");
    expect(getNavigationLayout({ width: 466, height: 678 })).toBe("menu");
    expect(isAlainViewport({ width: 390, height: 680 })).toBe(true);
  });

  it("uses a rail for an unfolded passport-shaped display", () => {
    // iPhone Duo inner display (published 669 × 951 CSS planning viewport).
    expect(getNavigationLayout({ width: 669, height: 951 })).toBe("rail");
    // Galaxy Z Fold8's unfolded display is 4:3; this is a representative
    // browser viewport, not raw panel pixels.
    expect(getNavigationLayout({ width: 720, height: 960 })).toBe("rail");
    expect(getNavigationLayout({ width: 960, height: 720 })).toBe("rail");
  });

  it("uses the floating bottom navigation on ordinary phones", () => {
    expect(getNavigationLayout({ width: 390, height: 844 })).toBe("bottom");
  });

  it("keeps map panels aligned with the navigation shell", () => {
    // This was previously the broken range: a bottom nav with a side drawer.
    expect(getMapPanelLayout({ width: 620, height: 900 })).toBe("bottom-sheet");
    expect(getMapPanelLayout({ width: 669, height: 951 })).toBe("drawer-overlay");
    expect(getMapPanelLayout({ width: 960, height: 720 })).toBe("drawer-side");
    expect(getMapPanelLayout({ width: 436, height: 314 })).toBe(
      "drawer-overlay",
    );
    expect(getMapPanelLayout({ width: 678, height: 466 })).toBe("drawer-overlay");
  });
});
