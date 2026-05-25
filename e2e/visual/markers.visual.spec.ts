import { test, expect } from "@playwright/test";

test.describe("Marker Visual Regression @visual", () => {
  test("should match marker variants", async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("acceptedVersion", "4");
    });
    await page.setViewportSize({ width: 900, height: 520 });
    await page.goto("/de/__visual/markers", { waitUntil: "domcontentloaded" });
    await page.waitForSelector("app-marker-visual-test-page", {
      state: "attached",
    });
    await page.waitForTimeout(500);

    await expect(page.locator(".marker-surface")).toHaveScreenshot(
      "marker-variants.png",
      {
        animations: "disabled",
        maxDiffPixels: 80,
      }
    );
  });
});
