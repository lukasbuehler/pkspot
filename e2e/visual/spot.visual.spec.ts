import { test, expect, type Page } from "@playwright/test";
import { acceptCurrentTerms } from "../fixtures/consent";

type SpotFixtureState = "loaded" | "loading";

async function openSpotFixture(
  page: Page,
  viewport = { width: 390, height: 844 },
  state: SpotFixtureState = "loaded",
  extraQuery = "",
  title = "Riverside Training Walls",
) {
  await page.setViewportSize(viewport);
  await acceptCurrentTerms(page);
  const query = `?state=${state}${extraQuery}`;
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
  await expect(details).toContainText(title);
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

    const title = details.locator('.spot-title-text').first();
    await expect(title).toHaveText('Riverside Training Walls');
    expect(await title.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
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


test("shows an existing Spot report with localized edit and withdrawal actions @visual", async ({page}) => {
  await page.setViewportSize({width: 390, height: 844});
  await acceptCurrentTerms(page);
  await page.goto("/de/__visual/spot-bottom-sheet?report=edit");
  const dialog = page.locator("app-spot-report-dialog");
  await expect(dialog).toContainText("Meldung bearbeiten");
  await expect(dialog).toContainText("Meldung zurückziehen");
  await expect(dialog.locator("textarea")).toHaveValue("Die Trainingsmauer wurde entfernt.");
  await expect(dialog.locator("mat-select")).toContainText("Deutsch");
  await expect(page.locator("mat-dialog-container")).toHaveScreenshot("spot-report-edit-mobile.png", {animations: "disabled"});
  await page.keyboard.press("Escape");
  await expect(page.locator(".spot-access-warning")).toContainText("entfernt");
  await expect(page.locator(".spot-access-warning")).toHaveScreenshot("spot-report-warning.png", {animations: "disabled"});
});

for (const viewport of [{width: 390, height: 844}, {width: 844, height: 390}]) {
  test(`crop dialog stays within safe areas ${viewport.width} @visual`, async ({page}) => {
    await page.setViewportSize(viewport);
    await acceptCurrentTerms(page);
    await page.goto("/de/__visual/spot-bottom-sheet?crop=1");
    await page.evaluate(() => {
      const style = document.documentElement.style;
      style.setProperty("--safe-area-inset-top", "32px");
      style.setProperty("--safe-area-inset-bottom", "24px");
      style.setProperty("--safe-area-inset-left", "28px");
      style.setProperty("--safe-area-inset-right", "0px");
    });
    const dialog = page.locator("app-image-crop-dialog");
    const surface = page.locator(".image-crop-dialog-panel .mat-mdc-dialog-surface");
    await expect(dialog.locator("image-cropper img").first()).toBeVisible();
    const bounds = await surface.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.x).toBeGreaterThanOrEqual(28);
    expect(bounds!.y).toBeGreaterThanOrEqual(32);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport.width);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(viewport.height - 24);
    expect(await surface.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
    await expect(surface).toHaveScreenshot(`crop-safe-area-${viewport.width}.png`);
    const apply = dialog.locator(".crop-actions button").last();
    await apply.scrollIntoViewIfNeeded();
    await expect(apply).toBeEnabled();
    await apply.click();
    await expect(dialog).toHaveCount(0);
  });
}

for (const mode of ["target", "review"]) {
  test(`shared photo ${mode} @visual`, async ({page}) => {
    await page.setViewportSize({width: 390, height: 844});
    await acceptCurrentTerms(page);
    await page.goto(`/de/__visual/spot-bottom-sheet?photos=${mode}`);
    const dialog = page.locator(mode === "target" ? "app-shared-photo-target-dialog" : "app-media-upload-dialog");
    await expect(dialog).toBeVisible();
    if (mode === "target") await expect(dialog.locator("app-spot-picker")).toBeVisible();
    else await expect(dialog.locator("app-media-upload img").first()).toBeVisible();
    await expect(page.locator(".mat-mdc-dialog-surface")).toHaveScreenshot(`shared-photo-${mode}.png`);
  });
}

for (const width of [390, 1000]) {
  test(`shared map drafts ${width} @visual`, async ({page}) => {
    await page.setViewportSize({width, height: 844});
    await acceptCurrentTerms(page);
    await page.goto("/de/__visual/spot-bottom-sheet?mapdrafts=1");
    const dialog = page.locator("app-shared-map-drafts-dialog");
    await expect(dialog.locator("article")).toHaveCount(2);
    await expect(dialog.getByRole("button", {name: "Spot erstellen"})).toHaveCount(1);
    await expect(page.locator(".mat-mdc-dialog-surface")).toHaveScreenshot(`shared-map-drafts-${width}.png`);
    await dialog.getByRole("button", {name: "Entwurf entfernen"}).first().click();
    await expect(dialog.locator("article")).toHaveCount(1);
  });
}

for (const name of ["Lindenhof", "Riverside Training Walls"]) {
  test(`spot title and activity hierarchy ${name} @visual`, async ({page}) => {
    await openSpotFixture(page, undefined, 'loaded', `&activity=1${name === 'Lindenhof' ? '&shortTitle=1' : ''}`, name);
    const title = page.locator('.spot-title-text').first();
    const badge = page.locator('.spot-kind-label').first();
    const activity = page.locator('.spot-activity-reveal');
    await expect(activity).toContainText('2+');
    await expect(activity).not.toContainText('30');
    expect((await activity.boundingBox())!.height).toBeLessThan(60);
    const titleBox = await title.evaluate(element => {
      const text = document.createRange();
      text.selectNodeContents(element);
      const rect = text.getBoundingClientRect();
      return {y: rect.y, height: rect.height};
    });
    const badgeBox = (await badge.boundingBox())!;
    expect(Math.abs(titleBox.y + titleBox.height / 2 - badgeBox.y - badgeBox.height / 2)).toBeLessThanOrEqual(3);
    const headerBox = (await page.locator('mat-card-header').first().boundingBox())!;
    expect((await activity.boundingBox())!.y).toBeGreaterThanOrEqual(headerBox.y + headerBox.height - 1);
    await expect(page.locator('app-spot-details')).toHaveScreenshot(`spot-header-${name === 'Lindenhof' ? 'short' : 'long'}.png`, {animations:'disabled'});
    await page.locator('app-bottom-sheet .handle-region').click();
    await expect(activity).toHaveAttribute('aria-hidden', 'true');
    await expect.poll(async () => (await activity.boundingBox())?.height).toBe(0);
  });
}
