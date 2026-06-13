import { expect, test, type Page } from "@playwright/test";
import {
  createEmulatorUser,
  defaultFirebaseEmulatorSettings,
  enableFirebaseEmulatorsForPage,
  firebaseEmulatorE2eEnabled,
  resetFirebaseEmulators,
  seedFirestoreDocument,
  type CreatedEmulatorUser,
} from "../fixtures/firebase-emulators";
import {
  expectAppRendered,
  expectRoute,
  gotoWorkflow,
  localizedPath,
  workflowViewports,
} from "../fixtures/workflow";

test.describe("authenticated Firebase emulator workflows", () => {
  test.describe.configure({ mode: "serial" });

  let user: CreatedEmulatorUser;

  test.beforeEach(async ({ page, request }, testInfo) => {
    test.skip(
      testInfo.project.name !== "chromium",
      "Authenticated emulator workflows run once in Chromium.",
    );
    test.skip(
      !firebaseEmulatorE2eEnabled(),
      "Set E2E_FIREBASE_EMULATORS=1 and run Firebase Auth/Firestore emulators.",
    );

    await resetFirebaseEmulators(request);
    user = await createEmulatorUser(request, {
      uid: "e2e-authenticated-user",
      email: "e2e-authenticated-user@example.test",
      password: "correct-horse-battery-staple",
      displayName: "E2E Authenticated User",
    });
    await seedFirestoreDocument(request, `users/${user.uid}`, {
      display_name: user.displayName,
      verified_email: true,
      isAdmin: false,
      data: {
        age_policy: {
          participation_state: "allowed",
        },
      },
    });
    await seedFirestoreDocument(request, `users/${user.uid}/private/main`, {
      settings: {
        maps: "googlemaps",
      },
    });

    await enableFirebaseEmulatorsForPage(page);
    await seedMapViewport(page);
  });

  test("signs in with email and redirects to the requested route", async ({
    page,
  }) => {
    await signInThroughAccount(page, user, "/map");

    await expectRoute(page, /\/de\/map$/u);
    await expect(page.locator('app-nav-rail a[href$="/settings"]')).toBeVisible();
    await expectAppRendered(page);
  });

  test("signed-in users can open settings instead of being bounced to account", async ({
    page,
  }) => {
    await signInThroughAccount(page, user, "/settings");

    await expectRoute(page, /\/de\/settings$/u);
    await expect(page.locator("app-settings-page")).toBeAttached({
      timeout: 15_000,
    });
  });

  test("signed-in map exposes private filters and the Add Spot entry point", async ({
    page,
  }) => {
    await signInThroughAccount(page, user, "/map");

    await expect(page.locator("app-filter-chips-bar")).toContainText(/Saved|Gespeichert/u);
    await expect(page.locator("app-filter-chips-bar")).toContainText(/Visited|Besucht/u);

    const addSpot = page.locator("#createSpotSpeedDial");
    await expect(addSpot).toBeVisible({ timeout: 25_000 });
    await addSpot.click();

    await expect(page.locator("app-map-spot-details-panel")).toBeAttached({
      timeout: 15_000,
    });
    await expect(page.locator('button:has-text("Save changes")')).toBeAttached();
  });
});

async function signInThroughAccount(
  page: Page,
  user: CreatedEmulatorUser,
  returnUrl: string,
): Promise<void> {
  await gotoWorkflow(
    page,
    `/account?returnUrl=${encodeURIComponent(returnUrl)}`,
    workflowViewports[0],
  );

  await page.locator('input[formControlName="email"]').fill(user.email);
  await page
    .locator('input[formControlName="password"]')
    .fill("correct-horse-battery-staple");

  await Promise.all([
    page.waitForURL(new RegExp(`${localizedPath(returnUrl)}$`, "u"), {
      timeout: 30_000,
    }),
    page.locator('form button[type="submit"]').click(),
  ]);
}

async function seedMapViewport(page: Page): Promise<void> {
  await page.addInitScript((settings) => {
    localStorage.setItem(
      "lastLocationAndZoom",
      JSON.stringify({
        location: { lat: 47.3769, lng: 8.5417 },
        zoom: 16,
      }),
    );
    localStorage.setItem("mapStyle", "roadmap");
    localStorage.setItem(
      "pkspot:e2e:firebaseEmulators",
      JSON.stringify(settings),
    );
  }, defaultFirebaseEmulatorSettings);
}
