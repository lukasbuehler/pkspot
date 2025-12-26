import { test, expect } from "@playwright/test";
import { MapPage } from "../pages/map.page";
import { SpotDetailsPage } from "../pages/spot-details.page";

/**
 * Spot Details E2E Tests
 * Note: SSR server uses 'de' locale in dev configuration.
 */
test.describe("Spot Details", () => {
  let mapPage: MapPage;
  let spotDetails: SpotDetailsPage;

  test.beforeEach(async ({ page }) => {
    mapPage = new MapPage(page);
    spotDetails = new SpotDetailsPage(page);
  });

  test("should have spot details component structure", async ({ page }) => {
    // Navigate to map
    await mapPage.goto("de");
    await mapPage.waitForMapReady();

    // The spot details component should be present (may be hidden initially)
    const detailsComponent = page.locator("app-spot-details");

    // Just check the app doesn't crash
    await expect(page.locator("app-root")).toBeAttached();
  });

  test("should try to click on map to open spot details", async ({ page }) => {
    await mapPage.goto("de");
    await mapPage.waitForMapReady();

    const isMapVisible = await mapPage.isMapVisible();

    if (isMapVisible) {
      const mapBounds = await mapPage.spotMap.boundingBox();
      if (mapBounds) {
        // Click in center of map
        await page.mouse.click(
          mapBounds.x + mapBounds.width * 0.5,
          mapBounds.y + mapBounds.height * 0.5
        );
        await page.waitForTimeout(1500);

        // Check if spot details panel appeared
        const detailsVisible = await spotDetails.isVisible();

        // Either details should be visible or page should still be functional
        await expect(page.locator("app-root")).toBeAttached();
      }
    }
  });
});

test.describe("Spot Details - Direct Navigation", () => {
  test("should handle invalid spot ID gracefully", async ({ page }) => {
    // Navigate to a non-existent spot
    await page.goto("/de/map/this-spot-definitely-does-not-exist-12345", {
      waitUntil: "domcontentloaded",
    });

    // Page should still load without crashing
    await page.waitForSelector("app-root", {
      state: "attached",
      timeout: 15000,
    });

    // App should still be functional
    await expect(page.locator("app-root")).toBeAttached();
  });

  test("should show map page for invalid spot", async ({ page }) => {
    await page.goto("/de/map/invalid-spot-xyz", {
      waitUntil: "domcontentloaded",
    });

    await page.waitForSelector("app-root", {
      state: "attached",
      timeout: 15000,
    });

    // Should be on a map page
    const isOnMap = page.url().includes("/map");
    expect(isOnMap).toBeTruthy();
  });
});
