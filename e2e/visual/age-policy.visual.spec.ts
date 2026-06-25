import { test, expect, type Page } from "@playwright/test";

test.describe("Age policy visual states @visual", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem(
        "pkspot.mockAgePolicyState.v1",
        "read_only_age_restricted"
      );
    });
  });

  async function prepareAgePolicyPage(page: Page) {
    await page.goto("/de/__visual/age-policy", {
      waitUntil: "domcontentloaded",
    });
    await page.addStyleTag({
      content: `
        app-nav-rail,
        mat-toolbar,
        #alainMenuButton,
        app-footer,
        footer,
        .terms-footer,
        .footer,
        .app-footer {
          visibility: hidden !important;
        }
      `,
    });
    await page.waitForLoadState("networkidle");
    await expect(page.locator("mat-dialog-container")).toHaveCount(0);
  }

  test("should match contribution unavailable profile/settings notice", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1024, height: 720 });
    await prepareAgePolicyPage(page);

    await expect(page).toHaveScreenshot(
      "age-policy-contribution-unavailable.png",
      {
        maxDiffPixels: 100,
        animations: "disabled",
        fullPage: true,
      }
    );
  });

  test("should match contribution unavailable notice on mobile", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 1200 });
    await prepareAgePolicyPage(page);

    await expect(page.locator(".profile-overview__card")).toHaveScreenshot(
      "age-policy-contribution-unavailable-mobile.png",
      {
        maxDiffPixels: 100,
        animations: "disabled",
      }
    );
  });
});
