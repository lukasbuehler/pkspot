import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright configuration for pkspot E2E and visual regression tests.
 * Uses SSR server for proper locale handling (Express redirects to browser locale).
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: "./e2e",

  /* Run tests in files in parallel */
  fullyParallel: true,

  /* Fail the build on CI if you accidentally left test.only in the source code */
  forbidOnly: !!process.env["CI"],

  /* Retry on CI only */
  retries: process.env["CI"] ? 2 : 0,

  /* Opt out of parallel tests on CI for more consistent results */
  /* Limit workers locally to not overload SSR server */
  workers: process.env["CI"] ? 1 : 2,

  /* Reporter to use */
  reporter: [["html", { open: "never" }], ["list"]],

  /* Global test timeout */
  timeout: 60 * 1000,

  /* Shared settings for all projects */
  use: {
    /* Base URL for navigation - SSR server runs on port 4000 */
    baseURL: "http://localhost:4000",

    /* Collect trace when retrying the failed test */
    trace: "on-first-retry",

    /* Screenshot on failure */
    screenshot: "only-on-failure",

    /* Video on retry */
    video: "on-first-retry",

    /* Navigation timeout */
    navigationTimeout: 30 * 1000,

    /* Action timeout */
    actionTimeout: 15 * 1000,
  },

  /* Configure projects for major browsers */
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    // Uncomment to add more browsers:
    // {
    //   name: 'firefox',
    //   use: { ...devices['Desktop Firefox'] },
    // },
    // {
    //   name: 'webkit',
    //   use: { ...devices['Desktop Safari'] },
    // },

    /* Mobile viewports */
    {
      name: "mobile-chrome",
      use: { ...devices["Pixel 5"] },
    },
  ],

  /* Visual comparison settings */
  expect: {
    toHaveScreenshot: {
      /* Maximum allowed difference in pixels */
      maxDiffPixels: 100,

      /* Threshold for comparing colors (0-1) */
      threshold: 0.2,

      /* Animation tolerance */
      animations: "disabled",
    },
    toMatchSnapshot: {
      maxDiffPixelRatio: 0.05,
    },
  },

  /* Run SSR server before starting the tests.
   * This requires building first, so we use a combined command.
   * The test server only serves the 'de' locale (dev build).
   */
  webServer: {
    command: "npm run build:dev && npm run serve:test",
    url: "http://localhost:4000",
    reuseExistingServer: !process.env["CI"],
    timeout: 180 * 1000, // 3 minutes for build + server start
  },
});
