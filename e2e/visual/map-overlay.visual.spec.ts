import { expect, test } from "@playwright/test";

test.describe("Map Overlay Visual Regression @visual", () => {
  test("should match search and filter chips", async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("acceptedVersion", "5");
    });
    await page.setViewportSize({ width: 840, height: 220 });
    await page.goto("/de/__visual/map-overlay", {
      waitUntil: "domcontentloaded",
    });
    await page.waitForSelector("app-map-overlay-visual-test-page", {
      state: "attached",
    });
    await page.waitForTimeout(500);

    await expect(page.locator(".map-overlay-surface")).toHaveScreenshot(
      "map-search-and-filter-chips.png",
      {
        animations: "disabled",
        maxDiffPixels: 250,
      },
    );
  });
});
