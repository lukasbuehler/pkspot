import { Page, Locator } from "@playwright/test";

/**
 * Page Object Model for the Home page.
 * Uses 'de' locale for SSR dev build compatibility.
 */
export class HomePage {
  readonly page: Page;
  readonly heroSection: Locator;
  readonly navRail: Locator;
  readonly mapButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heroSection = page.locator('.hero, [class*="hero"]').first();
    this.navRail = page.locator("app-nav-rail, nav");
    this.mapButton = page
      .locator('a[href*="/map"], button:has-text("Map"), a:has-text("Karte")')
      .first();
  }

  async goto(locale: string = "de") {
    await this.page.goto(`/${locale}/`, { waitUntil: "domcontentloaded" });
    // Wait for Angular to hydrate
    await this.page.waitForSelector("app-root", {
      state: "attached",
      timeout: 15000,
    });
    await this.page.waitForTimeout(1000);
  }

  async navigateToMap() {
    await this.mapButton.click();
    await this.page.waitForURL("**/map**");
  }
}
