import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import {
  createEmulatorUser,
  enableFirebaseEmulatorsForPage,
  firebaseEmulatorE2eEnabled,
  seedAuthenticatedFirestoreDocument,
  signInThroughAccount,
} from "../fixtures/firebase-emulators";

test.describe("authenticated image crop dialog", () => {
  test.beforeEach(async ({ page, request }, testInfo) => {
    test.skip(
      !firebaseEmulatorE2eEnabled(),
      "Set E2E_FIREBASE_EMULATORS=1 and run Firebase Auth/Firestore emulators.",
    );

    const suffix = testInfo.project.name.replaceAll(/[^a-z0-9]/giu, "-");
    const user = await createEmulatorUser(request, {
      email: `e2e-image-crop-${suffix}@example.test`,
      password: "correct-horse-battery-staple",
      displayName: "Image Crop Test User",
    });
    await seedAuthenticatedFirestoreDocument(request, `users/${user.uid}`, {
      display_name: user.displayName,
      verified_email: true,
    }, user.idToken);
    await seedAuthenticatedFirestoreDocument(
      request,
      `users/${user.uid}/private_data/main`,
      { settings: { maps: "googlemaps" } },
      user.idToken,
    );
    await enableFirebaseEmulatorsForPage(page);
    await signInThroughAccount(page, user, "/settings/profile");
    if (testInfo.project.name === "mobile-chrome") {
      await page.setViewportSize({ width: 393, height: 851 });
    }
  });

  test("supports profile crop controls on desktop and mobile", async ({
    page,
  }, testInfo) => {
    const profileEditor = page.locator("app-edit-profile");
    await expect(profileEditor).toBeVisible({ timeout: 15_000 });
    await profileEditor
      .locator('input[type="file"]')
      .setInputFiles(resolve("src/assets/badges/spot_4.png"));

    const dialog = page.locator("app-image-crop-dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.locator("image-cropper")).toBeVisible();

    await dialog.locator("button", { hasText: "rotate_left" }).click();
    const zoom = dialog.locator('input[type="range"]');
    await zoom.fill("1.5");
    await dialog.getByRole("button", { name: /Reset|Zurücksetzen/u }).click();
    await expect(zoom).toHaveValue("1");

    const dialogBox = await page.locator(".mat-mdc-dialog-surface").boundingBox();
    const viewport = page.viewportSize();
    expect(dialogBox).not.toBeNull();
    expect(viewport).not.toBeNull();
    if (testInfo.project.name === "mobile-chrome") {
      expect(dialogBox?.width).toBeGreaterThanOrEqual((viewport?.width ?? 0) - 2);
      expect(dialogBox?.height).toBeGreaterThanOrEqual(
        (viewport?.height ?? 0) - 2,
      );
    } else {
      expect(dialogBox?.width).toBeLessThan(viewport?.width ?? 0);
    }

    await dialog.getByRole("button", { name: /Cancel|Abbrechen/u }).click();
    await expect(dialog).toHaveCount(0);
  });
});
