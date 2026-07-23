import { test, expect, type Page } from "@playwright/test";
import { acceptCurrentTerms } from "../fixtures/consent";

async function openSpotDetailsFixture(page: Page): Promise<void> {
  await page.setViewportSize({ width: 390, height: 844 });
  await acceptCurrentTerms(page);
  await page.goto("/de/__visual/spot-bottom-sheet", {
    waitUntil: "domcontentloaded",
  });
  await expect(page.locator("app-spot-details")).toBeVisible({
    timeout: 15_000,
  });
}

test.describe("Spot Details", () => {
  test("renders a deterministic rich persisted spot fixture", async ({ page }) => {
    await openSpotDetailsFixture(page);

    const details = page.locator("app-spot-details");
    await expect(details).toContainText("Riverside Training Walls");
    await expect(details).toContainText("Spot");
    await expect(details).toContainText(/Public|Öffentlich/u);
    await expect(details).toContainText(/Urban Landscape|Urbane Landschaft/u);
    await expect(details).toContainText(/Limmatstrasse 271/u);
    await expect(details).toContainText(
      /Features and amenities|Eigenschaften und Annehmlichkeiten/u,
    );
    await expect(details).toContainText(
      /Rating and user reviews|Bewertung und user Rezensionen/u,
    );
    await expect(details).toContainText(/24 reviews|24 Bewertungen/u);
    await expect(details).toContainText(
      /3 edits are waiting|3 Bearbeitungen warten/u,
    );
    await expect(details).toContainText(/Source|Quelle/u);
    await expect(details).toContainText(/License|Lizenz/u);
  });

  test("keeps the bottom-sheet header usable when collapsed", async ({ page }) => {
    await openSpotDetailsFixture(page);

    const sheet = page.locator("app-bottom-sheet .sheet");
    await page.locator("app-bottom-sheet .handle-region").click();
    await page.waitForTimeout(500);

    await expect(sheet).toContainText("Riverside Training Walls");
    await expect(sheet.locator(".collapsible-header-info").first()).toHaveAttribute(
      "data-collapsed",
      "true",
    );
  });
});

test.describe("Spot Details - Direct Navigation", () => {
  test("should handle invalid spot ID gracefully", async ({ page }) => {
    await page.goto("/de/map/spots/this-spot-definitely-does-not-exist-12345", {
      waitUntil: "domcontentloaded",
    });

    await page.waitForSelector("app-root", {
      state: "attached",
      timeout: 15_000,
    });

    await expect(page.locator("app-root")).toBeAttached();
    await expect.poll(() => new URL(page.url()).pathname).toContain("/de/map");
  });
});
