import { test, expect, type Page } from "@playwright/test";
import { acceptCurrentTerms } from "../fixtures/consent";

type SpotFixtureState = "loaded" | "loading";

async function openSpotFixture(
  page: Page,
  viewport = { width: 390, height: 844 },
  state: SpotFixtureState = "loaded",
) {
  await page.setViewportSize(viewport);
  await acceptCurrentTerms(page);
  const query = state === "loading" ? "?state=loading" : "";
  await page.goto(`/de/__visual/spot-bottom-sheet${query}`, {
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
  await expect(page.locator("app-map-spot-details-panel")).toBeVisible();
  const details = page.locator("app-spot-details");
  await expect(details).toContainText("Riverside Training Walls");
  if (state === "loading") {
    await expect(details).toContainText(
      /Loading spot details|Spotdetails werden geladen/u,
    );
  }
  await page.waitForTimeout(700);
}

async function expandSheetForFullContentSnapshot(page: Page): Promise<void> {
  await page.addStyleTag({
    content: `
      app-nav-rail-content,
      app-nav-rail-content .main-content,
      .spot-bottom-sheet-visual-page,
      app-bottom-sheet.visual-bottom-sheet {
        height: auto !important;
        min-height: 0 !important;
        overflow: visible !important;
      }

      .spot-bottom-sheet-visual-page {
        padding: 0 !important;
      }

      .map-backdrop {
        display: none !important;
      }

      app-bottom-sheet.visual-bottom-sheet {
        position: static !important;
        display: block !important;
        inset: auto !important;
        width: 390px !important;
        background: transparent !important;
      }

      app-bottom-sheet.visual-bottom-sheet .sheet {
        position: static !important;
        transform: none !important;
        opacity: 1 !important;
        height: auto !important;
        min-height: 0 !important;
        overflow: visible !important;
        border-radius: 28px !important;
      }

      app-bottom-sheet.visual-bottom-sheet .content {
        height: auto !important;
        overflow: visible !important;
      }

      app-bottom-sheet.visual-bottom-sheet app-img-carousel {
        height: 220px !important;
        max-height: 220px !important;
      }
    `,
  });
  await page.waitForTimeout(200);
}

test.describe("Spot Details Visual Regression @visual", () => {
  test("should match the pending Spot preview and align it with the finished carousel", async ({
    page,
  }) => {
    await openSpotFixture(page, { width: 390, height: 844 }, "loading");

    const sheet = page.locator("app-bottom-sheet .sheet");
    const loadingMedia = page.getByTestId("spot-loading-media");
    const loadingBox = await loadingMedia.boundingBox();
    expect(loadingBox).not.toBeNull();
    if (!loadingBox) return;

    const sheetBox = await sheet.boundingBox();
    expect(sheetBox).not.toBeNull();
    if (!sheetBox) return;

    await expect(page).toHaveScreenshot("spot-details-bottom-sheet-loading.png", {
      clip: {
        x: sheetBox.x,
        y: sheetBox.y,
        width: sheetBox.width,
        height: Math.min(sheetBox.height, 510),
      },
      maxDiffPixels: 250,
      animations: "disabled",
    });

    await openSpotFixture(page, { width: 390, height: 844 });
    const resolvedMedia = page.locator(
      "app-img-carousel .spot-img-container[data-media-index='0']",
    );
    await expect(resolvedMedia).toBeVisible();
    const resolvedBox = await resolvedMedia.boundingBox();
    expect(resolvedBox).not.toBeNull();
    if (!resolvedBox) return;

    expect(Math.abs(loadingBox.x - resolvedBox.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(loadingBox.y - resolvedBox.y)).toBeLessThanOrEqual(1);
    expect(Math.abs(loadingBox.width - resolvedBox.width)).toBeLessThanOrEqual(1);
    expect(Math.abs(loadingBox.height - resolvedBox.height)).toBeLessThanOrEqual(1);
  });

  test("should match full rich persisted spot details", async ({
    page,
  }) => {
    await openSpotFixture(page, { width: 390, height: 1800 });
    await expandSheetForFullContentSnapshot(page);

    const sheet = page.locator("app-bottom-sheet .sheet");
    const details = sheet.locator("app-spot-details");

    await expect(details).toContainText(/Details|Eigenschaften/u);
    await expect(details).toContainText(
      /Features and amenities|Eigenschaften und Annehmlichkeiten/u,
    );
    await expect(details).toContainText(
      /Rating and user reviews|Bewertung und user Rezensionen/u,
    );
    await expect(details).toContainText(/edits are waiting|Bearbeitungen warten/u);
    await expect(details).toContainText(/License|Lizenz/u);

    await expect(sheet).toHaveScreenshot("spot-details-bottom-sheet.png", {
      maxDiffPixels: 250,
      animations: "disabled",
    });
  });

  test("should keep the collapsed sheet header readable", async ({ page }) => {
    await openSpotFixture(page, { width: 390, height: 844 });

    const sheet = page.locator("app-bottom-sheet .sheet");
    await page.locator("app-bottom-sheet .handle-region").click();
    await page.waitForTimeout(400);
    await page.addStyleTag({
      content: `
        app-bottom-sheet.visual-bottom-sheet .sheet {
          transform: none !important;
        }
      `,
    });
    await page.waitForTimeout(100);

    await expect(sheet).toContainText("Riverside Training Walls");
    const box = await sheet.boundingBox();
    expect(box).not.toBeNull();
    if (!box) return;

    await expect(page).toHaveScreenshot("spot-details-bottom-sheet-collapsed.png", {
      clip: {
        x: box.x,
        y: box.y,
        width: box.width,
        height: Math.min(box.height, 220),
      },
      maxDiffPixels: 150,
      animations: "disabled",
    });
  });
});
