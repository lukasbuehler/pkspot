import { test, expect, type Page } from "@playwright/test";

async function openSpotFixture(page: Page, viewport = { width: 390, height: 844 }) {
  await page.setViewportSize(viewport);
  await page.addInitScript(() => {
    localStorage.setItem("acceptedVersion", "5");
  });
  await page.goto("/de/__visual/spot-bottom-sheet", {
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
  await expect(page.locator("app-spot-details")).toContainText(
    "Riverside Training Walls",
  );
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
    `,
  });
  await page.waitForTimeout(200);
}

test.describe("Spot Details Visual Regression @visual", () => {
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

    await expect(sheet).toContainText("Riverside Training Walls");
    await expect(sheet).toHaveScreenshot("spot-details-bottom-sheet-collapsed.png", {
      maxDiffPixels: 150,
      animations: "disabled",
    });
  });
});
