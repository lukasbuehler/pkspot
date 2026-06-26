import { mkdirSync } from "node:fs";
import { expect, test } from "@playwright/test";
import {
  createEmulatorUser,
  enableFirebaseEmulatorsForPage,
  firebaseEmulatorE2eEnabled,
  resetFirebaseEmulators,
  seedAuthenticatedFirestoreDocument,
  signInThroughAccount,
  type CreatedEmulatorUser,
} from "../fixtures/firebase-emulators";

const screenshotDir = "output/playwright";

test.describe("profile privacy follow request workflows", () => {
  test.describe.configure({ mode: "serial" });

  let owner: CreatedEmulatorUser;
  let requester: CreatedEmulatorUser;

  test.beforeEach(async ({ page, request }, testInfo) => {
    test.skip(
      testInfo.project.name !== "chromium",
      "Profile privacy workflows run once in Chromium.",
    );
    test.skip(
      !firebaseEmulatorE2eEnabled(),
      "Set E2E_FIREBASE_EMULATORS=1 and run Firebase Auth/Firestore emulators.",
    );

    mkdirSync(screenshotDir, { recursive: true });
    await resetFirebaseEmulators(request);

    owner = await createEmulatorUser(request, {
      email: "e2e-private-owner@example.test",
      password: "correct-horse-battery-staple",
      displayName: "E2E Private Coach",
    });
    requester = await createEmulatorUser(request, {
      email: "e2e-follow-requester@example.test",
      password: "correct-horse-battery-staple",
      displayName: "E2E Requester",
    });

    await seedAuthenticatedFirestoreDocument(request, `users/${owner.uid}`, {
      display_name: owner.displayName,
      biography: "Private profile fixture for follow request review.",
      account_privacy: "private",
      profile_visibility: "mutuals",
      verified_email: true,
    }, owner.idToken);
    await seedAuthenticatedFirestoreDocument(request, `users/${requester.uid}`, {
      display_name: requester.displayName,
      account_privacy: "public",
      profile_visibility: "public",
      verified_email: true,
    }, requester.idToken);

    await enableFirebaseEmulatorsForPage(page);
  });

  test("requester sees a private profile and can send a follow request", async ({
    page,
  }) => {
    await signInThroughAccount(page, requester, `/u/${owner.uid}`);
    await page.setViewportSize({ width: 390, height: 844 });

    const profile = page.locator("app-profile-page");
    await expect(profile.locator(".profile-overview__card")).toBeVisible({
      timeout: 30_000,
    });
    await page.locator("#app-splash-screen").waitFor({ state: "detached" });
    await expect(profile).toContainText(owner.displayName);
    await expect(profile).toContainText("Private account");
    await expect(profile).toContainText("Visible to mutuals");

    await page.screenshot({
      path: `${screenshotDir}/profile-phase2-requester-before.png`,
      fullPage: true,
    });

    await profile.getByRole("button", { name: /Request follow/u }).click();
    await expect(profile.getByRole("button", { name: /Requested/u })).toBeVisible();

    await page.screenshot({
      path: `${screenshotDir}/profile-phase2-requester-requested.png`,
      fullPage: true,
    });
  });

  test("profile owner can review and approve pending follow requests", async ({
    page,
    request,
  }) => {
    await seedAuthenticatedFirestoreDocument(
      request,
      `users/${owner.uid}/follow_requests/${requester.uid}`,
      {
        display_name: requester.displayName,
        requested_at: new Date("2026-01-01T12:00:00.000Z"),
        requested_at_raw_ms: 1767268800000,
      },
      requester.idToken,
    );

    await page.setViewportSize({ width: 1024, height: 900 });
    await signInThroughAccount(page, owner, `/u/${owner.uid}`);

    const profile = page.locator("app-profile-page");
    await expect(profile.locator(".profile-overview__card")).toBeVisible({
      timeout: 30_000,
    });
    await page.locator("#app-splash-screen").waitFor({ state: "detached" });
    await expect(profile).toContainText("Follow requests");
    await expect(profile).toContainText(requester.displayName);

    await page.screenshot({
      path: `${screenshotDir}/profile-phase2-owner-requests.png`,
      fullPage: true,
    });

    await profile.getByRole("button", { name: /Approve|Genehmigen/u }).click();
    await expect(profile).toContainText("No pending follow requests.");
  });
});
