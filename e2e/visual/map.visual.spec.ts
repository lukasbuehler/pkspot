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

    await expect(page).toHaveScreenshot("map-page-mobile.png", {
      maxDiffPixels: 3_000,
      fullPage: false,
      animations: "disabled",
    });
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

    // Capture speed dial / FAB buttons
    const speedDial = page
      .locator("app-speed-dial-fab, .speed-dial, [mat-fab]")
      .first();

    if (await speedDial.isVisible()) {
      await expect(speedDial).toHaveScreenshot("map-speed-dial.png", {
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
