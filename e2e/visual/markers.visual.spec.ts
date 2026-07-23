import { test, expect } from "@playwright/test";
import { acceptCurrentTerms } from "../fixtures/consent";

test.describe("Marker Visual Regression @visual", () => {
  test("should match marker variants", async ({ page }) => {
    await acceptCurrentTerms(page);
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
