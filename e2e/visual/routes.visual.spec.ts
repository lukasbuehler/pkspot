import { expect, test, type Locator, type Page } from "@playwright/test";
import { CURRENT_TERMS_VERSION } from "../../src/app/services/consent-version";

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
  eventIndexFixture?: boolean;
  fixedTime?: string;
}

const desktopViewport = { width: 1280, height: 900 };
const eventHeaderViewport = { width: 1280, height: 640 };
const mobileViewport = { width: 390, height: 844 };

const routeVisualCases: RouteVisualCase[] = [
  { name: "map", path: "/map", maxDiffPixels: 80_000 },
  {
    name: "events",
    path: "/events",
    fullPage: true,
    maxDiffPixels: 2_000,
    eventIndexFixture: true,
    fixedTime: "2026-07-20T12:00:00.000Z",
  },
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
  if (route.fixedTime) {
    await page.clock.setFixedTime(new Date(route.fixedTime));
  }
  await page.addInitScript(
    ({ acceptedVersion, eventIndexFixture, signedIn }) => {
      localStorage.setItem("acceptedVersion", acceptedVersion);
      localStorage.setItem(
        "lastLocationAndZoom",
        JSON.stringify({
          location: { lat: 47.3769, lng: 8.5417 },
          zoom: 16,
        }),
      );
      localStorage.setItem("mapStyle", "roadmap");

      if (eventIndexFixture) {
        (
          window as typeof window & {
            __PKSPOT_SCREENSHOT_EVENT_INDEX__?: unknown;
          }
        ).__PKSPOT_SCREENSHOT_EVENT_INDEX__ = {
          events: [
            {
              id: "visual-city-jam",
              slug: "visual-city-jam",
              name: "City Parkour Jam",
              venue_string: "Riverside Park",
              locality_string: "Basel, Switzerland",
              location_raw: { lat: 47.5596, lng: 7.5886 },
              start: "2026-08-01T10:00:00.000Z",
              end: "2026-08-02T18:00:00.000Z",
              event_categories: ["jam"],
              series_ids: ["community-jam-series"],
              rsvp_counts: { going: 8, interested: 4, notgoing: 0, total: 12 },
            },
            {
              id: "visual-skills-open",
              slug: "visual-skills-open",
              name: "Parkour Skills Open",
              banner_src: "assets/swissjam/swissjam26_banner.jpeg",
              venue_string: "Movement Hall",
              locality_string: "Zurich, Switzerland",
              location_raw: { lat: 47.3769, lng: 8.5417 },
              start: "2026-08-08T09:00:00.000Z",
              end: "2026-08-08T18:00:00.000Z",
              event_categories: ["competition"],
              series_ids: ["parkour-earth"],
              rsvp_counts: { going: 3, interested: 6, notgoing: 0, total: 9 },
            },
            {
              id: "visual-summer-camp",
              slug: "visual-summer-camp",
              name: "Summer Training Camp",
              venue_string: "Training Campus",
              locality_string: "Bern, Switzerland",
              location_raw: { lat: 46.948, lng: 7.4474 },
              start: "2026-08-14T10:00:00.000Z",
              end: "2026-08-16T17:00:00.000Z",
              event_categories: ["camp"],
              rsvp_counts: { going: 5, interested: 2, notgoing: 0, total: 7 },
            },
            {
              id: "visual-championship",
              slug: "visual-championship",
              name: "European Parkour Championship",
              banner_src: "assets/logos/parkour_earth.jpg",
              banner_fit: "contain",
              banner_accent_color: "#ffffff",
              venue_string: "National Arena",
              locality_string: "Geneva, Switzerland",
              location_raw: { lat: 46.2044, lng: 6.1432 },
              start: "2026-09-05T09:00:00.000Z",
              end: "2026-09-06T18:00:00.000Z",
              event_categories: ["competition"],
              series_ids: ["parkour-earth"],
            },
            {
              id: "visual-rooftop-session",
              slug: "visual-rooftop-session",
              name: "Rooftop Training Session",
              venue_string: "Urban Sports Center",
              locality_string: "Lausanne, Switzerland",
              location_raw: { lat: 46.5197, lng: 6.6323 },
              start: "2026-09-12T14:00:00.000Z",
              end: "2026-09-12T19:00:00.000Z",
              event_categories: ["jam", "workshop"],
              series_ids: ["community-jam-series"],
            },
            {
              id: "visual-past-event",
              slug: "visual-past-event",
              name: "Spring Movement Meetup",
              venue_string: "Old Town Plaza",
              locality_string: "Lucerne, Switzerland",
              location_raw: { lat: 47.0502, lng: 8.3093 },
              start: "2026-06-20T10:00:00.000Z",
              end: "2026-06-21T17:00:00.000Z",
              event_categories: ["jam"],
              series_ids: ["community-jam-series"],
            },
          ],
          seriesById: {
            "community-jam-series": {
              id: "community-jam-series",
              name: "Community Jam Series",
            },
            "parkour-earth": {
              id: "parkour-earth",
              name: "Parkour Earth",
              logo_src: "assets/logos/parkour_earth.jpg",
              logo_background_color: "#ffffff",
            },
          },
        };
      }

      if (signedIn) {
        (
          window as typeof window & {
            __PKSPOT_SCREENSHOT_AUTH_USER__?: unknown;
          }
        ).__PKSPOT_SCREENSHOT_AUTH_USER__ = {
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
      }
    },
    {
      acceptedVersion: CURRENT_TERMS_VERSION,
      eventIndexFixture: route.eventIndexFixture === true,
      signedIn: route.signedIn === true,
    },
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
