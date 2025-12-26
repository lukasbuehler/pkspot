import { test, expect } from "@playwright/test";
import { HomePage } from "../pages/home.page";

/**
 * Visual regression tests for the Home page.
 * Tag with @visual for selective test runs.
 * Note: Uses 'de' locale for SSR dev build compatibility.
 */
test.describe("Home Page Visual Regression @visual", () => {
  let homePage: HomePage;

  test.beforeEach(async ({ page }) => {
    homePage = new HomePage(page);
  });

  test("should match home page screenshot - desktop", async ({ page }) => {
    // Set desktop viewport
    await page.setViewportSize({ width: 1920, height: 1080 });

    await homePage.goto("de");
    await page.waitForLoadState("networkidle");

    // Wait for any animations to complete
    await page.waitForTimeout(2000);

    // Take full page screenshot
    await expect(page).toHaveScreenshot("home-page-desktop.png", {
      maxDiffPixels: 500,
      fullPage: true,
      animations: "disabled",
    });
  });

  test("should match home page screenshot - tablet", async ({ page }) => {
    // Set tablet viewport
    await page.setViewportSize({ width: 768, height: 1024 });

    await homePage.goto("de");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    await expect(page).toHaveScreenshot("home-page-tablet.png", {
      maxDiffPixels: 500,
      fullPage: true,
      animations: "disabled",
    });
  });

  test("should match home page screenshot - mobile", async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });

    await homePage.goto("de");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    await expect(page).toHaveScreenshot("home-page-mobile.png", {
      maxDiffPixels: 500,
      fullPage: true,
      animations: "disabled",
    });
  });

  test("should match navigation area screenshot", async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });

    await homePage.goto("de");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1000);

    // Capture just the navigation area
    const nav = page.locator("app-nav-rail, mat-toolbar, header, nav").first();

    if (await nav.isVisible()) {
      await expect(nav).toHaveScreenshot("home-navigation.png", {
        maxDiffPixels: 100,
        animations: "disabled",
      });
    }
  });
});

test.describe("Home Page - Dark Mode Visual @visual", () => {
  test("should match home page in dark mode", async ({ page }) => {
    // Emulate dark color scheme
    await page.emulateMedia({ colorScheme: "dark" });

    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto("/de/");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    await expect(page).toHaveScreenshot("home-page-dark-mode.png", {
      maxDiffPixels: 500,
      fullPage: true,
      animations: "disabled",
    });
  });
});
