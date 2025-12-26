import { Page, Locator } from "@playwright/test";

/**
 * Page Object Model for the Spot Details component/page.
 */
export class SpotDetailsPage {
  readonly page: Page;
  readonly container: Locator;
  readonly spotName: Locator;
  readonly spotType: Locator;
  readonly spotDescription: Locator;
  readonly imageCarousel: Locator;
  readonly amenitiesSection: Locator;
  readonly challengesSection: Locator;
  readonly editButton: Locator;
  readonly shareButton: Locator;
  readonly rating: Locator;
  readonly locality: Locator;

  constructor(page: Page) {
    this.page = page;
    this.container = page.locator("app-spot-details").first();
    this.spotName = this.container
      .locator('.spot-name, h1, [class*="name"]')
      .first();
    this.spotType = this.container
      .locator('.spot-type, [class*="type"]')
      .first();
    this.spotDescription = this.container
      .locator('.description, [class*="description"]')
      .first();
    this.imageCarousel = this.container.locator(
      "app-img-carousel, swiper-container"
    );
    this.amenitiesSection = this.container.locator(
      '[class*="amenities"], .amenities-section'
    );
    this.challengesSection = this.container.locator(
      'app-challenge-list, [class*="challenges"]'
    );
    this.editButton = this.container
      .locator('button:has-text("Edit"), [aria-label*="edit"]')
      .first();
    this.shareButton = this.container
      .locator('button:has-text("Share"), [aria-label*="share"]')
      .first();
    this.rating = this.container.locator("app-spot-rating");
    this.locality = this.container
      .locator('.locality, [class*="locality"]')
      .first();
  }

  async isVisible(): Promise<boolean> {
    return this.container.isVisible();
  }

  async getSpotName(): Promise<string> {
    return (await this.spotName.textContent()) || "";
  }

  async getSpotType(): Promise<string> {
    return (await this.spotType.textContent()) || "";
  }

  async hasImages(): Promise<boolean> {
    return this.imageCarousel.isVisible();
  }

  async hasAmenities(): Promise<boolean> {
    return this.amenitiesSection.isVisible();
  }

  async hasChallenges(): Promise<boolean> {
    return this.challengesSection.isVisible();
  }

  async clickEdit() {
    await this.editButton.click();
  }

  async scrollToBottom() {
    await this.container.evaluate((el) => {
      el.scrollTo(0, el.scrollHeight);
    });
  }
}
