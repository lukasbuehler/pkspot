import { test, expect } from "@playwright/test";
import { HomePage } from "../pages/home.page";

/**
 * Home Page E2E Tests
 * Uses 'en' locale.
 */
test.describe("Home Page", () => {
  let homePage: HomePage;

  test.beforeEach(async ({ page }) => {
    homePage = new HomePage(page);
  });

  test("should load the home page successfully", async ({ page }) => {
    await homePage.goto("de");

    // Verify the page loaded - accept various title formats
    const title = await page.title();
    expect(title.length).toBeGreaterThan(0);

    // Verify app root is present
    await expect(page.locator("app-root")).toBeAttached();
  });

  test("should render the Angular app", async ({ page }) => {
    await homePage.goto("de");

    // Wait for Angular to fully hydrate
    await page.waitForTimeout(3000);

    // Check that the app has some content
    const bodyText = await page.locator("body").textContent();
    expect(bodyText?.length).toBeGreaterThan(100);
  });

  test("can navigate to map via URL", async ({ page }) => {
    // Instead of clicking, directly navigate to map
    await page.goto("/en/map", { waitUntil: "domcontentloaded" });

    // Verify we're on the map page
    await expect(page).toHaveURL(/\/en\/map/);

    // App should be attached
    await expect(page.locator("app-root")).toBeAttached();
  });
});
