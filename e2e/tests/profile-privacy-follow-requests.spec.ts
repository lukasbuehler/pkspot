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

  test("requester sees a stable follow request loading state", async ({
    page,
    context,
  }) => {
    await signInThroughAccount(page, requester, `/u/${owner.uid}`);
    await page.setViewportSize({ width: 390, height: 844 });

    const profile = page.locator("app-profile-page");
    await expect(profile.locator(".profile-overview__card")).toBeVisible({
      timeout: 30_000,
    });
    await page.locator("#app-splash-screen").waitFor({ state: "detached" });
    await expect(profile).toContainText(owner.displayName);

    await page.screenshot({
      path: `${screenshotDir}/profile-phase2-requester-before.png`,
      fullPage: true,
    });

    const actions = profile.locator(".profile-overview__actions");
    const followButton = profile.getByTestId("follow-action");
    await expect(followButton).toContainText(/Request follow|Folgeanfrage senden/u);
    await expect(actions).toHaveScreenshot("profile-follow-action-ready.png", {
      animations: "disabled",
    });

    const devtools = await context.newCDPSession(page);
    await devtools.send("Network.enable");
    await devtools.send("Network.emulateNetworkConditions", {
      offline: false,
      latency: 1_500,
      downloadThroughput: -1,
      uploadThroughput: -1,
    });
    await followButton.click();
    const spinner = followButton.locator("mat-spinner");
    await expect(spinner).toBeVisible();
    await expect(actions).toHaveScreenshot("profile-follow-action-loading.png", {
      animations: "disabled",
    });

    const [buttonBox, spinnerBox] = await Promise.all([
      followButton.boundingBox(),
      spinner.boundingBox(),
    ]);
    expect(buttonBox).not.toBeNull();
    expect(spinnerBox).not.toBeNull();
    expect(Math.abs(
      buttonBox!.x + buttonBox!.width / 2 -
        (spinnerBox!.x + spinnerBox!.width / 2),
    )).toBeLessThanOrEqual(1);
    expect(Math.abs(
      buttonBox!.y + buttonBox!.height / 2 -
        (spinnerBox!.y + spinnerBox!.height / 2),
    )).toBeLessThanOrEqual(1);
  });

  test("requester can send a follow request", async ({ page }) => {
    await signInThroughAccount(page, requester, `/u/${owner.uid}`);
    await page.setViewportSize({ width: 390, height: 844 });

    const profile = page.locator("app-profile-page");
    await expect(profile.locator(".profile-overview__card")).toBeVisible({
      timeout: 30_000,
    });
    await page.locator("#app-splash-screen").waitFor({ state: "detached" });

    const actions = profile.locator(".profile-overview__actions");
    const followButton = profile.getByTestId("follow-action");
    await expect(followButton).toContainText(/Request follow|Folgeanfrage senden/u);
    await followButton.click();

    await expect(followButton).toContainText(/Requested|Angefragt/u);
    await expect(followButton).toHaveAttribute("aria-busy", "false");
    await expect(followButton.locator("mat-spinner")).toBeHidden();
    await page.waitForTimeout(500);
    await expect(followButton).toContainText(/Requested|Angefragt/u);
    await expect(actions).toHaveScreenshot("profile-follow-action-requested.png", {
      animations: "disabled",
    });

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
