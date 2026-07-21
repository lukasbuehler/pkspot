import { expect, test, type Locator, type Page } from "@playwright/test";

interface RouteVisualCase {
  name: string;
  path: string;
  viewport?: { width: number; height: number };
  signedIn?: boolean;
  expectedPath?: RegExp;
  fullPage?: boolean;
  clip?: { x: number; y: number; width: number; height: number };
  maxDiffPixels?: number;
  eventMapLayout?: "full" | "embedded";
}

const desktopViewport = { width: 1280, height: 900 };
const eventHeaderViewport = { width: 1280, height: 640 };
const mobileViewport = { width: 390, height: 844 };

const routeVisualCases: RouteVisualCase[] = [
  { name: "map", path: "/map", maxDiffPixels: 80_000 },
  { name: "events", path: "/events", fullPage: true, maxDiffPixels: 2_000 },
  {
    name: "event-detail",
    path: "/events/swissjam25",
    viewport: eventHeaderViewport,
    maxDiffPixels: 4_000,
  },
  {
    name: "event-map",
    path: "/events/swissjam25/map",
    maxDiffPixels: 2_000,
    eventMapLayout: "full",
  },
  {
    name: "settings-profile",
    path: "/settings/profile",
    signedIn: true,
    fullPage: true,
    maxDiffPixels: 1_500,
  },
  {
    name: "settings-account",
    path: "/settings/account",
    signedIn: true,
    fullPage: true,
    maxDiffPixels: 1_500,
  },
  {
    name: "settings-general",
    path: "/settings/general",
    signedIn: true,
    fullPage: true,
    maxDiffPixels: 1_500,
  },
  {
    name: "notifications",
    path: "/notifications",
    signedIn: true,
    fullPage: true,
    maxDiffPixels: 1_500,
  },
  {
    name: "notifications-mobile",
    path: "/notifications",
    viewport: mobileViewport,
    signedIn: true,
    fullPage: true,
    maxDiffPixels: 1_500,
  },
  {
    name: "profile-own",
    path: "/profile",
    signedIn: true,
    expectedPath: /\/de\/u\/visual-route-user$/u,
    fullPage: true,
    maxDiffPixels: 1_500,
  },
  { name: "account", path: "/account", fullPage: true, maxDiffPixels: 1_000 },
  { name: "sign-up", path: "/sign-up", fullPage: true, maxDiffPixels: 1_000 },
  {
    name: "forgot-password",
    path: "/forgot-password",
    fullPage: true,
    maxDiffPixels: 1_000,
  },
  { name: "about", path: "/about", fullPage: true, maxDiffPixels: 2_000 },
  { name: "support", path: "/support", fullPage: true, maxDiffPixels: 2_000 },
  { name: "contact", path: "/contact", fullPage: true, maxDiffPixels: 1_000 },
  {
    name: "terms-of-service",
    path: "/terms-of-service",
    fullPage: true,
    maxDiffPixels: 2_000,
  },
  {
    name: "privacy-policy",
    path: "/privacy-policy",
    fullPage: true,
    maxDiffPixels: 2_000,
  },
  { name: "impressum", path: "/impressum", fullPage: true, maxDiffPixels: 1_000 },
  { name: "embed", path: "/embed", fullPage: true, maxDiffPixels: 1_500 },
  {
    name: "embedded-event",
    path: "/embedded/events/swissjam25",
    viewport: mobileViewport,
    clip: { x: 0, y: 0, width: 390, height: 532 },
    maxDiffPixels: 2_000,
  },
  {
    name: "embedded-event-map",
    path: "/embedded/events/swissjam25/map",
    viewport: mobileViewport,
    maxDiffPixels: 1_000,
    eventMapLayout: "embedded",
  },
  {
    name: "not-found",
    path: "/route-visual-not-found",
    fullPage: true,
    maxDiffPixels: 1_000,
  },
];

test.describe("Route visual regression @visual", () => {
  for (const route of routeVisualCases) {
    test(`matches ${route.name} route`, async ({ page }) => {
      await prepareRoute(page, route);

      const mapSurfaces = page.locator("app-google-map-2d, google-map, .gm-style");
      const spinners = page.locator("mat-spinner, mat-progress-spinner");
      const masks = route.eventMapLayout ? [] : [mapSurfaces, spinners];

      await expect(page).toHaveScreenshot(`${route.name}-route.png`, {
        animations: "disabled",
        clip: route.clip,
        fullPage: route.fullPage ?? false,
        maxDiffPixels: route.maxDiffPixels ?? 1_000,
        mask: masks,
      });
    });
  }
});

async function prepareRoute(page: Page, route: RouteVisualCase): Promise<void> {
  await page.setViewportSize(route.viewport ?? desktopViewport);
  await page.addInitScript(
    ({ signedIn }) => {
      localStorage.setItem("acceptedVersion", "5");
      localStorage.setItem(
        "lastLocationAndZoom",
        JSON.stringify({
          location: { lat: 47.3769, lng: 8.5417 },
          zoom: 16,
        }),
      );
      localStorage.setItem("mapStyle", "roadmap");

      if (signedIn) {
        const screenshotWindow = (
          window as typeof window & {
            __PKSPOT_SCREENSHOT_AUTH_USER__?: unknown;
            __PKSPOT_SCREENSHOT_NOTIFICATIONS__?: unknown;
          }
        );
        screenshotWindow.__PKSPOT_SCREENSHOT_AUTH_USER__ = {
          uid: "visual-route-user",
          email: "visual-route-user@example.test",
          emailVerified: true,
          providerId: "password",
          data: {
            display_name: "Visual Route User",
            biography: "Parkour athlete and PK Spot route visual fixture.",
            verified_email: true,
            follower_count: 12,
            following_count: 8,
            visited_spots_count: 24,
            start_date_raw_ms: Date.UTC(2021, 3, 12),
            nationality_code: "CH",
            home_city: "Zurich",
            socials: {
              instagram_handle: "visualroute",
              youtube_handle: "visualroute",
            },
            age_policy: {
              participation_state: "allowed",
              source: "manual",
              platform: "web",
            },
            account_privacy: "public",
            profile_visibility: "public",
          },
        };
        const now = Date.now();
        screenshotWindow.__PKSPOT_SCREENSHOT_NOTIFICATIONS__ = [
          {
            id: "visual-follow-request",
            type: "follow_request",
            source_path: "users/visual-route-user/follow_requests/traceur-1",
            dedupe_key: "visual-follow-request",
            path: "/profile",
            payload: { requester_name: "Maya" },
            active: true,
            created_at_raw_ms: now - 5 * 60_000,
            available_at_raw_ms: now - 5 * 60_000,
            expires_at_raw_ms: now + 30 * 86_400_000,
            updated_at_raw_ms: now - 5 * 60_000,
          },
          {
            id: "visual-event-update",
            type: "event_update",
            source_path: "events/swissjam25",
            dedupe_key: "visual-event-update",
            path: "/events/swissjam25",
            payload: {
              event_name: "Swiss Jam",
              change: "location",
            },
            active: true,
            created_at_raw_ms: now - 3 * 3_600_000,
            available_at_raw_ms: now - 3 * 3_600_000,
            expires_at_raw_ms: now + 29 * 86_400_000,
            updated_at_raw_ms: now - 3 * 3_600_000,
            read_at_raw_ms: now - 2 * 3_600_000,
          },
          {
            id: "visual-spot-edit",
            type: "spot_edit_update",
            source_path: "spots/spot-1/edits/edit-1",
            dedupe_key: "visual-spot-edit",
            path: "/s/central-station",
            payload: {
              spot_name: "Central Station",
              outcome: "approved",
            },
            active: true,
            created_at_raw_ms: now - 2 * 86_400_000,
            available_at_raw_ms: now - 2 * 86_400_000,
            expires_at_raw_ms: now + 88 * 86_400_000,
            updated_at_raw_ms: now - 2 * 86_400_000,
            read_at_raw_ms: now - 2 * 86_400_000,
          },
        ];
      }
    },
    { signedIn: route.signedIn === true },
  );

  await page.goto(`/de${route.path}`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("app-root", { state: "attached", timeout: 20_000 });

  if (route.expectedPath) {
    await expect.poll(() => new URL(page.url()).pathname).toMatch(route.expectedPath);
  }

  await expect
    .poll(async () => (await page.locator("body").innerText()).trim().length)
    .toBeGreaterThan(20);
  await page.waitForLoadState("load");
  await page.waitForTimeout(900);

  if (route.eventMapLayout) {
    await waitForStableEventMap(page, route.eventMapLayout);
  }
}

async function waitForStableEventMap(
  page: Page,
  layout: "full" | "embedded",
): Promise<void> {
  const eventMap = page.locator("app-event-map-page");
  const mapSurface = eventMap.locator("app-google-map-2d");

  await expect(eventMap).toBeVisible();
  await expect(mapSurface).toBeVisible();

  if (layout === "embedded") {
    const promo = page.locator(".embedded-promo");
    const brand = promo.locator(".embedded-promo__brand");
    await expect(promo).toBeVisible();
    await expect(brand).toBeVisible();
    await expect(brand).toBeInViewport();
    await expect
      .poll(async () => {
        const box = await promo.boundingBox();
        const viewport = page.viewportSize();
        return !!box && !!viewport && box.y + box.height <= viewport.height;
      })
      .toBe(true);
  } else {
    await expect(eventMap.locator("mat-drawer.mat-drawer-opened")).toBeVisible();
    await expect(eventMap.locator("app-spot-preview-card").first()).toBeVisible();
  }

  await waitForResizeToSettle(mapSurface);
  await page.addStyleTag({
    content: `
      app-event-map-page app-google-map-2d {
        visibility: hidden !important;
      }
    `,
  });
}

async function waitForResizeToSettle(locator: Locator): Promise<void> {
  await locator.evaluate(
    (element, quietPeriodMs) =>
      new Promise<void>((resolve) => {
        let quietTimer = 0;
        let timeoutTimer = 0;

        const finish = () => {
          window.clearTimeout(quietTimer);
          window.clearTimeout(timeoutTimer);
          observer.disconnect();
          resolve();
        };
        const observer = new ResizeObserver(() => {
          window.clearTimeout(quietTimer);
          quietTimer = window.setTimeout(finish, quietPeriodMs);
        });

        observer.observe(element);
        quietTimer = window.setTimeout(finish, quietPeriodMs);
        timeoutTimer = window.setTimeout(finish, 5_000);
      }),
    500,
  );
}
