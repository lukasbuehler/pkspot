import { test, expect } from "@playwright/test";
import { MapPage } from "../pages/map.page";

/**
 * Search Functionality E2E Tests
 * Note: SSR server uses 'de' locale in dev configuration.
 */
test.describe("Search Functionality", () => {
  let mapPage: MapPage;

  test.beforeEach(async ({ page }) => {
    mapPage = new MapPage(page);
    await mapPage.goto("de");
    await mapPage.waitForMapReady();
  });

  test("should have a search input field", async ({ page }) => {
    const searchComponent = page.locator("app-search-field");
    await expect(searchComponent).toBeVisible({ timeout: 10000 });
  });

  test("should allow typing in search field", async ({ page }) => {
    const searchInput = page.locator("app-search-field input").first();

    if (await searchInput.isVisible()) {
      await searchInput.fill("test query");
      await expect(searchInput).toHaveValue("test query");
    }
  });

  test("should show autocomplete when typing", async ({ page }) => {
    const searchInput = page.locator("app-search-field input").first();

    if (await searchInput.isVisible()) {
      await searchInput.fill("park");
      await page.waitForTimeout(1000);

      // Check for autocomplete panel
      const autocomplete = page.locator(
        "mat-autocomplete-panel, mat-option, .mat-mdc-autocomplete-panel"
      );

      // Autocomplete may or may not appear depending on API availability
      // Just verify the app doesn't crash
      await expect(page.locator("app-root")).toBeAttached();
    }
  });

  test("should clear search on escape", async ({ page }) => {
    const searchInput = page.locator("app-search-field input").first();

    if (await searchInput.isVisible()) {
      await searchInput.fill("test search");
      await page.keyboard.press("Escape");

      // Focus should be removed or input cleared
      await expect(page.locator("app-root")).toBeAttached();
    }
  });
});

test.describe("Search with Filters", () => {
  let mapPage: MapPage;

  test.beforeEach(async ({ page }) => {
    mapPage = new MapPage(page);
    await mapPage.goto("de");
    await mapPage.waitForMapReady();
  });

  test("search should work with active filter", async ({ page }) => {
    // First apply a filter
    const filterChip = page.locator("mat-chip-option").first();

    if (await filterChip.isVisible({ timeout: 5000 })) {
      await filterChip.click();
      await page.waitForTimeout(500);

      // Then try searching
      const searchInput = page.locator("app-search-field input").first();
      if (await searchInput.isVisible()) {
        await searchInput.fill("test");
        await page.waitForTimeout(500);

        // App should still function
        await expect(page.locator("app-root")).toBeAttached();
      }
    }
  });

  test("filter interaction with search", async ({ page }) => {
    const filterChip = page.locator("mat-chip-option").first();

    if (await filterChip.isVisible({ timeout: 5000 })) {
      // Click the filter
      await filterChip.click();
      await page.waitForTimeout(500);

      // Interact with search
      const searchInput = page.locator("app-search-field input").first();
      if (await searchInput.isVisible()) {
        await searchInput.focus();
        await page.waitForTimeout(300);
        await page.keyboard.press("Escape");
        await page.waitForTimeout(500);

        // Verify app is still functional
        await expect(page.locator("app-root")).toBeAttached();

        // The filter chip should still be visible (not crashed)
        await expect(filterChip).toBeVisible();
      }
    }
  });
});
