import { test, expect } from "@playwright/test";
import { MapPage } from "../pages/map.page";

/**
 * Visual regression tests for the Map page.
 * Tag with @visual for selective test runs.
 *
 * Note: Map tests are inherently flaky due to dynamic content (markers, clusters).
 * We use higher tolerance and focus on stable UI elements.
 * Uses 'de' locale for SSR dev build compatibility.
 */
test.describe("Map Page Visual Regression @visual", () => {
  let mapPage: MapPage;

  test.beforeEach(async ({ page }) => {
    mapPage = new MapPage(page);
  });

  test("should match map page UI elements - desktop", async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });

    await mapPage.goto("de");
    await mapPage.waitForMapReady();
    await page.waitForTimeout(2000);
    const mapSurface = page.locator("app-google-map-2d").first();
    const dynamicObjectPanelContent = page.locator(
      [
        "app-map-object-panel app-filter-chips-bar",
        "app-map-object-panel app-map-event-list",
        "app-map-object-panel app-map-community-list",
        "app-map-object-panel app-spot-list",
        "app-map-object-panel .show-more-spots",
      ].join(", "),
    );

    await expect(page).toHaveScreenshot("map-page-desktop.png", {
      maxDiffPixels: 80_000, // Higher tolerance for the masked map edge.
      fullPage: false,
      animations: "disabled",
      mask: [mapSurface, dynamicObjectPanelContent],
    });
  });

  test("should match map page UI elements - mobile", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });

    await mapPage.goto("de");
    await mapPage.waitForMapReady();
    await page.waitForTimeout(2000);
    await expect(
      page.locator("app-bottom-sheet app-map-object-panel .area-header"),
    ).toHaveCSS("padding-top", "0px");
    await expect(
      page.locator("app-bottom-sheet app-spot-preview-card").first(),
    ).toBeInViewport({ ratio: 0.05 });

    await page.addStyleTag({
      content: "gmp-advanced-marker { visibility: hidden !important; }",
    });

    await expect(page).toHaveScreenshot("map-page-mobile.png", {
      maxDiffPixels: 3_000,
      fullPage: false,
      animations: "disabled",
      // Live pins, counts and photos change independently of the sheet geometry.
      mask: [
        page.locator("app-map-object-panel app-filter-chips-bar, app-map-object-panel app-spot-list"),
      ],
    });
  });

  test("keeps one map, panel, search field and chip row across layout switches", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await mapPage.goto("de");
    await mapPage.waitForMapReady();
    await expect(page.locator("mat-drawer app-map-object-panel")).toBeVisible();
    await expect(page.locator("app-spot-map .gm-style")).toBeAttached();

    // Typed but unsubmitted search text must survive with the field.
    const searchInput = page.locator("app-search-field input");
    await searchInput.fill("qxzv");
    await searchInput.press("Escape");
    await searchInput.blur();

    // Tag the live instances; a recreated map, panel, search field or chip
    // row would lose the marks.
    await page.evaluate(() => {
      document.querySelector("app-spot-map .gm-style")?.setAttribute("data-visual-map", "");
      document.querySelector("app-map-object-panel")?.setAttribute("data-visual-panel", "");
      document.querySelector("app-search-field")?.setAttribute("data-visual-search", "");
      document.querySelector(".filter-chips-switcher")?.setAttribute("data-visual-chips", "");
    });
    const map = page.locator("app-spot-map .gm-style[data-visual-map]");
    const panel = page.locator("app-map-object-panel[data-visual-panel]");
    // Live pins, counts and photos change independently of the layout.
    await page.addStyleTag({
      content: "gmp-advanced-marker { visibility: hidden !important; }",
    });
    const dynamicPanelContent = page.locator(
      [
        "app-map-object-panel app-filter-chips-bar",
        "app-map-object-panel app-map-event-list",
        "app-map-object-panel app-map-community-list",
        "app-map-object-panel app-spot-list",
        "app-map-object-panel .show-more-spots",
      ].join(", "),
    );
    // The desktop map sits beside the drawer and keeps its masked edge as in
    // the desktop baseline; on mobile it fills the viewport behind the sheet.
    const mapSurface = page.locator("app-google-map-2d");

    for (const step of [
      { viewport: { width: 375, height: 667 }, host: "app-bottom-sheet", shot: "map-page-resized-mobile.png", mask: [dynamicPanelContent] },
      { viewport: { width: 844, height: 390 }, host: "mat-drawer.map-overlay-drawer" },
      { viewport: { width: 1280, height: 800 }, host: "mat-drawer", shot: "map-page-resized-desktop.png", mask: [mapSurface, dynamicPanelContent] },
    ]) {
      await page.setViewportSize(step.viewport);
      await expect(page.locator(`${step.host} app-map-object-panel[data-visual-panel]`)).toBeAttached();
      await expect(map).toHaveCount(1);
      await expect(panel).toHaveCount(1);
      await expect(page.locator("app-map-object-panel")).toHaveCount(1);
      await expect(page.locator("app-search-field[data-visual-search]")).toHaveCount(1);
      await expect(page.locator(".filter-chips-switcher[data-visual-chips]")).toHaveCount(1);
      await expect(page.locator("app-map-island")).toHaveCount(1);
      await expect(searchInput).toHaveValue("qxzv");
      // The map snaps to the new layout instead of sliding from the old margin.
      const mapBox = (await page.locator("app-spot-map").boundingBox())!;
      expect(mapBox.x + mapBox.width).toBeCloseTo(step.viewport.width, 0);
      if (step.shot) {
        await page.waitForTimeout(1000);
        await expect(page).toHaveScreenshot(step.shot, {
          maxDiffPixels: 3_000,
          fullPage: false,
          animations: "disabled",
          mask: step.mask,
        });
      }
    }
  });

  test("limits marker taps to the visible marker", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await mapPage.goto("de");
    await mapPage.waitForMapReady();
    const pills = page.locator("gmp-advanced-marker .pin-marker.map-marker-hit-target");
    await expect(pills.first()).toBeVisible({ timeout: 20_000 });

    // Sample each marker box (Google sizes it to our content, including
    // collision padding) and require hits only on the visible element.
    const report = await page.evaluate(() => {
      const misses: string[] = [];
      let checked = 0;
      for (const marker of Array.from(document.querySelectorAll("gmp-advanced-marker"))) {
        const target = marker.querySelector(".map-marker-hit-target");
        const box = marker.getBoundingClientRect();
        if (!target || box.width === 0 || box.top < 0 || box.bottom > innerHeight) continue;
        const visible = target.getBoundingClientRect();
        checked++;
        for (let x = box.left + 1; x < box.right; x += 3) {
          for (let y = box.top + 1; y < box.bottom; y += 3) {
            const hit = document.elementFromPoint(x, y);
            if (!hit || !marker.contains(hit)) continue;
            const inside = x >= visible.left - 1 && x <= visible.right + 1 &&
              y >= visible.top - 1 && y <= visible.bottom + 1;
            if (!inside) misses.push(`${target.className}: ${hit.tagName} hit at ${Math.round(x)},${Math.round(y)}`);
          }
        }
        const center = document.elementFromPoint(
          visible.left + visible.width / 2, visible.top + visible.height / 2);
        // Dense markers overlap, and page UI or Google's own layers can cover
        // a low marker. Only a marker swallowing the tap without its pill
        // (the old oversized box) is a failure.
        if (center?.closest("gmp-advanced-marker") && !center.closest(".map-marker-hit-target")) {
          misses.push(`${target.className} center not tappable`);
        }
      }
      return { checked, misses: misses.slice(0, 10) };
    });
    expect(report.checked).toBeGreaterThan(0);
    expect(report.misses).toEqual([]);

    // Taps on the pill still reach Google's marker and open the Spot.
    const pill = (await pills.first().boundingBox())!;
    await page.mouse.click(pill.x + pill.width / 2, pill.y + pill.height / 2);
    await expect(page).toHaveURL(/\/map\/spots\//u);
  });

  test("exposes the theme colours the native iOS tab bar uses", async ({ page }) => {
    await mapPage.goto("de");
    // NativeTabBarService reads these tokens through a probe element and
    // sends them to UITabBarAppearance; they must resolve to real colours.
    const colors = await page.evaluate(() => {
      const probe = document.createElement("span");
      probe.style.display = "none";
      document.body.appendChild(probe);
      const read = (token: string) => {
        probe.style.color = `var(${token})`;
        return getComputedStyle(probe).color;
      };
      const result = ["--mat-sys-primary", "--mat-sys-on-surface-variant", "--mat-sys-surface-container"].map(read);
      probe.remove();
      return result;
    });
    for (const color of colors) {
      expect(color).toMatch(/^rgb\(/u);
      expect(color).not.toBe("rgb(0, 0, 0)");
    }
    expect(new Set(colors).size).toBe(3);
  });

  test("should match filter chips area", async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });

    await mapPage.goto("de");
    await mapPage.waitForMapReady();
    await page.waitForTimeout(1000);

    // Capture filter chips area
    const filterArea = page
      .locator("mat-chip-listbox, .filter-chips, .chip-container")
      .first();

    if (await filterArea.isVisible()) {
      await expect(filterArea).toHaveScreenshot("map-filter-chips.png", {
        maxDiffPixels: 100,
        animations: "disabled",
      });
    }
  });

  test("should match search field", async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });

    await mapPage.goto("de");
    await mapPage.waitForMapReady();
    await page.waitForTimeout(1000);

    // Capture search field
    const searchField = page.locator("app-search-field").first();

    if (await searchField.isVisible()) {
      await expect(searchField).toHaveScreenshot("map-search-field.png", {
        maxDiffPixels: 50,
        animations: "disabled",
      });
    }
  });

  test("should match map controls (speed dial)", async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });

    await mapPage.goto("de");
    await mapPage.waitForMapReady();
    await page.waitForTimeout(1000);

    // Capture FAB menu / direct FAB buttons
    const fabMenu = page
      .locator("app-fab-menu, [mat-fab]")
      .first();

    if (await fabMenu.isVisible()) {
      await expect(fabMenu).toHaveScreenshot("map-speed-dial.png", {
        maxDiffPixels: 50,
        animations: "disabled",
      });
    }
  });
});

test.describe("Map Page - Filter States Visual @visual", () => {
  let mapPage: MapPage;

  test.beforeEach(async ({ page }) => {
    mapPage = new MapPage(page);
  });

  test("should match map page with filter applied", async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });

    await mapPage.goto("de");
    await mapPage.waitForMapReady();
    await page.waitForTimeout(1000);

    // Apply first filter
    const filterChip = page.locator("mat-chip-option").first();
    if (await filterChip.isVisible({ timeout: 5000 })) {
      await filterChip.click();
      await page.waitForTimeout(1000);

      // Capture filter chips area with selection
      const filterArea = page.locator("mat-chip-listbox").first();

      if (await filterArea.isVisible()) {
        await expect(filterArea).toHaveScreenshot("map-filter-selected.png", {
          maxDiffPixels: 100,
          animations: "disabled",
        });
      }
    }
  });
});
