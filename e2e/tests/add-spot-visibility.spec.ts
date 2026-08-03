import { test, expect, type Page } from "@playwright/test";
import { MapPage } from "../pages/map.page";

async function setMapCreationState(
  page: Page,
  options: { signedIn: boolean; zoom: number; canParticipate: boolean },
): Promise<boolean> {
  return page.evaluate(({ signedIn, zoom, canParticipate }) => {
    const angular = (window as unknown as {
      ng?: {
        getComponent?: (element: Element) => unknown;
        applyChanges?: (component: unknown) => void;
      };
    }).ng;

    if (!angular?.getComponent) return false;

    const mapPageEl = document.querySelector("app-map-page");
    const spotMapEl = document.querySelector("app-spot-map");
    if (!mapPageEl || !spotMapEl) return false;

    const mapPageComponent = angular.getComponent(mapPageEl) as {
      isSignedIn?: { set: (value: boolean) => void };
      ageAssurance?: { canParticipatePublicly: () => boolean };
    };
    const spotMapComponent = angular.getComponent(spotMapEl) as {
      mapZoom?: { set: (value: number) => void };
    };

    if (
      !mapPageComponent?.isSignedIn ||
      !mapPageComponent.ageAssurance ||
      !spotMapComponent?.mapZoom
    ) {
      return false;
    }

    mapPageComponent.ageAssurance.canParticipatePublicly = () => canParticipate;
    mapPageComponent.isSignedIn.set(signedIn);
    spotMapComponent.mapZoom.set(zoom);
    angular.applyChanges?.(mapPageComponent);
    angular.applyChanges?.(spotMapComponent);
    return true;
  }, options);
}

test.describe("Add Spot Button Visibility", () => {
  let mapPage: MapPage;

  test.beforeEach(async ({ page }) => {
    mapPage = new MapPage(page);
    await mapPage.goto("de");
    await mapPage.waitForMapReady();
  });

  test("should not show the Add Spot button when not signed in", async ({ page }) => {
    // By default we are not signed in
    await expect(page.locator("#mapCreateFabMenu")).not.toBeVisible();
  });

  test("should hide the Add Spot button when zoom is below 14", async ({ page }) => {
    const mockApplied = await setMapCreationState(page, {
      signedIn: true,
      zoom: 4,
      canParticipate: true,
    });
    test.skip(
      !mockApplied,
      "Angular debug APIs are unavailable in the built E2E app.",
    );

    await expect(page.locator("#mapCreateFabMenu")).not.toBeVisible();
  });

  test("should show the Add Spot button when signed in and zoom is 14+", async ({ page }) => {
    const mockApplied = await setMapCreationState(page, {
      signedIn: true,
      zoom: 15,
      canParticipate: true,
    });

    test.skip(
      !mockApplied,
      "Angular debug APIs are unavailable in the built E2E app.",
    );
    const createMenu = page.locator("#mapCreateFabMenu");
    await expect(createMenu).toBeVisible();
    await createMenu.locator(".fab-menu__launcher").click();
    await expect(
      createMenu.getByRole("button", { name: /Add Spot|Spot hinzufügen/u }),
    ).toBeVisible();
  });

  test("should hide the Add Spot button when signed in but contribution restricted", async ({
    page,
  }) => {
    const mockApplied = await setMapCreationState(page, {
      signedIn: true,
      zoom: 15,
      canParticipate: false,
    });

    test.skip(
      !mockApplied,
      "Angular debug APIs are unavailable in the built E2E app.",
    );
    await expect(page.locator("#mapCreateFabMenu")).not.toBeVisible();
  });
});
