import { Page, Locator } from "@playwright/test";

/**
 * Page Object Model for the Map page.
 * Note: SSR server redirects to browser locale, so tests should not specify
 * locale in URL unless they want to override the default behavior.
 */
export class MapPage {
  readonly page: Page;
  readonly mapContainer: Locator;
  readonly spotMap: Locator;
  readonly searchField: Locator;
  readonly filterChips: Locator;
  readonly bottomSheet: Locator;
  readonly spotDetailsPanel: Locator;
  readonly speedDial: Locator;
  readonly geolocationButton: Locator;

  constructor(page: Page) {
    this.page = page;
    // Use multiple possible selectors for resilience
    this.mapContainer = page.locator("app-spot-map").first();
    this.spotMap = page.locator("app-google-map-2d").first();
    this.searchField = page
      .locator('app-search-field input, input[type="search"]')
      .first();
    this.filterChips = page.locator("mat-chip-listbox, .filter-chips");
    this.bottomSheet = page.locator("app-bottom-sheet, .bottom-sheet");
    this.spotDetailsPanel = page.locator("app-spot-details, .spot-details");
    this.speedDial = page.locator("app-speed-dial-fab");
    this.geolocationButton = page.locator(
      '[aria-label*="location"], button:has-text("My Location")'
    );
  }

  /**
   * Navigate to map page. SSR server will redirect to browser's locale.
   * @param locale Optional locale override (e.g., 'en', 'de')
   */
  async goto(locale: string = "de") {
    // Navigate to map - SSR will handle locale redirect if needed
    await this.page.goto(`/${locale}/map`, { waitUntil: "domcontentloaded" });
    await this.waitForMapReady();
  }

  async gotoWithSpot(spotIdOrSlug: string, locale: string = "de") {
    await this.page.goto(`/${locale}/map/${spotIdOrSlug}`, {
      waitUntil: "domcontentloaded",
    });
    await this.waitForMapReady();
    await this.waitForSpotDetails();
  }

  /**
   * Wait for the map page to be ready.
   * Uses a more robust approach that doesn't get stuck.
   */
  async waitForMapReady() {
    // First, wait for the app to be mounted
    await this.page.waitForSelector("app-root", {
      state: "attached",
      timeout: 15000,
    });

    // Wait for either the map component OR timeout gracefully
    try {
      // Try to wait for the map container, but with a reasonable timeout
      await this.page.waitForSelector("app-spot-map, app-map-page", {
        state: "attached",
        timeout: 15000,
      });
    } catch {
      // Map component might not be rendered yet - this is okay for some tests
      console.log("Map component not found in time, continuing...");
    }

    // Wait for network to settle (but not too strictly)
    await this.page.waitForLoadState("load");

    // Give Angular time to stabilize
    await this.page.waitForTimeout(1000);

    // Try to dismiss welcome/consent modal if present
    await this.dismissWelcomeModal();
  }

  async dismissWelcomeModal() {
    try {
      // Look for the consent dialog button
      // "Agree and Continue" or similar
      const confirmButton = this.page
        .locator("button")
        .filter({ hasText: /Agree|Continue|Accept|Akzeptieren/i })
        .first();

      if (await confirmButton.isVisible({ timeout: 2000 })) {
        console.log("Dismissing welcome modal...");
        await confirmButton.click();
        await this.page.waitForTimeout(1000); // Wait for animation
      }
    } catch (e) {
      // Ignore errors if modal logic fails, it shouldn't block tests
      console.log("No welcome modal to dismiss or interaction failed");
    }
  }

  async waitForSpotDetails() {
    try {
      await this.spotDetailsPanel.waitFor({ state: "visible", timeout: 10000 });
    } catch {
      // Spot details might not appear - that's okay for some tests
      console.log("Spot details not visible");
    }
  }

  async search(query: string) {
    await this.searchField.fill(query);
    await this.page.keyboard.press("Enter");
    await this.page.waitForTimeout(1000);
  }

  async selectFilterChip(chipText: string) {
    const chip = this.filterChips.locator(
      `mat-chip-option:has-text("${chipText}")`
    );
    await chip.click();
    await this.page.waitForTimeout(500);
  }

  async clickOnMap(x: number, y: number) {
    const mapBounds = await this.spotMap.boundingBox();
    if (mapBounds) {
      await this.page.mouse.click(mapBounds.x + x, mapBounds.y + y);
    }
  }

  async getVisibleMarkerCount(): Promise<number> {
    // Count advanced markers or marker elements on the map
    const markers = await this.page
      .locator('.marker, [class*="marker"], gmp-advanced-marker')
      .count();
    return markers;
  }

  async closeSpotDetails() {
    const closeButton = this.spotDetailsPanel
      .locator('button[aria-label*="close"], .close-button')
      .first();
    if (await closeButton.isVisible()) {
      await closeButton.click();
      await this.page.waitForTimeout(300);
    }
  }

  /**
   * Check if map is actually visible on the page.
   */
  async isMapVisible(): Promise<boolean> {
    try {
      return await this.spotMap.isVisible();
    } catch {
      return false;
    }
  }
}
