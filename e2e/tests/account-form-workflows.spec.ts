import { expect, test } from "@playwright/test";
import {
  expectAppRendered,
  expectRoute,
  gotoWorkflow,
  workflowViewports,
} from "../fixtures/workflow";

test.describe("account form workflows", () => {
  test.describe.configure({ mode: "parallel" });

  test.beforeEach(({}, testInfo) => {
    test.skip(
      testInfo.project.name !== "chromium",
      "This file drives its own viewport checks in Chromium.",
    );
  });

  test("account form validates required email and password fields", async ({
    page,
  }) => {
    await gotoWorkflow(page, "/account", workflowViewports[0]);

    await page.locator("form").first().locator('button[type="submit"]').click();

    await expectRoute(page, /\/de\/account$/u);
    await expect(page.locator("mat-error").first()).toBeVisible();
    await expectAppRendered(page);
  });

  test("forgot password is reachable from the account form", async ({
    page,
  }) => {
    await gotoWorkflow(page, "/account", workflowViewports[2]);

    await page.locator('a[href$="/forgot-password"]').first().click();

    await expectRoute(page, /\/de\/forgot-password$/u);
    await expectAppRendered(page);
  });

  test("create account link preserves the sign-up route on compact screens", async ({
    page,
  }) => {
    await gotoWorkflow(page, "/account", workflowViewports[3]);

    await page.locator('a[href$="/sign-up"]').first().click();

    await expectRoute(page, /\/de\/sign-up$/u);
    await expect(page.locator('input[formControlName="displayName"]')).toBeVisible();
  });

  test("sign-up rejects mismatched passwords before account creation", async ({
    page,
  }) => {
    await gotoWorkflow(page, "/sign-up", workflowViewports[0]);

    await page.locator('input[formControlName="displayName"]').fill("E2E User");
    await page.locator('input[formControlName="email"]').fill("e2e@example.test");
    await page.locator('input[formControlName="password"]').fill("correct-horse");
    await page.locator('input[formControlName="repeatPassword"]').fill("wrong-horse");
    await page.locator("mat-checkbox").click();
    await page.locator('button[type="submit"]').click();

    await expectRoute(page, /\/de\/sign-up$/u);
    await expect(page.locator(".alert-danger")).toBeVisible();
    await expect(page.locator(".alert-danger")).toContainText(
      /password|Passwörter/i,
    );
  });

  test("sign-up requires terms agreement before account creation", async ({
    page,
  }) => {
    await gotoWorkflow(page, "/sign-up", workflowViewports[0]);

    await page.locator('input[formControlName="displayName"]').fill("E2E User");
    await page.locator('input[formControlName="email"]').fill("e2e@example.test");
    await page.locator('input[formControlName="password"]').fill("correct-horse");
    await page
      .locator('input[formControlName="repeatPassword"]')
      .fill("correct-horse");
    await page.locator('button[type="submit"]').click();

    await expectRoute(page, /\/de\/sign-up$/u);
    await expect(page.locator(".alert-danger")).toBeVisible();
  });
});
