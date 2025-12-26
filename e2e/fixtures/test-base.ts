import { test as base, expect } from "@playwright/test";

/**
 * Custom test fixtures for pkspot E2E tests.
 * Extends the base Playwright test with app-specific helpers.
 */
export const test = base.extend<{
  /**
   * Wait for the Angular app to be fully loaded and stable.
   */
  waitForAppReady: () => Promise<void>;
}>({
  waitForAppReady: async ({ page }, use) => {
    const waitForAppReady = async () => {
      // Wait for Angular to be ready
      await page.waitForLoadState("networkidle");

      // Wait for the main app component to be present
      await page.waitForSelector("app-root", { state: "attached" });

      // Give Angular time to stabilize
      await page.waitForTimeout(500);
    };

    await use(waitForAppReady);
  },
});

export { expect };
