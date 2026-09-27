import { expect, test } from "@playwright/test";
import { acceptCurrentTerms } from "../fixtures/consent";

test.describe("Map Overlay Visual Regression @visual", () => {
  test("should match search and filter chips", async ({ page }) => {
    await acceptCurrentTerms(page);
    await page.setViewportSize({ width: 840, height: 220 });
    await page.goto("/de/__visual/map-overlay", {
      waitUntil: "domcontentloaded",
    });
    await page.waitForSelector("app-map-overlay-visual-test-page", {
      state: "attached",
    });
    await page.waitForTimeout(500);

    await expect(page.locator(".map-overlay-surface")).toHaveScreenshot(
      "map-search-and-filter-chips.png",
      {
        animations: "disabled",
        maxDiffPixels: 250,
      },
    );
  });
});

test("keeps map creation stable as sheet actions change @visual", async ({ page }) => {
  await acceptCurrentTerms(page);
  await page.setViewportSize({ width: 960, height: 600 });
  await page.goto("/de/__visual/map-overlay");
  const surface = page.locator(".map-controls-surface");
  await surface.evaluate(element => {
    element.style.setProperty("--map-leading-safe-area", "48px");
    element.style.setProperty("--safe-area-inset-right", "72px");
    element.style.setProperty("--safe-area-inset-bottom", "24px");
  });
  const launcher = surface.locator(".fab-menu__launcher");
  await expect(launcher).toHaveText("add");
  const bounds = (await surface.boundingBox())!;
  const create = (await launcher.boundingBox())!;
  const mini = (await surface.locator(".map-mini-fabs").boundingBox())!;
  expect(create.x - bounds.x).toBeCloseTo(48 + 20, 0);
  expect(bounds.x + bounds.width - mini.x - mini.width).toBeCloseTo(72 + 20, 0);
  expect(bounds.y + bounds.height - mini.y - mini.height).toBeCloseTo(24 + 40, 0);
  await surface.locator(".sheet-toggle").click();
  await expect(launcher).toHaveText("add");
  await launcher.click();
  await expect(surface.locator(".fab-menu__action")).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(launcher).toHaveText("add");
  await expect(surface).toHaveScreenshot("map-controls-safe-edges.png", { animations: "disabled" });
  await surface.locator(".sheet-toggle").click();
  await launcher.click();
  await expect(surface.locator(".fab-menu__action")).toHaveCount(2);
});
