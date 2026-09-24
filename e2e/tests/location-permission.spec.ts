import { expect, test } from "@playwright/test";
import { CURRENT_TERMS_VERSION } from "../../src/app/services/consent-version";

// Also run against a local Worker to cover the staging browser configuration.
test.use({ baseURL: process.env["PKSPOT_LOCATION_TEST_URL"] ?? "http://localhost:4000" });

for (const { mode, granted } of [
  { mode: "fresh", granted: false },
  { mode: "fresh", granted: true },
  { mode: "on", granted: false },
  { mode: "temporary", granted: false },
] as const) {
  test(`startup does not request location with ${mode} preferences and ${granted ? "granted" : "unset"} permission`, async ({ page, context }) => {
    if (granted) await context.grantPermissions(["geolocation"]);
    await page.addLocatorHandler(page.locator("app-app-check-error-dialog"), async (dialog) => {
      await dialog.locator("[mat-dialog-close]").click();
    });
    await page.addInitScript(({ mode, acceptedVersion }) => {
      localStorage.setItem("acceptedVersion", acceptedVersion);
      if (mode !== "fresh") {
        localStorage.setItem("pkspot_location_access", JSON.stringify({
          mode, temporaryUntilMs: Date.now() + 300_000,
        }));
      }
      const requests: string[] = [];
      Object.assign(window, { __locationRequests: requests });
      // Capture the APIs that can open a prompt without reading real location.
      navigator.geolocation.getCurrentPosition = () => { requests.push("getCurrentPosition"); };
      navigator.geolocation.watchPosition = () => { requests.push("watchPosition"); return 1; };
    }, { mode, acceptedVersion: CURRENT_TERMS_VERSION });

    for (const route of ["train", "about", "map"]) {
      await page.goto(`/de/${route}`);
      await expect(page.locator("app-root")).toHaveClass(/has-navigation-rail/);
      await expect(page.locator(`app-${route}-page`)).toBeAttached();
      // Allow deferred map and training initialization to attempt passive access.
      await page.waitForTimeout(2000);
      expect(await page.evaluate(async () => (await navigator.permissions.query({ name: "geolocation" })).state)).toBe(granted ? "granted" : "prompt");
      expect(await page.evaluate(() => (window as Window & { __locationRequests: string[] }).__locationRequests)).toEqual([]);
    }

    // Prove explicit opt-in still reaches geolocation; the startup assertion
    // must not pass simply because geolocation has been disabled everywhere.
    await page.locator(".map-location-control").click();
    if (mode === "fresh") {
      await page.locator("app-location-access-dialog button").last().click();
    }
    await expect.poll(() => page.evaluate(() => (window as Window & { __locationRequests: string[] }).__locationRequests.length)).toBeGreaterThan(0);
  });
}
