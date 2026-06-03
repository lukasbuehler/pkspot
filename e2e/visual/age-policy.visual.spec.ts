import { test, expect } from "@playwright/test";

test.describe("Age policy visual states @visual", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem(
        "pkspot.mockAgePolicyState.v1",
        "read_only_age_restricted"
      );
    });
  });

  test("should match contribution unavailable profile/settings notice", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1024, height: 720 });
    await page.goto("/de/__visual/age-policy");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("mat-dialog-container")).toHaveCount(0);

    await expect(page.locator(".age-policy-surface")).toHaveScreenshot(
      "age-policy-contribution-unavailable.png",
      {
        maxDiffPixels: 100,
        animations: "disabled",
      }
    );
  });

  test("should match contribution unavailable notice on mobile", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("/de/__visual/age-policy");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("mat-dialog-container")).toHaveCount(0);

    await expect(page.locator(".age-policy-surface")).toHaveScreenshot(
      "age-policy-contribution-unavailable-mobile.png",
      {
        maxDiffPixels: 100,
        animations: "disabled",
      }
    );
  });
});
