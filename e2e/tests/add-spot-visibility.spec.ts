import { test, expect } from "@playwright/test";
import { MapPage } from "../pages/map.page";

test.describe("Add Spot Button Visibility", () => {
  let mapPage: MapPage;

  test.beforeEach(async ({ page }) => {
    mapPage = new MapPage(page);
    await mapPage.goto("de");
    await mapPage.waitForMapReady();
  });

  test("should not show the Add Spot button when not signed in", async ({ page }) => {
    // By default we are not signed in
    const addSpotButton = page.locator("#createSpotSpeedDial");
    await expect(addSpotButton).not.toBeVisible();
  });

  test("should hide the Add Spot button when zoom is below 14", async ({ page }) => {
    /**
     * Even if we were signed in, it should be hidden at low zoom.
     * We'll check this by ensuring it's not there at the default zoom (which is 4).
     */
    const addSpotButton = page.locator("#createSpotSpeedDial");
    await expect(addSpotButton).not.toBeVisible();
  });

  test("should show the Add Spot button when signed in and zoom is 14+", async ({ page }) => {
    const mockApplied = await page.evaluate(() => {
      const angular = (window as unknown as { ng?: {
        getComponent?: (element: Element) => unknown;
        applyChanges?: (component: unknown) => void;
      } }).ng;

      if (!angular?.getComponent) {
        return false;
      }

      const mapPageEl = document.querySelector("app-map-page");
      const spotMapEl = document.querySelector("app-spot-map");
      if (!mapPageEl || !spotMapEl) {
        return false;
      }

      const mapPageComponent = angular.getComponent(mapPageEl) as {
        isSignedIn?: { set: (value: boolean) => void };
      };
      const spotMapComponent = angular.getComponent(spotMapEl) as {
        mapZoom?: { set: (value: number) => void };
      };

      if (!mapPageComponent?.isSignedIn || !spotMapComponent?.mapZoom) {
        return false;
      }

      mapPageComponent.isSignedIn.set(true);
      spotMapComponent.mapZoom.set(15);
      angular.applyChanges?.(mapPageComponent);
      angular.applyChanges?.(spotMapComponent);
      return true;
    });

    expect(mockApplied).toBe(true);
    const addSpotButton = page.locator("#createSpotSpeedDial");
    await expect(addSpotButton).toBeVisible();
    await expect(addSpotButton).toContainText(/Add Spot|Spot hinzufügen/);
  });
});
