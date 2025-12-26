import { test, expect } from "@playwright/test";
import { MapPage } from "../pages/map.page";
import { SpotDetailsPage } from "../pages/spot-details.page";

/**
 * Visual regression tests for Spot Details.
 * Tag with @visual for selective test runs.
 * Uses 'de' locale for SSR dev build compatibility.
 */
test.describe("Spot Details Visual Regression @visual", () => {
  let mapPage: MapPage;
  let spotDetails: SpotDetailsPage;

  test.beforeEach(async ({ page }) => {
    mapPage = new MapPage(page);
    spotDetails = new SpotDetailsPage(page);
  });

  test("should match spot details panel when opened", async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });

    await mapPage.goto("de");
    await mapPage.waitForMapReady();
    await page.waitForTimeout(1000);

    // Try to open a spot by clicking on the map
    const isMapVisible = await mapPage.isMapVisible();

    if (isMapVisible) {
      const mapBounds = await mapPage.spotMap.boundingBox();
      if (mapBounds) {
        // Click in center-ish area
        await page.mouse.click(
          mapBounds.x + mapBounds.width * 0.4,
          mapBounds.y + mapBounds.height * 0.4
        );
        await page.waitForTimeout(2000);

        // If spot details opened, take screenshot
        if (await spotDetails.isVisible()) {
          await expect(spotDetails.container).toHaveScreenshot(
            "spot-details-panel.png",
            {
              maxDiffPixels: 200,
              animations: "disabled",
              mask: [
                // Mask images which may load differently
                page.locator("app-spot-details img"),
                page.locator("app-spot-details swiper-container"),
                page.locator("app-img-carousel"),
              ],
            }
          );
        } else {
          // No spot clicked, skip this test
          test.skip();
        }
      }
    } else {
      test.skip();
    }
  });

  test("should match spot details - mobile bottom sheet", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });

    await mapPage.goto("de");
    await mapPage.waitForMapReady();
    await page.waitForTimeout(1000);

    const isMapVisible = await mapPage.isMapVisible();

    if (isMapVisible) {
      // Try to open a spot
      const mapBounds = await mapPage.spotMap.boundingBox();
      if (mapBounds) {
        await page.mouse.click(
          mapBounds.x + mapBounds.width * 0.5,
          mapBounds.y + mapBounds.height * 0.3
        );
        await page.waitForTimeout(2000);

        // Check for bottom sheet or spot details on mobile
        const bottomSheet = page.locator("app-bottom-sheet, .bottom-sheet");
        const details = page.locator("app-spot-details");

        if (await bottomSheet.isVisible()) {
          await expect(bottomSheet).toHaveScreenshot(
            "spot-details-bottom-sheet.png",
            {
              maxDiffPixels: 200,
              animations: "disabled",
              mask: [page.locator("app-spot-details img")],
            }
          );
        } else if (await details.isVisible()) {
          await expect(details).toHaveScreenshot("spot-details-mobile.png", {
            maxDiffPixels: 200,
            animations: "disabled",
            mask: [page.locator("app-spot-details img")],
          });
        } else {
          test.skip();
        }
      }
    } else {
      test.skip();
    }
  });
});

test.describe("Spot Details Components Visual @visual", () => {
  test("should match spot rating component", async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });

    await page.goto("/de/map");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    // Find rating component if visible
    const rating = page.locator("app-spot-rating").first();

    if (await rating.isVisible()) {
      await expect(rating).toHaveScreenshot("spot-rating-component.png", {
        maxDiffPixels: 50,
        animations: "disabled",
      });
    }
  });

  test("should match amenities section", async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });

    await page.goto("/de/map");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    // Find amenities section if visible
    const amenities = page.locator('[class*="amenities"]').first();

    if (await amenities.isVisible()) {
      await expect(amenities).toHaveScreenshot("spot-amenities-section.png", {
        maxDiffPixels: 100,
        animations: "disabled",
      });
    }
  });
});
