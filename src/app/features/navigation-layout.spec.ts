import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
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

  it("reserves document space only for the floating bottom navigation", () => {
    const contentStyles = readFileSync(
      join(
        process.cwd(),
        "src/app/components/nav-rail-content/nav-rail-content.component.scss",
      ),
      "utf8",
    );
    const settingsStyles = readFileSync(
      join(
        process.cwd(),
        "src/app/components/settings-page/settings-page.component.scss",
      ),
      "utf8",
    );
    const aboutStyles = readFileSync(
      join(
        process.cwd(),
        "src/app/components/about-page/about-page.component.scss",
      ),
      "utf8",
    );
    const mapStyles = readFileSync(
      join(
        process.cwd(),
        "src/app/components/map-page/map-page.component.scss",
      ),
      "utf8",
    );
    const globalStyles = readFileSync(
      join(process.cwd(), "src/styles.scss"),
      "utf8",
    );

    expect(contentStyles).toMatch(
      /\.main-content\s*{[^}]*padding-block-end:\s*var\(\s*--document-navigation-bottom-clearance,\s*var\(--navigation-bottom-clearance,\s*0px\)\s*\)/s,
    );
    expect(globalStyles).toMatch(
      /app-root\.immersive-map-route,\s*app-root\.event-map-route\s*{[^}]*--document-navigation-bottom-clearance:\s*0px/s,
    );
    expect(mapStyles).toMatch(
      /:host-context\(app-root\.immersive-map-route\)\s*{[^}]*height:\s*100dvh/s,
    );
    expect(aboutStyles).toMatch(
      /\.about-page-background\s*{[^}]*margin-block-end:\s*calc\(-1 \* var\(--navigation-bottom-clearance,\s*0px\)\)[^}]*padding-block-end:\s*var\(--navigation-bottom-clearance,\s*0px\)/s,
    );
    expect(settingsStyles).not.toMatch(/overflow-y:\s*scroll/);
    expect(settingsStyles).not.toMatch(/padding-bottom:\s*100px/);
  });
});
