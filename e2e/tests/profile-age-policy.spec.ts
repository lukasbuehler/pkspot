import { expect, test } from "@playwright/test";
import {
  createEmulatorUser,
  enableFirebaseEmulatorsForPage,
  firebaseEmulatorE2eEnabled,
  resetFirebaseEmulators,
  seedFirestoreDocument,
  signInThroughAccount,
  type CreatedEmulatorUser,
} from "../fixtures/firebase-emulators";

test.describe("profile age-policy workflows", () => {
  test.describe.configure({ mode: "serial" });

  let user: CreatedEmulatorUser;

  test.beforeEach(async ({ page, request }, testInfo) => {
    test.skip(
      testInfo.project.name !== "chromium",
      "Authenticated profile workflows run once in Chromium.",
    );
    test.skip(
      !firebaseEmulatorE2eEnabled(),
      "Set E2E_FIREBASE_EMULATORS=1 and run Firebase Auth/Firestore emulators.",
    );

    await resetFirebaseEmulators(request);
    user = await createEmulatorUser(request, {
      uid: "e2e-restricted-profile-user",
      email: "e2e-restricted-profile@example.test",
      password: "correct-horse-battery-staple",
      displayName: "E2E Restricted Athlete",
    });
    await seedFirestoreDocument(request, `users/${user.uid}`, {
      display_name: user.displayName,
      biography: "Fixture profile with complete public metadata.",
      follower_count: 12,
      following_count: 8,
      visited_spots_count: 34,
      spot_creates_count: 21,
      spot_edits_count: 53,
      media_added_count: 17,
      signup_number: 42,
      nationality_code: "CH",
      verified_email: true,
      start_date: new Date("2019-05-04T00:00:00.000Z"),
      socials: {
        instagram_handle: "pkspot_fixture",
        youtube_handle: "fixture-channel",
        other: [{ name: "Portfolio", url: "https://example.test/profile" }],
      },
      age_policy: {
        participation_state: "read_only_age_restricted",
      },
    });
    await seedFirestoreDocument(request, `users/${user.uid}/private/main`, {
      settings: {
        maps: "googlemaps",
      },
      bookmarks: ["fixture-spot-one", "fixture-spot-two"],
      visited_spots: ["fixture-spot-three"],
    });

    await enableFirebaseEmulatorsForPage(page);
  });

  test("own profile shows real read-only contribution state without edit profile", async ({
    page,
  }) => {
    await signInThroughAccount(page, user, "/map");
    await page.evaluate(() => {
      localStorage.setItem(
        "pkspot.mockAgePolicyState.v1",
        "read_only_age_restricted",
      );
    });

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/de/profile", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(new RegExp(`/de/u/${user.uid}$`, "u"), {
      timeout: 30_000,
    });

    const profile = page.locator("app-profile-page");
    await expect(profile.locator(".profile-overview__card")).toBeVisible();
    await expect(profile).toContainText("E2E Restricted Athlete");
    await expect(profile).toContainText(/Öffentliche Beiträge|Public contributions/u);
    await expect(profile.locator('button:has-text("Settings")')).toBeVisible();
    await expect(profile.locator('button:has-text("Edit Profile")')).toHaveCount(0);
    await expect(profile.locator("app-contribution-status-note")).toBeVisible();
  });

  test("settings profile tab replaces the edit form with the read-only notice", async ({
    page,
  }) => {
    await signInThroughAccount(page, user, "/map");
    await page.evaluate(() => {
      localStorage.setItem(
        "pkspot.mockAgePolicyState.v1",
        "read_only_age_restricted",
      );
    });

    await page.goto("/de/settings/profile", { waitUntil: "domcontentloaded" });

    const settings = page.locator("app-settings-page");
    await expect(settings).toBeVisible();
    await expect(settings.locator("app-contribution-status-note")).toBeVisible();
    await expect(settings).toContainText(/Öffentliche Beiträge|Public contributions/u);
    await expect(settings.locator("app-edit-profile")).toHaveCount(0);
  });
});
