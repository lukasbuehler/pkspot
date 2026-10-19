import { financesFeatureEnabled } from "../../src/app/features/finances-feature";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { CURRENT_TERMS_VERSION } from "../../src/app/services/consent-version";

interface RouteVisualCase {
  name: string;
  path: string;
  viewport?: { width: number; height: number };
  signedIn?: boolean;
  plannedSessionFixture?: "planner" | "private" | "community";
  admin?: boolean;
  verifiedAdult?: boolean;
  publicProfile?: boolean;
  openFabMenu?: boolean;
  openNavigationFab?: boolean;
  openRecoveryPauseDialog?: boolean;
  openTrainWeatherDialog?: boolean;
  openInvalidEventsDialog?: boolean;
  openProfilePrivacySelect?: boolean;
  invalidEventFixture?: boolean;
  expectedPath?: RegExp;
  fullPage?: boolean;
  clip?: { x: number; y: number; width: number; height: number };
  maxDiffPixels?: number;
  eventMapLayout?: "full" | "embedded";
  eventIndexFixture?: boolean;
  liveEventFixture?: boolean;
  myEventsDialogFixture?: boolean;
  trainFixture?: boolean;
  /** Moves the first nearby fixture event so it is live at the fixed time. */
  trainLiveEventFixture?: boolean;
  assertTrainPage?: boolean;
  assertFabAboveBottomNavigation?: string;
  trainingLogFixture?: boolean;
  unloggedCheckIn?: boolean;
  assertContributionGraph?: boolean;
  fixedTime?: string;
  scrollToSelector?: string;
  assertCenteredProfile?: boolean;
  assertAlainClearance?: {
    axis: "block" | "inline";
    target: string;
  };
  ticketLayout?: "desktop" | "mobile";
}

const desktopViewport = { width: 1280, height: 900 };
const eventHeaderViewport = { width: 1280, height: 640 };
const mobileViewport = { width: 390, height: 844 };
const alainMobileViewport = { width: 390, height: 680 };

const routeVisualCases: RouteVisualCase[] = [
  { name: "finances", path: "/finances", signedIn: true, admin: true, fullPage: true, fixedTime: "2026-10-06T12:00:00.000Z" },
  { name: "finances-alain", path: "/finances", signedIn: true, admin: true, viewport: alainMobileViewport, fullPage: true, fixedTime: "2026-10-06T12:00:00.000Z", assertAlainClearance: { axis: "block", target: "app-finances-page header" } },
  { name: "finances-entry", path: "/finances", signedIn: true, admin: true, viewport: mobileViewport, fullPage: true, fixedTime: "2026-10-06T12:00:00.000Z" },
  { name: "finances-denied", path: "/finances", signedIn: true, fullPage: true },

  { name: "moderation-duplicates", path: "/moderation/duplicates", signedIn: true, admin: true, viewport: { width: 390, height: 844 }, fullPage: true },
  { name: "moderation-duplicates-alain", path: "/moderation/duplicates", signedIn: true, admin: true, viewport: alainMobileViewport, fullPage: true, assertAlainClearance: { axis: "block", target: "app-moderation-duplicates-page header" } },
  { name: "session-planner-mobile", path: "/events/session/new", signedIn: true, plannedSessionFixture: "planner", viewport: alainMobileViewport, fullPage: true, assertAlainClearance: { axis: "block", target: "app-session-planner-page h1" } },
  { name: "session-private", path: "/events/session/visual-session", signedIn: true, plannedSessionFixture: "private", fullPage: true },
  { name: "session-community-link", path: "/events/session/visual-session", plannedSessionFixture: "community", viewport: mobileViewport, fullPage: true },

  { name: "map", path: "/map", maxDiffPixels: 80_000 },
  {
    name: "train",
    path: "/train",
    signedIn: true,
    trainFixture: true,
    trainingLogFixture: true,
    assertTrainPage: true,
    fixedTime: "2026-08-20T12:00:00.000Z",
    fullPage: true,
    maxDiffPixels: 2_000,
  },
  {
    name: "train-mobile",
    path: "/train",
    viewport: mobileViewport,
    signedIn: true,
    trainFixture: true,
    trainingLogFixture: true,
    assertTrainPage: true,
    fixedTime: "2026-08-20T12:00:00.000Z",
    fullPage: true,
    maxDiffPixels: 2_000,
  },
  {
    name: "train-alain",
    path: "/train",
    viewport: alainMobileViewport,
    signedIn: true,
    trainFixture: true,
    trainingLogFixture: true,
    assertTrainPage: true,
    fixedTime: "2026-08-20T12:00:00.000Z",
    assertAlainClearance: {
      axis: "block",
      target: ".train-header",
    },
    maxDiffPixels: 2_000,
  },
  {
    name: "train-spots",
    path: "/train",
    signedIn: true,
    trainFixture: true,
    trainingLogFixture: true,
    assertTrainPage: true,
    fixedTime: "2026-08-20T12:00:00.000Z",
    scrollToSelector: ".spot-preview-grid",
    maxDiffPixels: 2_000,
  },
  {
    name: "train-community-events",
    path: "/train",
    signedIn: true,
    trainFixture: true,
    trainingLogFixture: true,
    fixedTime: "2026-08-20T12:00:00.000Z",
    scrollToSelector: ".coming-up",
    maxDiffPixels: 2_000,
  },
  {
    name: "train-now",
    path: "/train",
    viewport: mobileViewport,
    signedIn: true,
    trainFixture: true,
    trainLiveEventFixture: true,
    trainingLogFixture: true,
    fixedTime: "2026-08-20T12:00:00.000Z",
    maxDiffPixels: 2_000,
  },
  {
    name: "train-weather-dialog",
    path: "/train",
    signedIn: true,
    trainFixture: true,
    trainingLogFixture: true,
    openTrainWeatherDialog: true,
    fixedTime: "2026-08-20T12:00:00.000Z",
    maxDiffPixels: 2_000,
  },
  {
    name: "train-signed-out",
    path: "/train",
    viewport: mobileViewport,
    trainFixture: true,
    fixedTime: "2026-08-20T12:00:00.000Z",
    fullPage: true,
    maxDiffPixels: 2_000,
  },
  {
    name: "events",
    path: "/events",
    viewport: { width: 1600, height: 900 },
    fullPage: true,
    maxDiffPixels: 2_000,
    eventIndexFixture: true,
    fixedTime: "2026-07-20T12:00:00.000Z",
  },
  {
    name: "events-continuous-calendar",
    path: "/events?view=calendar&month=2026-08&day=2026-08-01",
    viewport: { width: 1600, height: 900 },
    fullPage: true,
    maxDiffPixels: 2_000,
    eventIndexFixture: true,
    fixedTime: "2026-07-20T12:00:00.000Z",
  },
  {
    name: "events-compact-calendar",
    path: "/events?view=calendar&month=2026-08",
    viewport: { width: 900, height: 900 },
    fullPage: true,
    maxDiffPixels: 2_000,
    eventIndexFixture: true,
    fixedTime: "2026-07-20T12:00:00.000Z",
  },
  {
    name: "events-mobile-filters",
    path: "/events",
    viewport: mobileViewport,
    eventIndexFixture: true,
    fixedTime: "2026-07-20T12:00:00.000Z",
  },
  {
    name: "events-mobile-list",
    path: "/events",
    viewport: mobileViewport,
    fullPage: true,
    maxDiffPixels: 2_000,
    eventIndexFixture: true,
    fixedTime: "2026-07-20T12:00:00.000Z",
  },
  {
    name: "events-alain",
    path: "/events",
    viewport: alainMobileViewport,
    signedIn: true,
    fullPage: true,
    maxDiffPixels: 2_000,
    eventIndexFixture: true,
    liveEventFixture: true,
    fixedTime: "2026-07-20T12:00:00.000Z",
    assertAlainClearance: {
      axis: "block",
      target: "app-my-events-panel",
    },
  },
  {
    name: "events-mobile-calendar",
    path: "/events?view=calendar&month=2026-08",
    viewport: mobileViewport,
    fullPage: true,
    maxDiffPixels: 2_000,
    eventIndexFixture: true,
    fixedTime: "2026-07-20T12:00:00.000Z",
  },
  {
    name: "events-filtered-switzerland",
    path: "/events?view=list&area=country:ch",
    fullPage: true,
    maxDiffPixels: 2_000,
    eventIndexFixture: true,
    fixedTime: "2026-07-20T12:00:00.000Z",
  },
  {
    name: "events-filtered-zurich",
    path: "/events?view=list&area=locality:ch:zh:zurich",
    fullPage: true,
    maxDiffPixels: 2_000,
    eventIndexFixture: true,
    fixedTime: "2026-07-20T12:00:00.000Z",
  },
  {
    name: "events-community-europe",
    path: "/events?view=list&tier=community&region=europe",
    fullPage: true,
    maxDiffPixels: 2_000,
    eventIndexFixture: true,
    fixedTime: "2026-07-20T12:00:00.000Z",
  },
  {
    name: "event-plan-community-authoring",
    path: "/events/community/new",
    plannedSessionFixture: "community",
    expectedPath: /\/events\/session\/new$/,
    viewport: mobileViewport,
    signedIn: true,
    verifiedAdult: true,
    publicProfile: true,
    fullPage: true,
    maxDiffPixels: 2_000,
  },
  {
    name: "event-suggest-authoring",
    path: "/events/suggest",
    viewport: mobileViewport,
    signedIn: true,
    verifiedAdult: true,
    fullPage: true,
    maxDiffPixels: 2_000,
  },
  {
    name: "event-create-authoring",
    path: "/events/new",
    viewport: mobileViewport,
    signedIn: true,
    admin: true,
    verifiedAdult: true,
    fullPage: true,
    maxDiffPixels: 2_000,
  },
  {
    name: "events-admin-drafts",
    path: "/events",
    viewport: mobileViewport,
    signedIn: true,
    admin: true,
    eventIndexFixture: true,
    scrollToSelector: '.drafts-section',
    fixedTime: "2026-07-20T12:00:00.000Z",
  },
  {
    name: "events-admin-create",
    path: "/events",
    viewport: mobileViewport,
    signedIn: true,
    admin: true,
    verifiedAdult: true,
    eventIndexFixture: true,
    openFabMenu: true,
    fixedTime: "2026-07-20T12:00:00.000Z",
    maxDiffPixels: 2_000,
  },
  {
    name: "events-invalid-data-dialog",
    path: "/events?view=list",
    viewport: { width: 390, height: 844 },
    signedIn: true,
    admin: true,
    eventIndexFixture: true,
    invalidEventFixture: true,
    assertFabAboveBottomNavigation: "#eventsCreateFabMenu",
    openInvalidEventsDialog: true,
    fixedTime: "2026-07-20T12:00:00.000Z",
    maxDiffPixels: 2_000,
  },
  {
    name: "event-ownership-claim-inbox",
    path: "/event-ownership-claims",
    signedIn: true,
    admin: true,
    fullPage: true,
    maxDiffPixels: 4_000,
  },
  {
    name: "event-detail",
    path: "/events/swissjam25",
    viewport: eventHeaderViewport,
    maxDiffPixels: 4_000,
  },
  {
    name: "event-detail-alain",
    path: "/events/swissjam25",
    viewport: alainMobileViewport,
    maxDiffPixels: 4_000,
    assertAlainClearance: {
      axis: "inline",
      target: ".event-nav > a",
    },
  },
  {
    name: "event-tickets",
    path: "/events/visual-ticket-event",
    eventIndexFixture: true,
    fixedTime: "2026-07-20T12:00:00.000Z",
    scrollToSelector: ".ticket-section",
    ticketLayout: "desktop",
    maxDiffPixels: 2_000,
  },
  {
    name: "event-tickets-mobile",
    path: "/events/visual-ticket-event",
    viewport: mobileViewport,
    eventIndexFixture: true,
    fixedTime: "2026-07-20T12:00:00.000Z",
    scrollToSelector: ".ticket-section",
    ticketLayout: "mobile",
    fullPage: true,
    maxDiffPixels: 2_000,
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
    name: "settings-account-alain",
    path: "/settings/account",
    viewport: alainMobileViewport,
    signedIn: true,
    scrollToSelector: ".profile-access-card",
    openProfilePrivacySelect: true,
    maxDiffPixels: 2_000,
    assertAlainClearance: {
      axis: "block",
      target: ".profile-access-card",
    },
  },
  {
    name: "settings-general",
    path: "/settings/general",
    signedIn: true,
    fullPage: true,
    maxDiffPixels: 1_500,
  },
  {
    name: "settings-notifications",
    path: "/settings/notifications",
    signedIn: true,
    fullPage: true,
    maxDiffPixels: 1_500,
  },
  {
    name: "settings-notifications-mobile",
    path: "/settings/notifications",
    viewport: mobileViewport,
    signedIn: true,
    scrollToSelector: ".notification-table-section",
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
    name: "notifications-alain",
    path: "/notifications",
    viewport: alainMobileViewport,
    signedIn: true,
    fullPage: true,
    maxDiffPixels: 1_500,
    assertAlainClearance: {
      axis: "block",
      target: ".notification-center__header",
    },
  },
  {
    name: "training-log",
    path: "/train/log",
    signedIn: true,
    trainingLogFixture: true,
    assertContributionGraph: true,
    fixedTime: "2026-08-20T12:00:00.000Z",
    maxDiffPixels: 2_000,
  },
  {
    name: "training-log-mobile",
    path: "/train/log",
    viewport: mobileViewport,
    signedIn: true,
    trainingLogFixture: true,
    fixedTime: "2026-08-20T12:00:00.000Z",
    fullPage: true,
  },
  {
    name: "training-log-editor",
    path: "/train/log/new",
    signedIn: true,
    trainingLogFixture: true,
    fullPage: true,
    fixedTime: "2026-08-20T12:00:00.000Z",
  },
  {
    name: "training-log-editor-mobile",
    path: "/train/log/new",
    viewport: mobileViewport,
    signedIn: true,
    trainingLogFixture: true,
    fullPage: true,
    fixedTime: "2026-08-20T12:00:00.000Z",
  },
  {
    name: "training-log-fab",
    path: "/train/log",
    viewport: mobileViewport,
    signedIn: true,
    trainingLogFixture: true,
    openFabMenu: true,
    fixedTime: "2026-08-20T12:00:00.000Z",
  },
  {
    name: "navigation-fab-landscape",
    path: "/train/log",
    viewport: { width: 844, height: 390 },
    signedIn: true,
    trainingLogFixture: true,
    openNavigationFab: true,
    assertAlainClearance: { axis: "block", target: ".log-page .back" },
    fixedTime: "2026-08-20T12:00:00.000Z",
  },
  {
    name: "training-log-timeline",
    path: "/train/log",
    signedIn: true,
    trainingLogFixture: true,
    fixedTime: "2026-08-20T12:00:00.000Z",
    scrollToSelector: ".timeline",
    maxDiffPixels: 2_000,
    maxDiffPixels: 2_000,
  },
  {
    name: "recovery-pause-dialog",
    path: "/train/log",
    signedIn: true,
    trainingLogFixture: true,
    openRecoveryPauseDialog: true,
    fixedTime: "2026-08-20T12:00:00.000Z",
    maxDiffPixels: 2_000,
  },
  {
    name: "train-check-in-prompt",
    path: "/train",
    viewport: mobileViewport,
    signedIn: true,
    trainFixture: true,
    trainingLogFixture: true,
    unloggedCheckIn: true,
    fixedTime: "2026-08-20T12:00:00.000Z",
  },
  {
    name: "training-session-detail-alain",
    path: "/train/log/visual-training-entry",
    viewport: alainMobileViewport,
    signedIn: true,
    trainingLogFixture: true,
    assertAlainClearance: { axis: 'block', target: '.session-page__header' },
    fixedTime: "2026-08-20T12:00:00.000Z",
  },
  {
    name: "training-log-check-in-editor",
    path: "/train/log/new?sessionRecord=visual-session-2",
    viewport: mobileViewport,
    signedIn: true,
    trainingLogFixture: true,
    fullPage: true,
    fixedTime: "2026-08-20T12:00:00.000Z",
  },
  {
    name: "training-session-detail-desktop",
    path: "/train/log/visual-training-entry",
    signedIn: true,
    trainingLogFixture: true,
    fixedTime: "2026-08-20T12:00:00.000Z",
  },
  {
    name: "training-session-detail",
    path: "/train/log/visual-training-entry",
    viewport: mobileViewport,
    signedIn: true,
    trainingLogFixture: true,
    fixedTime: "2026-08-20T12:00:00.000Z",
    maxDiffPixels: 2_000,
  },
  {
    name: "training-session-detail-lower",
    path: "/train/log/visual-training-entry",
    viewport: mobileViewport,
    signedIn: true,
    trainingLogFixture: true,
    fixedTime: "2026-08-20T12:00:00.000Z",
    scrollToSelector: ".partners-section",
    maxDiffPixels: 2_000,
    maxDiffPixels: 2_000,
  },
  {
    name: "report-outcome",
    path: "/reports/outcomes/visual-report-outcome",
    signedIn: true,
    fullPage: true,
    maxDiffPixels: 1_500,
  },
  {
    name: "report-outcome-mobile",
    path: "/reports/outcomes/visual-report-outcome",
    viewport: mobileViewport,
    signedIn: true,
    fullPage: true,
    maxDiffPixels: 1_500,
  },
  {
    name: "my-reports",
    path: "/reports",
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
    fixedTime: "2026-07-20T12:00:00.000Z",
  },
  {
    name: "profile-own-mobile",
    path: "/profile",
    viewport: mobileViewport,
    signedIn: true,
    expectedPath: /\/de\/u\/visual-route-user$/u,
    fullPage: true,
    maxDiffPixels: 1_500,
    fixedTime: "2026-07-20T12:00:00.000Z",
    assertCenteredProfile: true,
  },
  { name: "account-mobile", path: "/account", viewport: mobileViewport, fullPage: true },
  { name: "account", path: "/account", fullPage: true, maxDiffPixels: 1_000 },
  ...[
    { name: "account-alain-portrait", viewport: { width: 466, height: 678 } },
    { name: "account-alain-landscape", viewport: { width: 844, height: 390 } },
  ].map(({ name, viewport }): RouteVisualCase => ({
    name,
    viewport,
    path: "/account",
    assertAlainClearance: { axis: "block", target: ".account-page .language-strip" },
  })),
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
  { name: "contact-alain", path: "/contact", viewport: alainMobileViewport,
    assertAlainClearance: { axis: "block", target: ".contact-page .back-link" } },
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
  {
    name: "embed",
    path: "/embed?event=visual-city-jam",
    fullPage: true,
    maxDiffPixels: 1_500,
    eventIndexFixture: true,
    fixedTime: "2026-07-20T12:00:00.000Z",
  },
  { name: "embed-spot-picker", path: "/embed?embedType=spot", viewport: mobileViewport, eventIndexFixture: true },
  { name: "embed-community-picker", path: "/embed?embedType=community", viewport: mobileViewport, eventIndexFixture: true },
  { name: "embed-alain", path: "/embed?embedType=spot", viewport: alainMobileViewport, eventIndexFixture: true,
    assertAlainClearance: { axis: "block", target: "app-embed-page h2" } },
  { name: "embedded-selection-event", path: "/embedded/results?refs=" + encodeURIComponent(JSON.stringify([{ kind: "event", id: "visual-city-jam" }])), viewport: mobileViewport, eventIndexFixture: true, fixedTime: "2026-07-20T12:00:00.000Z" },
  { name: "embedded-selection-empty", path: "/embedded/results", viewport: mobileViewport },
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
      test.skip(route.path === "/finances" && !financesFeatureEnabled, "Finance view is disabled in every environment.");
      await prepareRoute(page, route);

      await expect(page.locator("mat-snack-bar-container")).toHaveCount(0);
      if (route.name.startsWith("moderation-duplicates")) {
        await expect(page.locator(".duplicate-group")).toHaveCount(1);
        await expect(page.locator(".duplicate-group")).toContainText("Riverside training walls");
        await expect(page.locator(".duplicate-group small").first()).toContainText("2025");
      }

      if (route.path === "/finances") {
        if (route.admin) {
          await expect(page.locator("app-finances-page tbody tr")).toHaveCount(5);
          await expect(page.locator(".summary-grid")).toContainText(/50[,.]00/);
          await expect(page.locator(".expense-row")).toContainText(["Infrastructure", "Salaries"]);
          if (route.name === "finances-entry") {
            await page.getByRole("button", { name: "Add entry", exact: true }).click();
            await expect(page.locator(".entry-form")).toBeVisible();
            await page.getByLabel("Description", { exact: true }).fill("Hosting test");
            await page.getByLabel("Amount in CHF", { exact: true }).fill("12.50");
            await page.getByLabel("Status", { exact: true }).selectOption("pending");
          }
          expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

        } else {
          await expect(page.locator("app-finances-page")).toContainText("administrators only");
          await expect(page.locator(".summary-grid")).toHaveCount(0);
        }
      }

      const mapSurfaces = page.locator("app-google-map-2d, google-map, .gm-style");
      const spinners = page.locator("mat-spinner, mat-progress-spinner");
      const masks = route.eventMapLayout ? [] : [mapSurfaces, spinners];

      if (route.name === "profile-own-mobile") {
        await page.locator(".profile-overview__menu-trigger").click();
        await expect(page.locator('[role="menuitem"][href$="/support"]')).toBeVisible();
        await page.keyboard.press("Escape");
      }

      if (route.assertCenteredProfile) {
        const profileLayout = await page
          .locator(".profile-overview__card")
          .evaluate((card) => {
            const bounds = card.getBoundingClientRect();
            return {
              centerOffset: Math.abs(
                bounds.left + bounds.width / 2 - window.innerWidth / 2,
              ),
              clientWidth: card.clientWidth,
              scrollWidth: card.scrollWidth,
            };
          });
        expect(profileLayout.centerOffset).toBeLessThanOrEqual(1);
        expect(profileLayout.scrollWidth).toBeLessThanOrEqual(
          profileLayout.clientWidth,
        );
      }

      if (route.assertAlainClearance) {
        const menuBounds = await page.locator("#alainMenuButton").boundingBox();
        const targetBounds = await page
          .locator(route.assertAlainClearance.target)
          .boundingBox();
        expect(menuBounds).not.toBeNull();
        expect(targetBounds).not.toBeNull();
        if (menuBounds && targetBounds) {
          const gap = 8;
          if (route.assertAlainClearance.axis === "block") {
            expect(targetBounds.y).toBeGreaterThanOrEqual(
              menuBounds.y + menuBounds.height + gap,
            );
          } else {
            expect(targetBounds.x).toBeGreaterThanOrEqual(
              menuBounds.x + menuBounds.width + gap,
            );
          }
        }
      }

      if (route.assertContributionGraph) {
        await page.locator(".activity-details > summary").click();
        const graph = page.locator("app-training-activity-contribution-graph");
        const logFab = page.locator("app-fab-menu.app-page-fab .fab-menu__launcher");
        const weekdayLabels = graph.locator(".weekday-labels");
        const activeWeeks = graph.locator(".week.week-active");
        const activeDays = activeWeeks.locator(".cell.day-active");
        await expect(page.locator(".log-hero .back")).toHaveClass(
          /mat-mdc-button-base/,
        );
        await expect(logFab).toHaveCount(1);
        await expect(logFab).toHaveClass(/mat-mdc-button-base/);
        await expect(
          page.locator(".log-hero a[href$='/train/log/new']"),
        ).toHaveCount(0);
        await logFab.click();
        await expect(
          page.locator("app-fab-menu.app-page-fab .fab-menu__action"),
        ).toHaveCount(2);
        await page.keyboard.press("Escape");
        expect(
          await page.locator("app-fab-menu.app-page-fab").evaluate((element) => getComputedStyle(element).position),
        ).toBe("fixed");
        await expect(activeWeeks).toHaveCount(2);
        await expect(activeDays).toHaveCount(3);
        await expect(graph.locator(".week").last().locator(".cell")).toHaveCount(4);
        await expect(weekdayLabels).toHaveCount(1);
        await expect(
          graph.locator(".contribution-graph__scroll .weekday-labels"),
        ).toHaveCount(0);
        await expect(
          graph.locator(".contribution-graph__scroll > .weeks"),
        ).toHaveCount(1);

        const [weekColor, dayColor, activeWeekCellColor, activeDayColor, styles] =
          await Promise.all([
            graph.locator(".legend-swatch.week").evaluate(
              (element) => getComputedStyle(element).backgroundColor,
            ),
            graph.locator(".legend-swatch.day").evaluate(
              (element) => getComputedStyle(element).backgroundColor,
            ),
            activeWeeks.locator(".cell:not(.day-active):not(.recovery-pause)").first().evaluate(
              (element) => getComputedStyle(element).backgroundColor,
            ),
            activeDays.first().evaluate(
              (element) => getComputedStyle(element).backgroundColor,
            ),
            graph.evaluate((element) => {
              const graphCard = element.querySelector(".contribution-graph")!;
              const style = getComputedStyle(graphCard);
              return {
                horizontalOverflow: getComputedStyle(
                  element.querySelector(".contribution-graph__scroll")!,
                ).overflowX,
                verticalOverflow: getComputedStyle(
                  element.querySelector(".contribution-graph__scroll")!,
                ).overflowY,
                activeWeekColor: style.getPropertyValue("--active-week-color").trim(),
                activeDayColor: style.getPropertyValue("--active-day-color").trim(),
                primary: style.getPropertyValue("--mat-sys-primary").trim(),
                primaryContainer: style
                  .getPropertyValue("--mat-sys-primary-container")
                  .trim(),
              };
            }),
          ]);
        expect(activeWeekCellColor).toBe(weekColor);
        expect(activeDayColor).toBe(dayColor);
        expect(styles.horizontalOverflow).toBe("auto");
        expect(styles.verticalOverflow).toBe("hidden");
        expect(styles.activeWeekColor).toBe(styles.primaryContainer);
        expect(styles.activeDayColor).toBe(styles.primary);
        await expect(graph.locator(".legend-swatch.recovery")).toHaveCount(1);
        await expect(graph.locator(".cell.recovery-pause")).toHaveCount(5);
      }

      if (route.assertTrainPage) {
        const contextButton = page.locator("button.training-context-button");
        const weatherButton = page.locator("button.training-weather-button");
        await expect(contextButton).toHaveClass(/mat-mdc-button-base/);
        await expect(contextButton.locator(".training-context-button__area")).toContainText("(Zürich)");
        await expect(weatherButton).toHaveClass(/mat-mdc-button-base/);
        await expect(weatherButton).toContainText("Trocken bis");
        await expect(page.locator(".train-nav")).toHaveCount(0);
        // Only events you can act on get the green card; the fixture has none.
        await expect(page.locator(".moment-card")).toHaveCount(0);
        await expect(page.locator("app-spot-preview-card")).toHaveCount(4);
        await expect(page.locator(".spot-distance").first()).toContainText("km");
        await expect(page.locator(".coming-up a.mat-mdc-list-item")).toHaveCount(3);
        await expect(page.locator(".coming-up__community")).toContainText("Communities: Switzerland");
        await expect(page.locator("app-event-discovery-card")).toHaveCount(0);
        await expect(page.locator(".conditions-card app-precipitation-chart svg")).toBeVisible();
        await expect(
          page.locator(".rhythm-card app-training-activity-contribution-graph .week-strip__day"),
        ).toHaveCount(7);
        await expect(
          page.locator(".rhythm-card app-training-activity-contribution-graph button.cell"),
        ).toHaveCount(0);
        await expect(page.locator(".looking-back app-training-activity-contribution-graph")).toBeVisible();
        await expect(page.locator(".looking-back a[href$='/train/log']")).toHaveClass(/mat-mdc-button-base/);
        expect(await page.evaluate(() => document.documentElement.scrollWidth))
          .toBeLessThanOrEqual((route.viewport ?? desktopViewport).width);
      }

      if (route.name === "train-now") {
        const moment = page.locator(".moment-card");
        await expect(moment).toHaveCount(1);
        await expect(moment).toContainText("Jetzt live");
        await expect(moment).toContainText("Evening lines at the river");
        await expect(page.locator(".coming-up")).not.toContainText("Evening lines at the river");
      }

      if (route.name === "train-signed-out") {
        await expect(page.locator(".looking-back")).toHaveCount(0);
        await expect(page.locator(".train-rail a[href$='/sign-in']")).toBeVisible();
      }

      if (route.name === "events-mobile-list") {
        const filters = page.locator(".detail-filters");
        await expect(filters).toBeVisible();
        const detailTops = await filters.locator('mat-chip-option').evaluateAll(chips => chips.map(chip => Math.round(chip.getBoundingClientRect().top)));
        expect(new Set(detailTops).size).toBe(1);
        const regionBar = page.locator(".region-filters");
        await expect(regionBar).toBeVisible();
        const chipTops = await regionBar.locator("mat-chip-option").evaluateAll(
          chips => chips.map(chip => Math.round(chip.getBoundingClientRect().top)),
        );
        expect(new Set(chipTops).size).toBe(1);
        expect(await page.evaluate(() => document.documentElement.scrollWidth))
          .toBeLessThanOrEqual(route.viewport!.width);
        const scroller = regionBar.locator(".chips-scroll-area");
        if (await regionBar.locator(".scroll-button.right").isVisible()) {
          await regionBar.locator(".scroll-button.right").click();
          await expect.poll(() => scroller.evaluate(element => element.scrollLeft)).toBeGreaterThan(0);
        }
        await scroller.evaluate(element => element.scrollTo({ left: 0, behavior: "instant" }));
      }

      if (route.name === 'events-mobile-filters') {
        const row = page.locator('.detail-filters');
        await expect(row).toBeVisible();
        const tops = await row.locator('mat-chip-option').evaluateAll(chips => chips.map(chip => Math.round(chip.getBoundingClientRect().top)));
        expect(new Set(tops).size).toBe(1);
        await expect(row.locator('.scroll-button.right')).toBeVisible();
        await row.locator('.scroll-button.right').click();
        await expect.poll(() => row.locator('.chips-scroll-area').evaluate(element => element.scrollLeft)).toBeGreaterThan(0);
        await row.locator('.chips-scroll-area').evaluate(element => element.scrollTo({ left: 0, behavior: 'instant' }));
      }
      if (route.name === 'events-admin-drafts') {
        const header = page.locator('.drafts-section mat-expansion-panel-header');
        await expect(header).toHaveAttribute('aria-expanded', 'false');
        await header.click();
        await expect(page.locator('.draft-grid')).toContainText('Draft training weekend');
        await header.click();
        await expect(header).toHaveAttribute('aria-expanded', 'false');
      }
      if (route.name.startsWith('account')) {
        // Strip links are router buttons so taps never fall back to a document load.
        await expect(page.locator('.language-strip [routerlink="/support"]')).toBeVisible();
      }
      if (route.name === 'training-log') {
        const stats = page.locator('app-training-stats');
        await expect(stats.locator('.stats-spot')).toHaveCount(4);
        // Only the verified check-in Spot carries this month's private rank.
        await expect(stats.locator('.stats-spot__rank')).toHaveCount(1);
        await expect(stats.locator('.stats-spot').filter({ hasText: 'Sihlcity steps' }).locator('.stats-spot__rank')).toContainText('#2');
      }
      if (route.name === 'training-log-check-in-editor') {
        // A check-in is linked for the person; nothing asks them to pick records.
        await expect(page.locator('.linked')).toContainText('Sihlcity steps');
        await expect(page.locator('mat-checkbox')).toHaveCount(0);
        await expect(page.locator('.duration mat-button-toggle')).toHaveCount(6);
        await expect(page.locator('textarea')).toBeVisible();
        expect(await page.locator('textarea').inputValue()).toBe('');
      }
      if (route.name === 'train-check-in-prompt') {
        await expect(page.locator('app-check-in-log-prompt .prompt')).toBeVisible();
        await expect(page.locator('app-check-in-log-prompt a')).toHaveAttribute('href', /sessionRecord=visual-session-2/);
      }
      if (route.name.startsWith('training-session-detail')) {
        await expect(page.locator('.future-grid')).toHaveCount(0);
        await expect(page.locator('.description')).toContainText('precision practice');
      }
      await expect(page).toHaveScreenshot(`${route.name}-route.png`, {
        animations: "disabled",
        clip: route.clip,
        fullPage: route.fullPage ?? false,
        maxDiffPixels: route.maxDiffPixels ?? 1_000,
        mask: masks,
      });
      if (route.name === 'training-log-check-in-editor') {
        const save = page.locator('.editor-page footer button[type="submit"]');
        await save.evaluate(element => element.scrollIntoView({ block: 'center', behavior: 'instant' }));
        await expect.poll(async () => {
          const button = await save.boundingBox();
          const navigation = await page.locator('.floating-bottom-navigation').boundingBox();
          return navigation!.y - (button!.y + button!.height);
        }).toBeGreaterThanOrEqual(8);
      }
      if (route.name === 'train-check-in-prompt') {
        await page.locator('app-check-in-log-prompt button').click();
        await expect(page.locator('app-check-in-log-prompt .prompt')).toHaveCount(0);
        await page.reload();
        await expect(page.locator('.looking-back')).toBeVisible();
        await expect(page.locator('app-check-in-log-prompt .prompt')).toHaveCount(0);
      }


      if (route.assertContributionGraph) {
        const stickyLabels = await page
          .locator("app-training-activity-contribution-graph")
          .evaluate((element) => {
            const labels = element.querySelector<HTMLElement>(".weekday-labels")!;
            const scroll = element.querySelector<HTMLElement>(
              ".contribution-graph__scroll",
            )!;
            scroll.style.inlineSize = "180px";
            const before = labels.getBoundingClientRect().left;
            scroll.scrollLeft = 160;
            return {
              labelOffset: Math.abs(labels.getBoundingClientRect().left - before),
              scrollLeft: scroll.scrollLeft,
            };
          });
        expect(stickyLabels.scrollLeft).toBeGreaterThan(0);
        expect(stickyLabels.labelOffset).toBeLessThanOrEqual(0.1);
      }
    });
  }

  test("keeps page and navigation FABs inside simulated safe edges", async ({ page }) => {
    await prepareRoute(page, { name: "events-fab-safe-edges", path: "/events", signedIn: true, admin: true, eventIndexFixture: true, fixedTime: "2026-07-20T12:00:00.000Z", viewport: { width: 960, height: 480 } });
    await page.evaluate(() => {
      for (const [edge, value] of Object.entries({ top: 28, left: 48, right: 72, bottom: 34 })) {
        document.documentElement.style.setProperty(`--safe-area-inset-${edge}`, `${value}px`);
      }
    });
    const pageFab = page.locator("app-fab-menu.app-page-fab");
    const menuFab = page.locator("#alainMenuButton");
    await expect(pageFab).toBeVisible();
    const action = (await pageFab.boundingBox())!;
    expect(960 - action.x - action.width).toBeCloseTo(72 + 24, 0);
    expect(480 - action.y - action.height).toBeCloseTo(34 + 24, 0);
    const nav = (await menuFab.boundingBox())!;
    expect(nav.x).toBeCloseTo(48 + 16, 0);
    expect(nav.y).toBeCloseTo(28 + 16, 0);
    await menuFab.locator(".fab-menu__launcher").click();
    const expanded = (await menuFab.locator(".fab-menu__actions").boundingBox())!;
    expect(expanded.y + expanded.height).toBeLessThanOrEqual(480 - 34);
    expect(expanded.x + expanded.width).toBeLessThanOrEqual(960 - 72);
    await page.keyboard.press("Escape");
    await expect(page).toHaveScreenshot("events-fab-safe-edges.png", { animations: "disabled" });
  });

  test("pads native floating navigation above and below its buttons", async ({ page }) => {
    await prepareRoute(page, { name: "native-nav-padding", path: "/about", viewport: mobileViewport });
    const nav = page.locator(".floating-bottom-navigation");
    await nav.evaluate(element => element.classList.add("native-platform"));
    const box = (await nav.boundingBox())!;
    for (const button of await nav.locator(".button-container").all()) {
      const child = (await button.boundingBox())!;
      expect(child.y - box.y).toBeGreaterThanOrEqual(4);
      expect(box.y + box.height - child.y - child.height).toBeGreaterThanOrEqual(4);
    }
    await expect(nav).toHaveScreenshot("native-nav-padding.png", { animations: "disabled" });
  });

  test("keeps the map edge-to-edge while controls clear simulated safe areas", async ({ page }) => {
    await prepareRoute(page, {
      name: "map-safe-area",
      path: "/map",
      viewport: { width: 960, height: 720 },
    });
    await page.addStyleTag({ content: `:root {
      --safe-area-inset-top: 24px;
      --safe-area-inset-right: 84px;
      --safe-area-inset-left: 16px;
    }` });
    const map = page.locator("app-map-page app-spot-map");
    await expect(map).toBeVisible();
    const bounds = await map.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.y).toBeCloseTo(0, 0);
    expect(bounds!.x + bounds!.width).toBeCloseTo(960, 0);
    await page.setViewportSize({ width: 390, height: 650 });
    await expect(page.locator("app-root")).not.toHaveClass(/has-navigation-rail/);
    const compactBounds = await map.boundingBox();
    expect(compactBounds!.x).toBeCloseTo(0, 0);
    expect(compactBounds!.width).toBeCloseTo(390, 0);
    const search = await page.locator(".search-bar-overlay app-search-field").boundingBox();
    expect(search!.y).toBeGreaterThanOrEqual(24);
    expect(search!.x + search!.width).toBeLessThanOrEqual(390 - 84);
  });

  test("keeps a content peek above navigation when Android insets arrive and rotate", async ({ page }) => {
    await prepareRoute(page, {
      name: "android-sheet-peek", path: "/map", signedIn: true,
      viewport: { width: 390, height: 844 },
    });
    const sheet = page.locator(".map-bottom-sheet .sheet");
    const nav = page.locator(".floating-bottom-navigation");
    for (const bottom of [0, 24, 34]) {
      await page.evaluate((inset) => {
        document.documentElement.style.setProperty("--safe-area-inset-top", "32px");
        document.documentElement.style.setProperty("--safe-area-inset-bottom", `${inset}px`);
      }, bottom);
      await expect.poll(async () => {
        const panel = (await sheet.boundingBox())!;
        const bar = (await nav.boundingBox())!;
        return bar.y - panel.y;
      }).toBeGreaterThanOrEqual(90);
      const search = await page.locator(".search-bar-overlay app-search-field").boundingBox();
      expect(search!.y).toBeGreaterThanOrEqual(40);
      await page.setViewportSize({ width: 844, height: 390 });
      await page.setViewportSize({ width: 390, height: 844 });
      await expect.poll(async () => {
        const panel = (await sheet.boundingBox())!;
        const bar = (await nav.boundingBox())!;
        return bar.y - panel.y;
      }).toBeGreaterThanOrEqual(90);
    }
  });

  test("keeps landscape drawer content aligned with search across safe-area changes", async ({ page }) => {
    await prepareRoute(page, { name: "map-landscape-safe-area", path: "/map", viewport: { width: 678, height: 466 } });
    for (const left of [84, 0, 84]) {
      await page.evaluate((inset) => {
        document.documentElement.style.setProperty("--safe-area-inset-left", `${inset}px`);
        document.documentElement.style.setProperty("--safe-area-inset-right", `${84 - inset}px`);
      }, left);
      const search = page.locator(".search-field-container");
      const drawer = page.locator(".info-panel .mat-drawer-inner-container");
      await expect(search).toBeVisible();
      await expect(drawer).toBeVisible();
      await expect.poll(async () => {
        const a = (await search.boundingBox())!;
        const b = (await drawer.boundingBox())!;
        return Math.abs(a.x - b.x) + Math.abs(a.width - b.width);
      }).toBeLessThan(1);
      expect((await drawer.boundingBox())!.width).toBeGreaterThanOrEqual(330);
      await expect(page.locator(".map-mini-fabs")).toBeVisible();
    }
  });

  test("keeps sheet surfaces safe and the native menu aligned through rotation", async ({ page }) => {
    await prepareRoute(page, { name: "map-sheet-safe-area", path: "/map", viewport: { width: 466, height: 678 } });
    for (const viewport of [{ width: 466, height: 678 }, { width: 678, height: 466 }, { width: 466, height: 678 }, { width: 390, height: 844 }]) {
      await page.setViewportSize(viewport);
      const landscape = viewport.height < 500;
      await page.evaluate(({ landscape }) => {
        const root = document.documentElement.style;
        root.setProperty("--safe-area-inset-left", landscape ? "84px" : "0px");
        root.setProperty("--safe-area-inset-right", landscape ? "0px" : "44px");
        root.setProperty("--safe-area-inset-top", "24px");
        root.setProperty("--safe-area-inset-bottom", "34px");
        document.querySelector("#alainMenuButton")?.classList.add("native-platform");
      }, { landscape });
      if (viewport.height < 700) {
        const search = page.locator("app-map-page app-search-field");
        const menu = page.locator("#alainMenuButton .fab-menu__launcher");
        await expect(menu).toBeVisible();
        await expect.poll(async () => {
          const a = (await search.boundingBox())!;
          const b = (await menu.boundingBox())!;
          return Math.abs(a.y - b.y);
        }).toBeLessThan(1);
      }
      if (!landscape) {
        const sheet = page.locator(".map-bottom-sheet");
        await expect(sheet).toBeVisible();
        const bounds = (await sheet.boundingBox())!;
        expect(bounds.x).toBeCloseTo(0, 0);
        expect(bounds.width).toBeCloseTo(viewport.width - 44, 0);
        expect(await page.locator(".handle-region").evaluate(el => getComputedStyle(el).userSelect)).toBe("none");
        const padding = await sheet.locator(".content").evaluate(el => parseFloat(getComputedStyle(el).paddingBottom));
        expect(padding).toBeGreaterThanOrEqual(50);
      } else {
        const panel = page.locator(".info-panel");
        await expect(panel).toBeVisible();
        expect((await panel.boundingBox())!.y).toBeCloseTo(0, 0);
        expect(await panel.evaluate(el => getComputedStyle(el).backgroundColor)).not.toBe("rgba(0, 0, 0, 0)");
        const map = page.locator("app-spot-map");
        expect((await map.boundingBox())!.x).toBeCloseTo(84, 0);
        await page.locator(".sidenav-toggle button").click();
        await expect(panel).not.toBeVisible();
        expect((await map.boundingBox())!.x).toBeCloseTo(84, 0);
      }
    }
  });

  test("centers the book layout seam including the navigation rail", async ({ page }) => {
    await prepareRoute(page, { name: "map-book-seam", path: "/map", viewport: { width: 951, height: 669 } });
    for (const left of [0, 84]) {
      await page.evaluate(inset => {
        document.documentElement.style.setProperty("--safe-area-inset-left", `${inset}px`);
        document.documentElement.style.setProperty("--safe-area-inset-right", `${84 - inset}px`);
      }, left);
      for (const selector of [".info-panel", ".search-field-container"]) {
        await expect.poll(async () => {
          const bounds = (await page.locator(selector).boundingBox())!;
          return Math.abs(bounds.x + bounds.width - 951 / 2);
        }).toBeLessThan(1);
      }
    }
  });

  test("aligns map credits with mini FABs inside safe edges", async ({ page }) => {
    await prepareRoute(page, { name: "map-credits", path: "/map", viewport: { width: 960, height: 720 } });
    await expect(page.locator(".gm-style-cc").first()).toBeAttached({ timeout: 15000 });
    for (const { viewport, rightInset } of [
      { viewport: { width: 960, height: 720 }, rightInset: 0 },
      { viewport: { width: 466, height: 678 }, rightInset: 0 },
      { viewport: { width: 960, height: 720 }, rightInset: 84 },
      { viewport: { width: 466, height: 678 }, rightInset: 84 },
    ]) {
      await page.setViewportSize(viewport);
      await page.evaluate((inset) => {
        document.documentElement.style.setProperty("--safe-area-inset-right", `${inset}px`);
        document.documentElement.style.setProperty("--safe-area-inset-bottom", "34px");
      }, rightInset);
      const credits = page.locator("app-google-map-2d div:has(> .gm-style-cc):not(.gmnoprint)");
      await expect(credits).toBeVisible();
      await expect.poll(async () => {
        const box = (await credits.boundingBox())!;
        return box.x + box.width;
      }).toBeCloseTo(viewport.width - rightInset - 20, 0);
      const box = (await credits.boundingBox())!;
      expect(box.y + box.height).toBeLessThanOrEqual(viewport.height - 34);
      expect(box.x).toBeGreaterThanOrEqual(0);
      const controls = (await page.locator(".map-mini-fabs").boundingBox())!;
      expect(box.x + box.width).toBeCloseTo(controls.x + controls.width, 0);
      expect(controls.y + controls.height).toBeLessThanOrEqual(box.y - 14);
      const logo = page.locator("app-google-map-2d .gm-logo");
      await expect(logo).toBeVisible();
      expect((await logo.boundingBox())!.y + (await logo.boundingBox())!.height).toBeLessThanOrEqual(viewport.height - 34);
    }
  });

  test("fades and shrinks map section headings with the area heading while dragging", async ({ page }) => {
    await prepareRoute(page, {
      name: "map-heading-collapse", path: "/map",
      viewport: { width: 390, height: 844 },
    });
    await page.evaluate(() => document.fonts.ready);
    const sheet = page.locator(".map-bottom-sheet .sheet");
    const handle = sheet.locator(".handle-region");
    const areaTitle = sheet.locator(".area-title");
    const sectionTitles = sheet.locator(".peek-title");
    await handle.click();
    await expect(areaTitle).toHaveCSS("opacity", "1");
    const expandedHeight = (await sectionTitles.first().boundingBox())!.height;
    const box = (await handle.boundingBox())!;
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x, y + 180, { steps: 12 });
    // Hold an intermediate drag position: headings must already fade and shrink,
    // rather than waiting for the old near-closed threshold to start hiding.
    await expect.poll(async () => Number(await areaTitle.evaluate(el => getComputedStyle(el).opacity)))
      .toBeLessThan(0.9);
    await expect.poll(async () => Number(await sectionTitles.first().evaluate(el => getComputedStyle(el).opacity)))
      .toBeLessThan(0.9);
    await sheet.evaluate(async el => {
      await Promise.all(el.getAnimations({ subtree: true }).map(animation => animation.finished.catch(() => undefined)));
    });
    const areaOpacity = Number(await areaTitle.evaluate(el => getComputedStyle(el).opacity));
    expect(areaOpacity).toBeGreaterThan(0.2);
    for (const title of await sectionTitles.all()) {
      expect(Number(await title.evaluate(el => getComputedStyle(el).opacity))).toBeCloseTo(areaOpacity, 2);
      expect((await title.boundingBox())!.height).toBeLessThan(expandedHeight);
    }
    await page.mouse.move(x, 820, { steps: 12 });
    await page.mouse.up();
    await expect(areaTitle).toHaveCSS("opacity", "0");
    for (const title of await sectionTitles.all()) {
      await expect(title).toHaveCSS("opacity", "0");
      await expect(title).toHaveCSS("max-height", "0px");
      await expect(title).toHaveCSS("padding-top", "0px");
      await expect(title).toHaveCSS("margin-bottom", "0px");
    }
    await handle.click();
    await expect(sectionTitles.first()).toHaveCSS("opacity", "1");
  });

  test("scrolls the chip row horizontally without dragging the bottom sheet", async ({ page }) => {
    await prepareRoute(page, { name: "sheet-chip-gesture", path: "/map", viewport: { width: 390, height: 650 } });
    const sheet = page.locator(".map-bottom-sheet .sheet");
    await sheet.locator(".handle-region").click();
    await expect.poll(() => sheet.evaluate(el => getComputedStyle(el).transform)).toBe("matrix(1, 0, 0, 1, 0, 0)");
    const row = sheet.locator(".chips-scroll-area").first();
    await expect(row).toBeVisible();
    expect(await row.locator("button").first().evaluate(el => getComputedStyle(el).touchAction)).toBe("pan-x");
    const before = await sheet.evaluate(el => getComputedStyle(el).transform);
    const box = (await row.boundingBox())!;
    await page.mouse.move(box.x + box.width * 0.7, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + 40, box.y + box.height / 2 + 18, { steps: 12 });
    await page.mouse.up();
    expect(await row.evaluate(el => el.scrollLeft)).toBeGreaterThan(20);
    expect(await sheet.evaluate(el => getComputedStyle(el).transform)).toBe(before);
    const touchPrevented = await row.evaluate(el => {
      const target = el.querySelector("button")!;
      const rect = target.getBoundingClientRect();
      const touch = (x: number, y: number) => new Touch({ identifier: 7, target, clientX: x, clientY: y, pageX: x, pageY: y });
      const start = touch(rect.x + 40, rect.y + 15);
      target.dispatchEvent(new TouchEvent("touchstart", { bubbles: true, touches: [start], changedTouches: [start] }));
      const moved = touch(rect.x - 40, rect.y + 30);
      const move = new TouchEvent("touchmove", { bubbles: true, cancelable: true, touches: [moved], changedTouches: [moved] });
      target.dispatchEvent(move);
      target.dispatchEvent(new TouchEvent("touchend", { bubbles: true, changedTouches: [moved] }));
      return move.defaultPrevented;
    });
    expect(touchPrevented).toBe(false);
    expect(await sheet.evaluate(el => getComputedStyle(el).transform)).toBe(before);
  });

  test("keeps the rail and Alain menu exclusive when unfolding without window resize", async ({ page }) => {
    await prepareRoute(page, { name: "navigation-unfold", path: "/about", viewport: { width: 466, height: 678 } });
    await expect(page.locator("#alainMenuButton")).toBeVisible();
    // Emulate WebKit updating layout via visualViewport rather than window resize.
    await page.evaluate(() => {
      Object.defineProperty(window, "innerWidth", { configurable: true, value: 951 });
      Object.defineProperty(window, "innerHeight", { configurable: true, value: 669 });
      Object.defineProperty(document.documentElement, "clientWidth", { configurable: true, value: 951 });
      Object.defineProperty(document.documentElement, "clientHeight", { configurable: true, value: 669 });
      window.visualViewport!.dispatchEvent(new Event("resize"));
    });
    await expect(page.locator("app-nav-rail")).toBeVisible();
    await expect(page.locator("#alainMenuButton")).toHaveCount(0);
  });

  test("uses the passport-unfolded rail while documents retain window scrolling", async ({
    page,
  }) => {
    await prepareRoute(page, {
      name: "passport-unfolded-navigation",
      path: "/about",
      // Galaxy Z Fold8's unfolded panel is 4:3. Browser CSS dimensions depend
      // on Android density, so use a representative 4:3 layout viewport.
      viewport: { width: 720, height: 960 },
    });

    await expect(page.locator("app-root")).toHaveClass(/has-navigation-rail/);
    await expect(page.locator("app-nav-rail")).toHaveCount(1);
    await expect(page.locator(".floating-bottom-navigation")).toHaveCount(0);

    const scrolling = await page.locator("body").evaluate(() => ({
      bodyOverflowY: getComputedStyle(document.body).overflowY,
      mainOverflowY: getComputedStyle(
        document.querySelector(".main-content")!,
      ).overflowY,
      scrollingElement: document.scrollingElement?.tagName,
    }));

    expect(scrolling.bodyOverflowY).not.toBe("hidden");
    expect(scrolling.mainOverflowY).not.toMatch(/auto|scroll/);
    expect(scrolling.scrollingElement).toBe("HTML");
  });
});

async function prepareRoute(page: Page, route: RouteVisualCase): Promise<void> {
  await page.setViewportSize(route.viewport ?? desktopViewport);
  if (route.trainFixture) {
    // Keep locality labels deterministic and never geocode real locations in visual tests.
    await page.route("https://maps.googleapis.com/maps/api/js?**", route => route.fulfill({
      contentType: "application/javascript",
      body: `window.google = { maps: { importLibrary: async () => ({
        Settings: { getInstance: () => ({}) },
        Geocoder: class { async geocode() { return { results: [{ address_components: [
          { long_name: "Zürich", types: ["locality"] }
        ] }] }; } }
      }) } }; window.mapsCallback();`,
    }));
    await page.context().grantPermissions(["geolocation"]);
    await page.context().setGeolocation({
      latitude: 47.3769,
      longitude: 8.5417,
      accuracy: 20,
    });
  }
  if (route.fixedTime) {
    await page.clock.setFixedTime(new Date(route.fixedTime));
  }
  await page.addInitScript(
    ({
      acceptedVersion,
      plannedSessionFixture,
      admin,
      eventIndexFixture,
      invalidEventFixture,
      liveEventFixture,
      myEventsDialogFixture,
      publicProfile,
      signedIn,
      trainFixture,
      trainLiveEventFixture,
      trainingLogFixture,
      unloggedCheckIn,
      verifiedAdult,
    }) => {
      // Visual fixtures exercise local UI, not reCAPTCHA or App Check providers.
      (globalThis as typeof globalThis & { __PKSPOT_STORE_SCREENSHOT__?: boolean })
        .__PKSPOT_STORE_SCREENSHOT__ = true;
      localStorage.setItem("acceptedVersion", acceptedVersion);
      (globalThis as typeof globalThis & { __PKSPOT_SCREENSHOT_DUPLICATES__?: unknown }).__PKSPOT_SCREENSHOT_DUPLICATES__ = [{
        id: "visual-duplicates", closestDistanceMeters: 2,
        spots: [{id: "visual-spot-one", label: "Riverside training walls", createdAtMillis: 1750000000000},
          {id: "visual-spot-two", label: "Riverside", createdAtMillis: 1760000000000}],
      }];
      if (plannedSessionFixture) {
        (globalThis as typeof globalThis & { __PKSPOT_PLANNED_SESSION_FIXTURE__?: unknown }).__PKSPOT_PLANNED_SESSION_FIXTURE__ = {
          session: { id: "visual-session", title: "Evening training", notes: "Bring water and choose your own pace.", spotId: "visual-spot",
            startsAt: Date.UTC(2027, 0, 15, 16), endsAt: Date.UTC(2027, 0, 15, 18), timeZone: "Europe/Zurich",
            audience: plannedSessionFixture === "community" ? "community" : "private", ownerUid: signedIn ? "visual-route-user" : "", cancelled: false, revision: 1 },
          isOwner: !!signedIn, canAttendVisibly: !!signedIn,
          mine: signedIn ? { saved: true, reminder: false, attendance: "private" } : null,
        };
      }

      localStorage.setItem(
        "lastLocationAndZoom",
        JSON.stringify({
          location: { lat: 47.3769, lng: 8.5417 },
          zoom: 16,
        }),
      );
      localStorage.setItem("mapStyle", "roadmap");

      if (trainFixture) {
        localStorage.setItem(
          "pkspot_location_access",
          JSON.stringify({ mode: "on" }),
        );
        (
          window as typeof window & {
            __PKSPOT_SCREENSHOT_TRAIN_PAGE__?: unknown;
            __PKSPOT_SCREENSHOT_COMMUNITY_FOLLOWS__?: unknown;
          }
        ).__PKSPOT_SCREENSHOT_TRAIN_PAGE__ = {
          nearbyEvents: [
            {
              id: "visual-evening-lines",
              slug: "visual-evening-lines",
              name: "Evening lines at the river",
              venueString: "Riverside rails",
              localityString: "Zurich, Switzerland",
              isSponsored: false,
              hasOrganization: false,
              hasVenueSpot: true,
              venueSpotCount: 1,
              location: [47.3773, 8.539],
              startSeconds: Date.UTC(2026, 7, 20, trainLiveEventFixture ? 11 : 16) / 1_000,
              endSeconds: Date.UTC(2026, 7, 20, trainLiveEventFixture ? 15 : 19) / 1_000,
              timeZone: "Europe/Zurich",
              lifecycleStatus: "planned",
              eventLinks: [],
              ticketOptions: [],
              spotIds: ["visual-riverside-rails"],
              communityKeys: ["locality:ch:zh:zurich"],
              seriesIds: [],
              eventCategories: ["jam"],
              rsvpCounts: { going: 7, interested: 3, notgoing: 0, total: 10 },
              seriesRoles: [],
              qualifiesToKeys: [],
              requiredQualifierKeys: [],
            },
            {
              id: "visual-saturday-session",
              slug: "visual-saturday-session",
              name: "Saturday flow session",
              venueString: "Lindenhof walls",
              localityString: "Zurich, Switzerland",
              isSponsored: false,
              hasOrganization: false,
              hasVenueSpot: true,
              venueSpotCount: 1,
              location: [47.3707, 8.5392],
              startSeconds: Date.UTC(2026, 7, 22, 10) / 1_000,
              endSeconds: Date.UTC(2026, 7, 22, 13) / 1_000,
              timeZone: "Europe/Zurich",
              lifecycleStatus: "planned",
              eventLinks: [],
              ticketOptions: [],
              spotIds: ["visual-lindenhof-walls"],
              communityKeys: ["locality:ch:zh:zurich"],
              seriesIds: [],
              eventCategories: ["session"],
              rsvpCounts: { going: 4, interested: 5, notgoing: 0, total: 9 },
              seriesRoles: [],
              qualifiesToKeys: [],
              requiredQualifierKeys: [],
            },
          ],
          communityEvents: [
            {
              id: "visual-geneva-gathering",
              slug: "visual-geneva-gathering",
              name: "Geneva community gathering",
              venueString: "Parc des Bastions",
              localityString: "Geneva, Switzerland",
              isSponsored: false,
              hasOrganization: false,
              hasVenueSpot: false,
              venueSpotCount: 0,
              location: [46.2044, 6.1432],
              startSeconds: Date.UTC(2026, 7, 30, 11) / 1_000,
              endSeconds: Date.UTC(2026, 7, 30, 16) / 1_000,
              timeZone: "Europe/Zurich",
              lifecycleStatus: "planned",
              eventLinks: [],
              ticketOptions: [],
              spotIds: [],
              communityKeys: ["country:ch"],
              seriesIds: [],
              eventCategories: ["jam"],
              rsvpCounts: { going: 13, interested: 8, notgoing: 0, total: 21 },
              seriesRoles: [],
              qualifiesToKeys: [],
              requiredQualifierKeys: [],
            },
          ],
          spots: [
            {
              id: "visual-riverside-rails",
              slug: "visual-riverside-rails",
              name: "Riverside rails",
              locality: "Zurich",
              countryCode: "CH",
              imageSrc: "",
              isIconic: true,
              rating: 9,
              location_raw: { lat: 47.3773, lng: 8.539 },
              amenities: { dry: false, lighting: true },
            },
            {
              id: "visual-lindenhof-walls",
              slug: "visual-lindenhof-walls",
              name: "Lindenhof walls",
              locality: "Zurich",
              countryCode: "CH",
              imageSrc: "",
              isIconic: false,
              rating: 8,
              location_raw: { lat: 47.3707, lng: 8.5392 },
              amenities: { dry: true, lighting: false },
            },
            {
              id: "visual-central-rails",
              slug: "visual-central-rails",
              name: "Central rails",
              locality: "Zurich",
              countryCode: "CH",
              imageSrc: "",
              isIconic: false,
              rating: 8,
              location_raw: { lat: 47.38, lng: 8.53 },
              amenities: { dry: true, lighting: true },
            },
            {
              id: "visual-university-ledges",
              slug: "visual-university-ledges",
              name: "University ledges",
              locality: "Zurich",
              countryCode: "CH",
              imageSrc: "",
              isIconic: false,
              rating: 7,
              location_raw: { lat: 47.385, lng: 8.548 },
              amenities: { dry: false, lighting: false },
            },
          ],
          communities: [
            {
              id: "country-ch",
              communityKey: "country:ch",
              slug: "switzerland",
              displayName: "Switzerland",
              totalSpots: 240,
              canonicalPath: "/map/communities/switzerland",
            },
          ],
        };
        // Dry now, rain from 17:00 Zurich time, so the precipitation chart has shape.
        const rainMm = [0, 0, 0, 0.4, 1.8, 2.6, 1.2, 0.3, 0, 0, 0, 0];
        (
          window as typeof window & { __PKSPOT_SCREENSHOT_WEATHER__?: unknown }
        ).__PKSPOT_SCREENSHOT_WEATHER__ = {
          provider: "open-meteo",
          mode: "current-and-near-future",
          location: { lat: 47.3769, lng: 8.5417 },
          countryCode: "CH",
          generatedAt: "2026-08-20T12:00:00Z",
          expiresAt: "2099-01-01T00:00:00Z",
          timeZone: "Europe/Zurich",
          current: {
            time: "2026-08-20T12:00:00Z",
            temperatureC: 21,
            condition: "partly-cloudy",
            precipitationMm: 0,
            precipitationProbabilityPercent: 10,
            isDay: true,
          },
          forecast: rainMm.map((precipitationMm, index) => ({
            time: new Date(Date.UTC(2026, 7, 20, 12 + index)).toISOString(),
            temperatureC: 21 - Math.floor(index / 3),
            condition: precipitationMm >= 1 ? "rain" : precipitationMm > 0 ? "drizzle" : "partly-cloudy",
            precipitationMm,
            precipitationProbabilityPercent: precipitationMm > 0 ? 70 : 10,
            isDay: index < 8,
          })),
          insights: {
            summary: "Rain expected later",
            rainStartsAt: "2026-08-20T15:00:00Z",
            precipitationRisk: "medium",
            sunExposure: "low",
            surfaceDrying: { status: "likely_dry", confidence: "low", factors: [] },
          },
        };
        (
          window as typeof window & {
            __PKSPOT_SCREENSHOT_COMMUNITY_FOLLOWS__?: unknown;
          }
        ).__PKSPOT_SCREENSHOT_COMMUNITY_FOLLOWS__ = [
          {
            id: "visual-country-ch-follow",
            community_key: "country:ch",
            scope: "country",
            display_name: "Switzerland",
            canonical_path: "/map/communities/switzerland",
            time_created_raw_ms: Date.UTC(2026, 0, 1),
          },
        ];
      }

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
              published: true,
              visibility: "public",
              discoverability: { audience: "global" },
              venue_string: "Riverside Park",
              locality_string: "Basel, Switzerland",
              location_raw: { lat: 47.5596, lng: 7.5886 },
              start: "2026-08-01T10:00:00.000Z",
              end: "2026-08-02T18:00:00.000Z",
              time_zone: "Europe/Zurich",
              community_keys: ["country:ch", "region:bs", "locality:ch:bs:basel"],
              event_categories: ["jam"],
              series_ids: ["community-jam-series"],
              listing_tier: "community",
              country_code: "CH",
              region_keys: ["europe"],
              rsvp_counts: { going: 8, interested: 4, notgoing: 0, total: 12 },
            },
            {
              id: "visual-ticket-event",
              slug: "visual-ticket-event",
              name: "Movement Weekend",
              organizer_name: "PK Spot Community",
              venue_string: "Movement Hall",
              locality_string: "Zurich, Switzerland",
              start: "2026-09-19T09:00:00.000Z",
              end: "2026-09-20T18:00:00.000Z",
              time_zone: "Europe/Zurich",
              event_categories: ["camp"],
              listing_tier: "formal",
              country_code: "CH",
              region_keys: ["europe"],
              ticket_options: [
                {
                  id: "weekend",
                  label: "Full weekend pass",
                  description:
                    "Access to both event days, all open training areas, workshops, and the Saturday evening community session.",
                  url: "https://tickets.example/weekend",
                  price: { amount: 90, currency: "CHF" },
                  original_price: { amount: 120, currency: "CHF" },
                  availability: "available",
                  badge: "discount",
                },
                {
                  id: "supporter",
                  label: "Supporter pass with flexible contribution",
                  description:
                    "Choose an amount within the range. Every contribution helps fund the youth program and keeps community sessions accessible.",
                  url: "https://tickets.example/supporter",
                  price: {
                    min_amount: 110,
                    max_amount: 160,
                    currency: "CHF",
                  },
                  availability: "waitlist",
                  badge: "member",
                },
                {
                  id: "saturday",
                  label: "Saturday day pass",
                  description: "All Saturday activities and workshops.",
                  url: "https://tickets.example/saturday",
                  price: { amount: 49, currency: "CHF" },
                  availability: "sold_out",
                },
                {
                  id: "sunday",
                  label: "Sunday day pass",
                  description: "All Sunday activities and workshops.",
                  price: { amount: 49, currency: "CHF" },
                  availability: "coming_soon",
                  badge: "early_bird",
                },
                {
                  id: "team",
                  label: "Team experience",
                  url: "https://tickets.example/team",
                  availability: "ended",
                },
              ],
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
              time_zone: "Europe/Zurich",
              community_keys: [
                "country:ch",
                "region:zh",
                "locality:ch:zh:zurich",
              ],
              event_categories: ["competition"],
              series_ids: ["parkour-earth"],
              listing_tier: "formal",
              country_code: "CH",
              region_keys: ["europe"],
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
              time_zone: "Europe/Zurich",
              community_keys: ["country:ch", "region:be", "locality:ch:be:bern"],
              event_categories: ["camp"],
              listing_tier: "community",
              country_code: "CH",
              region_keys: ["europe"],
              rsvp_counts: { going: 5, interested: 2, notgoing: 0, total: 7 },
            },
            {
              id: "visual-date-only",
              slug: "visual-date-only",
              name: "Parkour Gathering — Details Soon",
              start: "2026-08-22T00:00:00.000Z",
              end: "2026-08-22T23:59:59.999Z",
              timing: {
                start_date: "2026-08-22",
                mode: "date_only",
              },
              has_location: false,
              event_categories: ["jam"],
              rsvp_counts: {
                going: 2,
                interested: 8,
                notgoing: 0,
                total: 10,
              },
            },
            {
              id: "visual-open-session",
              slug: "visual-open-session",
              name: "Open-end Riverside Session",
              venue_string: "Riverside rails",
              locality_string: "Zurich, Switzerland",
              location_raw: { lat: 47.3769, lng: 8.5417 },
              start: "2026-08-29T16:00:00.000Z",
              end: "2026-08-29T20:00:00.000Z",
              active_until_seconds: 1788033600,
              timing: {
                start_date: "2026-08-29",
                start_time: "18:00",
                mode: "open_end",
              },
              time_zone: "Europe/Zurich",
              event_categories: ["jam"],
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
              time_zone: "Europe/Zurich",
              community_keys: ["country:ch", "region:ge", "locality:ch:ge:geneva"],
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
              time_zone: "Europe/Zurich",
              community_keys: ["country:ch", "region:vd", "locality:ch:vd:lausanne"],
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
              time_zone: "Europe/Zurich",
              community_keys: ["country:ch", "region:lu", "locality:ch:lu:lucerne"],
              event_categories: ["jam"],
              series_ids: ["community-jam-series"],
            },
          ],
          drafts: [{
            id: 'visual-admin-draft', name: 'Draft training weekend',
            start: '2026-09-19T09:00:00.000Z', end: '2026-09-20T17:00:00.000Z',
            published: false, venue_string: 'Riverside Park', locality_string: 'Zurich, Switzerland',
            time_zone: 'Europe/Zurich',
          }],
          seriesById: {
            "community-jam-series": {
              id: "community-jam-series",
              name: "Community Meetup Series",
            },
            "parkour-earth": {
              id: "parkour-earth",
              name: "Parkour Earth",
              logo_src: "assets/logos/parkour_earth.jpg",
              logo_background_color: "#ffffff",
            },
          },
        };
        if (invalidEventFixture) {
          const eventIndex = (
            window as typeof window & {
              __PKSPOT_SCREENSHOT_EVENT_INDEX__?: {
                events: Record<string, unknown>[];
              };
            }
          ).__PKSPOT_SCREENSHOT_EVENT_INDEX__;
          eventIndex?.events.push(
            {
              id: "visual-missing-zone",
              slug: "visual-missing-zone",
              name: "Timezone Repair Jam",
              banner_src: "assets/swissjam/swissjam26_banner.jpeg",
              venue_string: "Repair Hall",
              locality_string: "Zurich, Switzerland",
              location_raw: { lat: 47.3769, lng: 8.5417 },
              start: "2026-08-22T10:00:00.000Z",
              end: "2026-08-22T18:00:00.000Z",
              community_keys: [
                "country:ch",
                "region:zh",
                "locality:ch:zh:zurich",
              ],
              event_categories: ["jam"],
              rsvp_counts: {
                going: 2,
                interested: 3,
                notgoing: 0,
                total: 5,
              },
            },
            {
              id: "visual-missing-zone-finland",
              slug: "visual-missing-zone-finland",
              name: "Power Flow Jam",
              venue_string: "Goat Gym",
              locality_string: "Lahti, Finland",
              location_raw: { lat: 60.9827, lng: 25.6615 },
              start: "2026-07-09T10:00:00.000Z",
              end: "2026-07-12T18:00:00.000Z",
              community_keys: ["country:fi"],
              event_categories: ["jam"],
              rsvp_counts: {
                going: 0,
                interested: 1,
                notgoing: 0,
                total: 1,
              },
            },
            {
              id: "visual-missing-zone-canada",
              slug: "visual-missing-zone-canada",
              name: "North Coast Gathering",
              venue_string: "Movement Centre",
              locality_string: "Montreal, Canada",
              location_raw: { lat: 45.5019, lng: -73.5674 },
              start: "2026-09-04T14:00:00.000Z",
              end: "2026-09-06T22:00:00.000Z",
              community_keys: ["country:ca"],
              event_categories: ["jam"],
              rsvp_counts: {
                going: 4,
                interested: 7,
                notgoing: 0,
                total: 11,
              },
            },
          );
        }
      }

      if (signedIn) {
        const screenshotWindow = (
          window as typeof window & {
            __PKSPOT_SCREENSHOT_AUTH_USER__?: unknown;
            __PKSPOT_SCREENSHOT_USER_PROFILES__?: Record<string, unknown>;
            __PKSPOT_SCREENSHOT_DISABLE_NOTIFICATION_PROMPTS__?: boolean;
            __PKSPOT_SCREENSHOT_EVENT_OWNERSHIP_CLAIMS__?: unknown[];
            __PKSPOT_SCREENSHOT_NOTIFICATIONS__?: unknown;
            __PKSPOT_SCREENSHOT_REPORT_OUTCOMES__?: unknown;
            __PKSPOT_SCREENSHOT_MY_REPORTS__?: unknown;
            __PKSPOT_SCREENSHOT_TRAINING_LOG_ENTRIES__?: unknown;
            __PKSPOT_SCREENSHOT_TRAINING_SESSIONS__?: unknown;
            __PKSPOT_SCREENSHOT_SPOT_RANKS__?: unknown;
            __PKSPOT_SCREENSHOT_RECOVERY_PAUSES__?: unknown;
          }
        );
        const screenshotUserData = {
          display_name: "Visual Route User",
          biography: "Parkour athlete and PK Spot route visual fixture.",
          verified_email: true,
          follower_count: 12,
          following_count: 8,
          visited_spots_count: 24,
          start_date: {
            seconds: Date.UTC(2019, 3, 12) / 1_000,
            nanoseconds: 0,
          },
          start_date_raw_ms: Date.UTC(2019, 3, 12),
          nationality_code: "CH",
          home_city: "Zurich",
          socials: {
            instagram_handle: "visualroute",
            youtube_handle: "visualroute",
            other: [
              {
                name: "Personal Website",
                url: "https://example.test/personal-website",
              },
            ],
          },
          age_policy: {
            participation_state: "allowed",
            source: "manual",
            platform: "web",
            ...(verifiedAdult
              ? {
                  adult_eligibility: "verified",
                  age_range: { lower: 18, upper: 120 },
                  assurance: {
                    status: "active",
                    client_integrity: "play_integrity_request_bound",
                    approval_basis: "visual-fixture",
                  },
                }
              : {}),
          },
          public_profile_enabled: publicProfile === true,
          account_privacy: "public",
          profile_visibility: "public",
          is_admin: admin,
        };
        screenshotWindow.__PKSPOT_SCREENSHOT_AUTH_USER__ = {
          uid: "visual-route-user",
          email: "visual-route-user@example.test",
          emailVerified: true,
          providerId: "password",
          data: screenshotUserData,
        };
        screenshotWindow.__PKSPOT_SCREENSHOT_USER_PROFILES__ = {
          "visual-route-user": screenshotUserData,
        };
        screenshotWindow.__PKSPOT_SCREENSHOT_DISABLE_NOTIFICATION_PROMPTS__ = true;
        screenshotWindow.__PKSPOT_SCREENSHOT_EVENT_OWNERSHIP_CLAIMS__ = [];
        screenshotWindow.__PKSPOT_SCREENSHOT_REPORT_OUTCOMES__ = {
          "visual-report-outcome": {
            id: "visual-report-outcome",
            kind: "spot",
            target_name: "Central Station",
            outcome: "action_taken",
            public_reason: "action_taken",
            source_path: "spots/visual-spot/reports/visual-report",
            decided_at: { seconds: Math.floor(Date.now() / 1000), nanoseconds: 0 },
            decided_at_raw_ms: Date.now() - 60 * 60_000,
          },
        };
        screenshotWindow.__PKSPOT_SCREENSHOT_MY_REPORTS__ = [
          {
            id: "visual-open-report",
            kind: "spot",
            status: "open",
            reasons: ["private", "other"],
            comment: "The gate is closed after training hours.",
            spot: {id: "visual-spot", name: "Central Station"},
          },
          {
            id: "visual-withdrawn-report",
            kind: "media",
            status: "withdrawn",
            reasons: ["inappropriate"],
            comment: "",
            media: {type: "image", src: "assets/mock/visual-report.jpg"},
          },
        ];
        if (trainingLogFixture) {
          const august = (day: number, hour: number) =>
            Date.UTC(2026, 7, day, hour);
          screenshotWindow.__PKSPOT_SCREENSHOT_TRAINING_SESSIONS__ = [
            {
              id: "visual-session-1",
              owner_id: "visual-route-user",
              source: "manual",
              started_at_raw_ms: august(15, 15),
              ended_at_raw_ms: august(15, 17),
              last_activity_raw_ms: august(15, 17),
              time_zone: "Europe/Zurich",
              spot_visits: [
                { spot_id: "lindenhof-walls", spot_name: "Lindenhof walls", arrived_at_raw_ms: august(15, 15) },
                { spot_id: "central-rails", spot_name: "Central rails", arrived_at_raw_ms: august(15, 16) },
              ],
              people_present: [
                { uid: "maya", display_name: "Maya A." },
                { uid: "dario", display_name: "Dario" },
              ],
              time_created_raw_ms: august(15, 17),
              time_updated_raw_ms: august(15, 17),
            },
            {
              id: "visual-session-2",
              owner_id: "visual-route-user",
              source: "check_in",
              started_at_raw_ms: august(12, 16),
              ended_at_raw_ms: august(12, 17),
              last_activity_raw_ms: august(12, 17),
              time_zone: "Europe/Zurich",
              spot_visits: [
                { spot_id: "sihlcity-steps", spot_name: "Sihlcity steps", check_in_id: "visual-check-in-1", arrived_at_raw_ms: august(12, 16) },
              ],
              people_present: [],
              time_created_raw_ms: august(12, 17),
              time_updated_raw_ms: august(12, 17),
            },
            {
              id: "visual-session-3",
              owner_id: "visual-route-user",
              source: "manual",
              started_at_raw_ms: august(4, 18),
              ended_at_raw_ms: august(4, 19),
              last_activity_raw_ms: august(4, 19),
              time_zone: "Europe/Zurich",
              spot_visits: [
                { spot_id: "langstrasse-ledges", spot_name: "Langstrasse ledges", arrived_at_raw_ms: august(4, 18) },
              ],
              people_present: [],
              time_created_raw_ms: august(4, 19),
              time_updated_raw_ms: august(4, 19),
            },
          ];
          // Private monthly rank for the verified check-in Spot (only ever shown to its owner).
          screenshotWindow.__PKSPOT_SCREENSHOT_SPOT_RANKS__ = {
            version: 1,
            month: "2026-08",
            final: false,
            computed_at_raw_ms: august(20, 3),
            spots: {
              "sihlcity-steps": { status: "ranked", verified_days: 2, rank: 2, tied_with: 0, legend: false },
            },
          };
          screenshotWindow.__PKSPOT_SCREENSHOT_TRAINING_LOG_ENTRIES__ = [
            {
              id: "visual-training-entry",
              owner_id: "visual-route-user",
              note: "Worked a smooth line from the ledge to the rails, then finished with precision practice. The flow finally started to feel natural.",
              visibility: "private",
              session_record_ids: ["visual-session-1"],
              session_summaries: [{ session_record_id: "visual-session-1", local_date: "2026-08-15", duration_minutes: 120, spot_count: 2 }],
              activity_at_raw_ms: august(15, 15),
              time_created_raw_ms: august(15, 17),
              time_updated_raw_ms: august(15, 17),
            },
            {
              id: "visual-training-entry-2",
              owner_id: "visual-route-user",
              note: "Evening session after work.",
              visibility: "private",
              session_record_ids: ["visual-session-2"],
              session_summaries: [{ session_record_id: "visual-session-2", local_date: "2026-08-12", duration_minutes: 60, spot_count: 1 }],
              activity_at_raw_ms: august(12, 16),
              time_created_raw_ms: august(12, 17),
              time_updated_raw_ms: august(12, 17),
            },
            {
              id: "visual-training-entry-3",
              owner_id: "visual-route-user",
              note: "A short technique reset.",
              visibility: "friends",
              session_record_ids: ["visual-session-3"],
              session_summaries: [{ session_record_id: "visual-session-3", local_date: "2026-08-04", duration_minutes: 60, spot_count: 1 }],
              activity_at_raw_ms: august(4, 18),
              time_created_raw_ms: august(4, 19),
              time_updated_raw_ms: august(4, 19),
            },
          ];
          if (unloggedCheckIn) {
            screenshotWindow.__PKSPOT_SCREENSHOT_TRAINING_LOG_ENTRIES__ = (screenshotWindow.__PKSPOT_SCREENSHOT_TRAINING_LOG_ENTRIES__ as { id: string }[]).filter(entry => entry.id !== 'visual-training-entry-2');
          }
          screenshotWindow.__PKSPOT_SCREENSHOT_RECOVERY_PAUSES__ = [
            {
              id: "visual-recovery-pause",
              owner_id: "visual-route-user",
              started_on: "2026-08-06",
              ended_on: "2026-08-10",
              reason: "injury",
              note: "A quiet reset before getting back to lines.",
              time_created_raw_ms: august(6, 9),
              time_updated_raw_ms: august(6, 9),
            },
          ];
        }
        if (liveEventFixture) {
          (
            window as typeof window & {
              __PKSPOT_SCREENSHOT_ATTENDED_EVENTS__?: unknown;
            }
          ).__PKSPOT_SCREENSHOT_ATTENDED_EVENTS__ = [
            {
              id: "visual-city-jam",
              slug: "visual-city-jam",
              name: "City Parkour Jam",
              published: true,
              visibility: "public",
              discoverability: { audience: "global" },
              venue_string: "Riverside Park",
              locality_string: "Basel, Switzerland",
              start: "2026-08-01T10:00:00.000Z",
              end: "2026-08-02T18:00:00.000Z",
              time_zone: "Europe/Zurich",
              attendance: { social: "rsvp", admission: "none" },
              program: {
                active_plan_id: "main",
                plans: [
                  {
                    id: "main",
                    label: "Main program",
                    kind: "main",
                    items: [
                      {
                        id: "welcome-jam",
                        title: "Welcome jam",
                        category: "jam",
                        start: "2026-08-01T10:00:00.000Z",
                        end: "2026-08-01T12:00:00.000Z",
                      },
                      {
                        id: "movement-workshop",
                        title: "Movement workshop",
                        category: "workshop",
                        start: "2026-08-01T12:30:00.000Z",
                        end: "2026-08-01T14:00:00.000Z",
                      },
                    ],
                  },
                ],
              },
            },
          ];
        }
        if (myEventsDialogFixture) {
          (window as typeof window & {__PKSPOT_SCREENSHOT_ATTENDED_EVENTS__?: unknown}).__PKSPOT_SCREENSHOT_ATTENDED_EVENTS__ = Array.from({length: 12}, (_, index) => ({
            id: `past-jam-${index}`, slug: `past-jam-${index}`, name: `Past community jam ${index + 1}`,
            published: true, visibility: "public", venue_string: "Riverside Park",
            start: "2026-08-01T10:00:00.000Z", end: "2026-08-01T18:00:00.000Z", time_zone: "Europe/Zurich",
          }));
        }
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
    {
      acceptedVersion: CURRENT_TERMS_VERSION,
      plannedSessionFixture: route.plannedSessionFixture,
      admin: route.admin === true,
      eventIndexFixture: route.eventIndexFixture === true,
      invalidEventFixture: route.invalidEventFixture === true,
      liveEventFixture: route.liveEventFixture === true,
      myEventsDialogFixture: route.myEventsDialogFixture === true,
      publicProfile: route.publicProfile === true,
      signedIn: route.signedIn === true,
      trainFixture: route.trainFixture === true,
      trainLiveEventFixture: route.trainLiveEventFixture === true,
      trainingLogFixture: route.trainingLogFixture === true,
      unloggedCheckIn: route.unloggedCheckIn === true,
      verifiedAdult: route.verifiedAdult === true,
    },
  );

  if (route.path === "/finances") {
    await page.addInitScript(() => {
      (window as typeof window & { __PKSPOT_SCREENSHOT_FINANCES__?: unknown }).__PKSPOT_SCREENSHOT_FINANCES__ = {
        settings: { notes: 'Synthetic visual fixture. No real financial records.', rates: null },
        entries: [
          { id: 'hosting', date: '2026-10-01', description: 'Web application hosting', partner: 'Example provider', kind: 'expense', category: 'infrastructure', status: 'settled', amount_chf_cents: 12500, notes: '' },
          { id: 'reimbursement', date: '2026-10-02', description: 'Hosting reimbursement', partner: 'Example supporter', kind: 'income', category: 'reimbursement', status: 'settled', amount_chf_cents: 7500, notes: '' },
          { id: 'funding', date: '2026-10-01', description: 'Founder contribution', partner: '', kind: 'founder', category: 'founder', status: 'settled', amount_chf_cents: 10000, notes: '' },
          { id: 'pending', date: '2026-10-15', description: 'Partner payment', partner: 'Example partner', kind: 'income', category: 'partnership', status: 'pending', amount_chf_cents: 20000, notes: 'Expected payment' },
          { id: 'ticket', date: '2026-08-01', description: 'Camp admission', partner: 'Example partner', kind: 'in_kind', category: 'partnership', status: 'settled', amount_chf_cents: null, notes: 'Provided in exchange for project services' },
        ],
      };
    });
  }

  await page.goto(`/de${route.path}`, { waitUntil: "domcontentloaded" });
  await page.addStyleTag({
    // The partner carousel uses requestAnimationFrame, so Playwright's CSS
    // animation disabling does not freeze its inline transform.
    content: ".grecaptcha-badge { visibility: hidden !important; } app-about-page .carousel-track { transform: none !important; }",
  });
  await page.waitForSelector("app-root", { state: "attached", timeout: 20_000 });

  if (route.expectedPath) {
    await expect.poll(() => new URL(page.url()).pathname).toMatch(route.expectedPath);
  }

  await expect
    .poll(async () => (await page.locator("body").innerText()).trim().length)
    .toBeGreaterThan(20);
  await page.waitForLoadState("load");
  await expect(page.locator("#app-splash-screen")).toHaveCount(0);
  await page.waitForTimeout(900);

  if (route.name === "event-plan-community-authoring") {
    await expect(page.locator("app-session-planner-page form")).toBeVisible();
  }

  if (route.assertFabAboveBottomNavigation) {
    const fabBounds = await page
      .locator(route.assertFabAboveBottomNavigation)
      .boundingBox();
    const navigationBounds = await page.locator("mat-toolbar").boundingBox();
    expect(fabBounds).not.toBeNull();
    expect(navigationBounds).not.toBeNull();
    if (fabBounds && navigationBounds) {
      expect(fabBounds.y + fabBounds.height + 8).toBeLessThanOrEqual(
        navigationBounds.y,
      );
    }
  }

  if (route.openFabMenu) {
    const launcher = page.locator("app-fab-menu .fab-menu__launcher");
    await expect(launcher).toBeVisible();
    await launcher.click();
    await expect(page.locator(".fab-menu__actions")).toBeVisible();
  }

  if (route.openNavigationFab) {
    const launcher = page.locator("#alainMenuButton .fab-menu__launcher");
    await launcher.click();
    const actions = page.locator("#alainMenuButton .fab-menu__actions");
    await expect(actions).toBeVisible();
    const bounds = await actions.boundingBox();
    expect(bounds!.y).toBeGreaterThan(60);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(route.viewport!.height);
    await actions.locator("button").last().scrollIntoViewIfNeeded();
    await expect(actions.locator("button").last()).toBeInViewport();
    await actions.evaluate((element) => { element.scrollTop = 0; });
  }

  if (route.openTrainWeatherDialog) {
    await page.locator("button.training-weather-button").click();
    const strip = page.locator("app-weather-forecast-dialog app-hourly-forecast-strip");
    await expect(strip).toBeVisible();
    await expect(strip.locator(".weather-hour")).toHaveCount(12);
    await expect(strip.locator(".precipitation-bar__amount")).toHaveCount(5);
  }
  if (route.openRecoveryPauseDialog) {
    await page.locator("#trainingLogFabMenu .fab-menu__launcher").click();
    await page
      .locator("#trainingLogFabMenu .fab-menu__action")
      .nth(1)
      .click();
    await expect(page.locator("app-recovery-pause-dialog")).toBeVisible();
  }

  if (route.openInvalidEventsDialog) {
    const reviewButton = page.locator(".warning-card button");
    await expect(reviewButton).toBeVisible();
    await page.evaluate(() => window.scrollTo(0, 0));
    await reviewButton.evaluate((button: HTMLButtonElement) => button.click());
    const dialog = page.locator("mat-dialog-container");
    await expect(dialog).toBeVisible();
    await expect(dialog.locator("app-event-discovery-card")).toHaveCount(3);
    await page.locator(".cdk-overlay-container").evaluate(async (container) => {
      await Promise.all(
        container
          .getAnimations({ subtree: true })
          .map((animation) => animation.finished.catch(() => undefined)),
      );
    });
  }

  if (route.name === "event-ownership-claim-inbox") {
    await expect(
      page.locator("app-event-ownership-claim-inbox mat-card"),
    ).toBeVisible();
    await expect(
      page.locator("mat-spinner:visible, mat-progress-spinner:visible"),
    ).toHaveCount(0);
  }

  if (route.name === "embedded-selection-event") {
    await expect(page.locator("app-embedded-results-page app-event-card")).toContainText("City Parkour Jam");
  }

  if (route.name === "embed") {
    await expect(page.locator("app-embed-page")).toContainText("City Parkour Jam");
    await expect(page.locator("app-embed-page iframe")).toHaveAttribute(
      "src",
      /visual-city-jam/u,
    );
  }

  if (route.eventMapLayout) {
    await waitForStableEventMap(page, route.eventMapLayout);
  }

  if (route.scrollToSelector) {
    await page.locator(route.scrollToSelector).first().scrollIntoViewIfNeeded();
  }

  if (route.openProfilePrivacySelect) {
    await page.locator(".profile-access-control mat-select").click();
    const options = page.locator("mat-option");
    await expect(options).toHaveCount(2);
    await expect(options.nth(0)).toContainText("Öffentlich");
    await expect(options.nth(1)).toContainText("Privat");
  }

  if (route.ticketLayout) {
    await assertTicketLayout(page, route.ticketLayout);
  }
}

async function assertTicketLayout(
  page: Page,
  layout: "desktop" | "mobile",
): Promise<void> {
  const list = page.locator("app-event-ticket-list .ticket-list");
  await expect(list).toBeVisible();

  const measurements = await list.evaluate((element) => {
    const rows = [...element.querySelectorAll<HTMLElement>(".ticket-row")];
    const firstPrice = rows[0]?.querySelector<HTMLElement>(".ticket-price");
    const firstPriceBlock = rows[0]?.querySelector<HTMLElement>(
      ".ticket-price-block",
    );
    const firstAction = rows[0]?.querySelector<HTMLElement>(".ticket-action");
    const priceRect = firstPrice?.getBoundingClientRect();
    const actionRect = firstAction?.getBoundingClientRect();
    return {
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
      rowOverflows: rows.some((row) => row.scrollWidth > row.clientWidth),
      priceTop: priceRect?.top,
      priceBlockWidth: firstPriceBlock?.getBoundingClientRect().width,
      actionTop: actionRect?.top,
      priceLeft: priceRect?.left,
      actionLeft: actionRect?.left,
    };
  });

  expect(measurements.scrollWidth).toBeLessThanOrEqual(measurements.clientWidth);
  expect(measurements.rowOverflows).toBe(false);
  expect(measurements.priceTop).toBeDefined();
  expect(measurements.actionTop).toBeDefined();

  if (layout === "mobile") {
    expect(measurements.priceTop!).toBeLessThan(measurements.actionTop!);
    expect(measurements.priceLeft!).toBeLessThan(measurements.actionLeft!);
    expect(measurements.priceBlockWidth).toBeLessThan(measurements.clientWidth);
  } else {
    expect(measurements.priceLeft!).toBeLessThan(measurements.actionLeft!);
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
  await expect.poll(async () => {
    const bounds = await mapSurface.boundingBox();
    const viewport = page.viewportSize();
    return !!bounds && !!viewport && bounds.height >= 150 &&
      bounds.y + bounds.height <= viewport.height + 1;
  }).toBe(true);

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

for (const viewport of [{width: 390, height: 844}, {width: 844, height: 390}]) {
  test(`My Events dialog respects safe areas ${viewport.width} @visual`, async ({page}) => {
    await prepareRoute(page, {name: "my-events-dialog-safe", path: "/events", viewport,
      signedIn: true, eventIndexFixture: true, myEventsDialogFixture: true, fixedTime: "2026-10-13T12:00:00Z"});
    await page.evaluate(() => {
      for (const [edge, value] of Object.entries({top: 44, bottom: 34, left: 20, right: 32}))
        document.documentElement.style.setProperty(`--safe-area-inset-${edge}`, `${value}px`);
    });
    await page.locator("app-my-events-panel .my-events-more button").click();
    const dialog = page.locator("app-my-events-dialog");
    await expect(dialog).toBeVisible();
    await page.locator(".my-events-safe-dialog").evaluate(async el => {
      await Promise.all(el.getAnimations({subtree: true}).map(animation => animation.finished.catch(() => undefined)));
    });
    const surface = page.locator(".my-events-safe-dialog .mat-mdc-dialog-surface");
    const bounds = (await surface.boundingBox())!;
    expect(bounds.y).toBeGreaterThanOrEqual(60);
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(viewport.height - 50);
    expect(bounds.x).toBeGreaterThanOrEqual(36);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width - 48);
    const headerY = (await dialog.locator(".dialog-header").boundingBox())!.y;
    const content = dialog.locator("mat-dialog-content");
    await content.evaluate(el => { el.scrollTop = el.scrollHeight; });
    expect(await content.evaluate(el => el.scrollTop)).toBeGreaterThan(0);
    expect((await dialog.locator(".dialog-header").boundingBox())!.y).toBe(headerY);
    await expect(dialog.locator("app-my-event-list a").last()).toBeInViewport();
    await expect(page).toHaveScreenshot(`my-events-safe-${viewport.width}.png`);
  });
}

test("recent check-in prompt has space above the card @visual", async ({page}) => {
  await prepareRoute(page, {name: "training-log-prompt-spacing", path: "/train/log", viewport: mobileViewport,
    signedIn: true, trainingLogFixture: true, unloggedCheckIn: true, fixedTime: "2026-08-20T12:00:00Z"});
  const prompt = page.locator("app-check-in-log-prompt .prompt");
  await expect(prompt).toBeVisible();
  const preceding = (await page.locator(".activity-details").boundingBox())!;
  const card = (await prompt.boundingBox())!;
  expect(card.y - preceding.y - preceding.height).toBeGreaterThanOrEqual(23);
});

test.describe("Mobile calendar selection @visual", () => {
  test.use({ hasTouch: true });

  test("selects later-month days and displays their events without jumping", async ({ page }) => {
    await prepareRoute(page, {
      name: "mobile-calendar-selection",
      path: "/events?view=calendar&month=2026-08&day=2026-08-01",
      viewport: mobileViewport,
      eventIndexFixture: true,
      fixedTime: "2026-07-20T12:00:00.000Z",
    });
    const calendar = page.locator("app-continuous-event-calendar");
    const grid = calendar.locator(".calendar-scroll");
    expect((await grid.boundingBox())!.height).toBeLessThanOrEqual(300);
    const day = calendar.locator('[data-day="2026-09-19"]');
    await day.scrollIntoViewIfNeeded();
    const before = await grid.evaluate(el => ({ grid: el.scrollTop, page: window.scrollY }));
    await day.tap();
    await expect(day).toHaveClass(/is-selected/);
    await expect(page).toHaveURL(/day=2026-09-19/);
    await expect(calendar.locator(".day-agenda")).toContainText("Movement Weekend");
    const after = await grid.evaluate(el => ({ grid: el.scrollTop, page: window.scrollY }));
    expect(after.grid).toBeCloseTo(before.grid, 0);
    expect(after.page).toBeCloseTo(before.page, 0);

    const emptyDay = calendar.locator('[data-day="2026-09-21"]');
    await emptyDay.tap();
    await expect(emptyDay).toHaveClass(/is-selected/);
    await expect(calendar.locator(".day-agenda .empty-day")).toBeVisible();
    await page.goBack();
    await expect(day).toHaveClass(/is-selected/);
    await expect(calendar.locator(".day-agenda")).toContainText("Movement Weekend");
  });
});

test.describe("Account top navigation @visual", () => {
  test.use({ hasTouch: true });

  for (const route of ["about", "support"]) {
    test(`opens ${route} without restarting the app`, async ({page}) => {
      await prepareRoute(page, {name: "account-navigation", path: "/account", viewport: mobileViewport});
      const app = await page.locator("app-root").elementHandle();
      const timeOrigin = await page.evaluate(() => performance.timeOrigin);
      const documents: string[] = [];
      page.on("request", request => {
        if (request.isNavigationRequest() && request.frame() === page.mainFrame()) documents.push(request.url());
      });
      for (const activation of ["tap", "non-mouse"] as const) {
        const control = page.locator(`.language-strip [routerlink="/${route}"]`);
        if (activation === "tap") await control.tap();
        else {
          // Non-mouse activations must not fall back to a native anchor load.
          await control.dispatchEvent("click", {button: -1, bubbles: true, cancelable: true});
        }
        await expect(page).toHaveURL(new RegExp(`/de/${route}$`));
        await expect(page.locator(`app-${route}-page`)).toBeVisible();
        expect(await app!.evaluate(el => el === document.querySelector("app-root"))).toBe(true);
        expect(await page.evaluate(() => performance.timeOrigin)).toBe(timeOrigin);
        await expect(page.locator("#app-splash-screen")).toHaveCount(0);
        expect(documents).toEqual([]);
        if (activation === "tap") await page.goBack();
      }
    });
  }
});

test("dialogs respect Duo side cutouts after rotation and with a keyboard @visual", async ({ page }) => {
  await prepareRoute(page, { name: "duo-training-dialog", path: "/train",
    viewport: { width: 466, height: 678 }, trainFixture: true, signedIn: true,
    trainingLogFixture: true, fixedTime: "2026-08-20T12:00:00Z" });
  await page.locator(".training-context-button").click();
  const surface = page.locator(".mat-mdc-dialog-surface");
  await expect(page.locator("app-train-context-dialog")).toBeVisible();
  for (const state of [
    { width: 466, height: 678, left: 0, right: 84, top: 0, bottom: 20, keyboard: 0 },
    { width: 678, height: 466, left: 84, right: 0, top: 24, bottom: 20, keyboard: 0 },
    { width: 466, height: 678, left: 0, right: 84, top: 0, bottom: 20, keyboard: 240 },
  ]) {
    await page.setViewportSize(state);
    // Browser viewport resizing does not emit the native orientation event.
    await page.evaluate(() => window.dispatchEvent(new Event("orientationchange")));
    await expect.poll(() => page.evaluate(() =>
      getComputedStyle(document.body).getPropertyValue("--keyboard-offset").trim(),
    )).toBe("0px");
    await page.evaluate(({left, right, top, bottom, keyboard}) => {
      for (const [edge, value] of Object.entries({left, right, top, bottom}))
        document.documentElement.style.setProperty(`--safe-area-inset-${edge}`, `${value}px`);
      for (const element of [document.documentElement, document.body]) {
        element.style.setProperty("--keyboard-offset", `${keyboard}px`);
        element.classList.toggle("keyboard-open", keyboard > 0);
      }
    }, state);
    await waitForResizeToSettle(surface);
    const bounds = (await surface.boundingBox())!;
    expect(bounds.x).toBeGreaterThanOrEqual(state.left + 16);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(state.width - state.right - 16);
    expect(bounds.y).toBeGreaterThanOrEqual(state.top + 16);
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(state.height - state.keyboard - state.bottom - 16);
    await expect(page).toHaveScreenshot(`duo-dialog-${state.width}-${state.keyboard}.png`);
  }
});

for (const viewport of [{width: 466, height: 678}, {width: 1040, height: 768}]) {
  test(`About background and carousel respect Duo layout ${viewport.width} @visual`, async ({page}) => {
    await prepareRoute(page, {name: "duo-about", path: "/about", viewport});
    await page.evaluate(() => {
      document.documentElement.style.setProperty("--safe-area-inset-right", "84px");
      document.documentElement.style.setProperty("--safe-area-inset-top", "24px");
    });
    const background = page.locator(".about-page-background");
    const box = (await background.boundingBox())!;
    expect(box.y).toBeCloseTo(0, 0);
    expect(box.x + box.width).toBeCloseTo(viewport.width, 0);
    const content = (await page.locator(".about-page").boundingBox())!;
    expect(content.x + content.width).toBeLessThanOrEqual(viewport.width - 84);
    await expect(page).toHaveScreenshot(`duo-about-${viewport.width}.png`);
    const carousel = page.locator(".carousel-container");
    await carousel.scrollIntoViewIfNeeded();
    const carouselBox = (await carousel.boundingBox())!;
    expect(carouselBox.x).toBeGreaterThanOrEqual(content.x);
    expect(carouselBox.x + carouselBox.width).toBeLessThanOrEqual(content.x + content.width);
    if (viewport.width > 768) {
      const rail = (await page.locator(".nav-rail").boundingBox())!;
      expect(carouselBox.x).toBeGreaterThanOrEqual(rail.x + rail.width);
    }
    await expect(page).toHaveScreenshot(`duo-carousel-${viewport.width}.png`);
  });
}
