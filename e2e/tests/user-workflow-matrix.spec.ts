import { expect, test, type Page } from "@playwright/test";

type ShellMode = "rail" | "toolbar" | "menu";

interface WorkflowViewport {
  name: string;
  width: number;
  height: number;
  shell: ShellMode;
}

interface RouteCase {
  name: string;
  path: string;
  expectedPath?: RegExp;
}

const locale = "de";

const workflowViewports: WorkflowViewport[] = [
  { name: "desktop", width: 1280, height: 900, shell: "rail" },
  { name: "tablet", width: 800, height: 900, shell: "toolbar" },
  { name: "mobile tall", width: 390, height: 844, shell: "toolbar" },
  {
    name: "mobile short portrait",
    width: 390,
    height: 680,
    shell: "menu",
  },
  { name: "landscape short", width: 844, height: 390, shell: "menu" },
  { name: "desktop short", width: 1024, height: 480, shell: "menu" },
  {
    name: "desktop just above short-height threshold",
    width: 1024,
    height: 501,
    shell: "rail",
  },
  {
    name: "mobile just above compact portrait threshold",
    width: 390,
    height: 700,
    shell: "toolbar",
  },
];

const shellRoutes: RouteCase[] = [
  { name: "map", path: "/map", expectedPath: /\/de\/map$/u },
  { name: "events", path: "/events", expectedPath: /\/de\/events$/u },
  { name: "about", path: "/about", expectedPath: /\/de\/about$/u },
  { name: "account", path: "/account", expectedPath: /\/de\/account$/u },
  { name: "support", path: "/support", expectedPath: /\/de\/support$/u },
  {
    name: "terms",
    path: "/terms-of-service",
    expectedPath: /\/de\/terms-of-service$/u,
  },
];

const routeSmokeCases: RouteCase[] = [
  { name: "home redirects to map", path: "/", expectedPath: /\/de\/map$/u },
  { name: "map", path: "/map", expectedPath: /\/de\/map$/u },
  { name: "events", path: "/events", expectedPath: /\/de\/events$/u },
  {
    name: "static Swissjam event",
    path: "/events/swissjam25",
    expectedPath: /\/de\/events\/swissjam25$/u,
  },
  {
    name: "static Swissjam event map",
    path: "/events/swissjam25/map",
    expectedPath: /\/de\/events\/swissjam25\/map$/u,
  },
  { name: "about", path: "/about", expectedPath: /\/de\/about$/u },
  { name: "support", path: "/support", expectedPath: /\/de\/support$/u },
  { name: "contact", path: "/contact", expectedPath: /\/de\/contact$/u },
  {
    name: "terms of service",
    path: "/terms-of-service",
    expectedPath: /\/de\/terms-of-service$/u,
  },
  {
    name: "privacy policy",
    path: "/privacy-policy",
    expectedPath: /\/de\/privacy-policy$/u,
  },
  { name: "impressum", path: "/impressum", expectedPath: /\/de\/impressum$/u },
  { name: "account", path: "/account", expectedPath: /\/de\/account$/u },
  { name: "sign up", path: "/sign-up", expectedPath: /\/de\/sign-up$/u },
  {
    name: "forgot password",
    path: "/forgot-password",
    expectedPath: /\/de\/forgot-password$/u,
  },
  {
    name: "settings redirects signed-out users to account",
    path: "/settings",
    expectedPath: /\/de\/account$/u,
  },
  {
    name: "settings language tab redirects signed-out users to account",
    path: "/settings/language",
    expectedPath: /\/de\/account$/u,
  },
  { name: "embed builder", path: "/embed", expectedPath: /\/de\/embed$/u },
  {
    name: "embedded map",
    path: "/embedded/map",
    expectedPath: /\/de\/embedded\/map$/u,
  },
  {
    name: "embedded event",
    path: "/embedded/events/swissjam25",
    expectedPath: /\/de\/embedded\/events\/swissjam25$/u,
  },
  {
    name: "embedded event map",
    path: "/embedded/events/swissjam25/map",
    expectedPath: /\/de\/embedded\/events\/swissjam25\/map$/u,
  },
  {
    name: "leaderboard",
    path: "/leaderboard",
    expectedPath: /\/de\/leaderboard$/u,
  },
  {
    name: "auth action handler",
    path: "/__/auth/action?mode=resetPassword&oobCode=test-code&apiKey=fake",
    expectedPath: /\/de\/__\/auth\/action$/u,
  },
  {
    name: "direct spot URL",
    path: "/map/spots/imax",
    expectedPath: /\/de\/map\/spots\/imax$/u,
  },
  {
    name: "spot edit history URL falls back to spot for signed-out users",
    path: "/map/spots/imax/edits",
    expectedPath: /\/de\/map\/spots\/imax$/u,
  },
  {
    name: "spot challenges URL",
    path: "/map/spots/imax/c",
    expectedPath: /\/de\/map\/spots\/imax\/c$/u,
  },
  {
    name: "spot challenge detail URL",
    path: "/map/spots/imax/c/precision-jump",
    expectedPath: /\/de\/map\/spots\/imax\/c\/precision-jump$/u,
  },
  {
    name: "community landing on map",
    path: "/map/communities/zurich",
    expectedPath: /\/de\/map\/communities\/zurich$/u,
  },
  {
    name: "unknown route",
    path: "/this-route-does-not-exist",
    expectedPath: /\/de\/this-route-does-not-exist$/u,
  },
];

const redirectCases: RouteCase[] = [
  { name: "root", path: "/", expectedPath: /\/de\/map$/u },
  { name: "map spots index", path: "/map/spots", expectedPath: /\/de\/map$/u },
  {
    name: "legacy spot URL",
    path: "/map/imax",
    expectedPath: /\/de\/map\/spots\/imax$/u,
  },
  {
    name: "legacy spot edits URL",
    path: "/map/imax/edits",
    expectedPath: /\/de\/map\/spots\/imax\/edits$/u,
  },
  {
    name: "legacy spot challenges URL",
    path: "/map/imax/c",
    expectedPath: /\/de\/map\/spots\/imax\/c$/u,
  },
  {
    name: "legacy spot challenge URL",
    path: "/map/imax/c/precision-jump",
    expectedPath: /\/de\/map\/spots\/imax\/c\/precision-jump$/u,
  },
  {
    name: "legacy community URL",
    path: "/map/community/zurich",
    expectedPath: /\/de\/map\/communities\/zurich$/u,
  },
  {
    name: "legacy event on map URL",
    path: "/map/event/swissjam25",
    expectedPath: /\/de\/map\/events\/swissjam25$/u,
  },
  {
    name: "legacy Swissjam event URL",
    path: "/event/swissjam25",
    expectedPath: /\/de\/events\/swissjam25$/u,
  },
  {
    name: "short event URL",
    path: "/e/swissjam25",
    expectedPath: /\/de\/events\/swissjam25$/u,
  },
  {
    name: "short spot URL",
    path: "/s/imax",
    expectedPath: /\/de\/map\/spots\/imax$/u,
  },
  {
    name: "short terms URL",
    path: "/tos",
    expectedPath: /\/de\/terms-of-service$/u,
  },
  {
    name: "short privacy URL",
    path: "/pp",
    expectedPath: /\/de\/privacy-policy$/u,
  },
  {
    name: "sign-in keeps query on account",
    path: "/sign-in?redirect=%2Fmap&source=e2e",
    expectedPath: /\/de\/account$/u,
  },
  {
    name: "legacy embedded event URL",
    path: "/embedded/event/swissjam25?showHeader=false",
    expectedPath: /\/de\/embedded\/events\/swissjam25\/map$/u,
  },
];

const navTargets = [
  { name: "map", hrefSuffix: "/map", expectedPath: /\/de\/map$/u },
  { name: "events", hrefSuffix: "/events", expectedPath: /\/de\/events$/u },
  { name: "about", hrefSuffix: "/about", expectedPath: /\/de\/about$/u },
];

const mapSearchQueries = [
  "park",
  "IMAX",
  "Zurich",
  "Basel",
  "Swissjam",
  "water",
  "roof",
  "indoor",
];

const quickFilters = [
  { name: "parkour", query: "parkour", index: 0 },
  { name: "dry", query: "dry", index: 1 },
  { name: "indoor", query: "indoor", index: 2 },
  { name: "lighting", query: "lighting", index: 3 },
  { name: "water", query: "water", index: 4 },
];

const objectModes = [
  { name: "all", index: 0 },
  { name: "spots", index: 1 },
  { name: "events", index: 2 },
  { name: "communities", index: 3 },
];

test.describe("high-priority user workflow matrix", () => {
  test.describe.configure({ mode: "parallel" });

  test.beforeEach(({}, testInfo) => {
    test.skip(
      testInfo.project.name !== "chromium",
      "This file drives its own viewport matrix in Chromium.",
    );
  });

  for (const viewport of workflowViewports) {
    for (const route of shellRoutes) {
      test(`${viewport.name}: ${route.name} uses ${viewport.shell} navigation shell`, async ({
        page,
      }) => {
        await gotoWorkflow(page, route.path, viewport);
        await expectRoute(page, route.expectedPath);
        await expectShell(page, viewport.shell);
      });
    }
  }

  for (const route of routeSmokeCases) {
    test(`route renders: ${route.name}`, async ({ page }) => {
      await gotoWorkflow(page, route.path);
      await expectRoute(page, route.expectedPath);
      await expectAppRendered(page);
    });
  }

  for (const route of redirectCases) {
    test(`redirect preserves workflow: ${route.name}`, async ({ page }) => {
      await gotoWorkflow(page, route.path);
      await expectRoute(page, route.expectedPath);
      await expectAppRendered(page);
    });
  }

  for (const target of navTargets) {
    test(`desktop rail navigates to ${target.name}`, async ({ page }) => {
      await gotoWorkflow(page, "/about", workflowViewports[0]);

      await page.locator(`app-nav-rail a[href$="${target.hrefSuffix}"]`).click();

      await expectRoute(page, target.expectedPath);
      await expectShell(page, "rail");
    });
  }

  for (const target of navTargets.slice(0, 2)) {
    test(`mobile toolbar navigates to ${target.name}`, async ({ page }) => {
      await gotoWorkflow(page, "/about", workflowViewports[2]);

      await page.locator(`mat-toolbar a[href$="${target.hrefSuffix}"]`).click();

      await expectRoute(page, target.expectedPath);
      await expectShell(page, "toolbar");
    });

    test(`short-height menu navigates to ${target.name}`, async ({ page }) => {
      await gotoWorkflow(page, "/about", workflowViewports[3]);

      await openCompactMenu(page);
      await page
        .locator(`.cdk-overlay-container a[href$="${target.hrefSuffix}"]`)
        .click();

      await expectRoute(page, target.expectedPath);
      await expectShell(page, "menu");
    });
  }

  test("desktop rail exposes legal and policy links", async ({ page }) => {
    await gotoWorkflow(page, "/map", workflowViewports[0]);

    await expect(page.locator('app-nav-rail a[href$="/terms-of-service"]')).toBeVisible();
    await expect(page.locator('app-nav-rail a[href$="/privacy-policy"]')).toBeVisible();
    await expect(page.locator('app-nav-rail a[href$="/impressum"]')).toBeVisible();
  });

  test("mobile unauthenticated footer exposes legal and support links", async ({
    page,
  }) => {
    await gotoWorkflow(page, "/map", workflowViewports[2]);

    await expect(page.locator('.terms-footer a[href$="/terms-of-service"]')).toBeVisible();
    await expect(page.locator('.terms-footer a[href$="/privacy-policy"]')).toBeVisible();
    await expect(page.locator('.terms-footer a[href$="/support"]')).toBeVisible();
    await expect(page.locator('.terms-footer a[href$="/impressum"]')).toBeVisible();
  });

  for (const query of mapSearchQueries) {
    test(`map search accepts "${query}"`, async ({ page }) => {
      await gotoWorkflow(page, "/map");

      const input = page.locator("app-search-field input").first();
      await expect(input).toBeVisible({ timeout: 15_000 });
      await input.fill(query);

      await expect(input).toHaveValue(query);
      await expectAppRendered(page);
    });
  }

  for (const filter of quickFilters) {
    test(`map quick filter deep-link selects ${filter.name}`, async ({ page }) => {
      await gotoWorkflow(page, `/map?filter=${filter.query}`);

      await expect(page).toHaveURL(new RegExp(`filter=${filter.query}`, "u"));
      await expectSelectedQuickFilter(page, filter.index);
    });

    test(`map quick filter click applies ${filter.name}`, async ({ page }) => {
      await gotoWorkflow(page, "/map");

      await clickQuickFilter(page, filter.index);

      await expect(page).toHaveURL(new RegExp(`filter=${filter.query}`, "u"));
      await expectSelectedQuickFilter(page, filter.index);
    });

    test(`map quick filter clear removes ${filter.name}`, async ({ page }) => {
      await gotoWorkflow(page, `/map?filter=${filter.query}`);
      await page.locator("app-filter-chips-bar .clear-chip").first().click();

      await expect(page).not.toHaveURL(/filter=/u);
      await expectAppRendered(page);
    });
  }

  for (const mode of objectModes) {
    test(`map object panel switches to ${mode.name}`, async ({ page }) => {
      await gotoWorkflow(page, "/map", workflowViewports[0]);

      const objectModeList = page
        .locator('mat-chip-listbox[aria-label="Map object type"]')
        .first();
      await expect(objectModeList).toBeVisible({ timeout: 15_000 });
      await objectModeList.locator("mat-chip-option").nth(mode.index).click();

      await expectChipMarkedSelected(
        objectModeList.locator("mat-chip-option").nth(mode.index),
      );
      await expectAppRendered(page);
    });
  }

  test("map sidenav toggle closes and opens the desktop object panel", async ({
    page,
  }) => {
    await gotoWorkflow(page, "/map", workflowViewports[0]);

    const drawer = page.locator("mat-drawer.info-panel").first();
    const toggle = page.locator(".sidenav-toggle button").first();
    await expect(drawer).toBeVisible({ timeout: 15_000 });

    await toggle.click();
    await expect(drawer).not.toBeVisible();

    await toggle.click();
    await expect(drawer).toBeVisible();
  });

  test("map style control can be clicked without leaving the map", async ({
    page,
  }) => {
    await gotoWorkflow(page, "/map");

    const styleButton = page.locator("app-map-floating-controls button").first();
    await expect(styleButton).toBeVisible({ timeout: 20_000 });
    await styleButton.click();

    await expectRoute(page, /\/de\/map(?:\?.*)?$/u);
    await expectAppRendered(page);
  });

  test("map geolocation control can be clicked without leaving the map", async ({
    page,
  }) => {
    await gotoWorkflow(page, "/map");

    const buttons = page.locator("app-map-floating-controls button");
    await expect(buttons.nth(1)).toBeVisible({ timeout: 20_000 });
    await buttons.nth(1).click();

    await expectRoute(page, /\/de\/map(?:\?.*)?$/u);
    await expectAppRendered(page);
  });

  test("map surface accepts a click interaction", async ({ page }) => {
    await gotoWorkflow(page, "/map");

    const map = page.locator("app-google-map-2d").first();
    await expect(map).toBeVisible({ timeout: 20_000 });
    await clickLocatorCenter(page, map);

    await expectAppRendered(page);
  });

  test("map surface accepts a drag interaction", async ({ page }) => {
    await gotoWorkflow(page, "/map");

    const map = page.locator("app-google-map-2d").first();
    await expect(map).toBeVisible({ timeout: 20_000 });
    const box = await map.boundingBox();
    expect(box).not.toBeNull();
    if (!box) return;

    await page.mouse.move(box.x + box.width * 0.45, box.y + box.height * 0.45);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.55, box.y + box.height * 0.52, {
      steps: 8,
    });
    await page.mouse.up();

    await expectAppRendered(page);
  });

  test("add spot action stays hidden for signed-out users", async ({ page }) => {
    await gotoWorkflow(page, "/map");

    await expect(page.locator("#createSpotSpeedDial")).not.toBeVisible();
  });

  test("embedded map suppresses the normal app navigation", async ({ page }) => {
    await gotoWorkflow(page, "/embedded/map", workflowViewports[0]);

    await expect(page.locator("app-nav-rail")).not.toBeVisible();
    await expect(page.locator("mat-toolbar")).not.toBeVisible();
    await expect(page.locator("#alainMenuButton")).not.toBeVisible();
    await expect(page.locator(".embedded-promo")).toBeVisible();
  });

  test("embedded event suppresses the normal app navigation", async ({ page }) => {
    await gotoWorkflow(page, "/embedded/events/swissjam25", workflowViewports[2]);

    await expect(page.locator("app-nav-rail")).not.toBeVisible();
    await expect(page.locator("mat-toolbar")).not.toBeVisible();
    await expect(page.locator("#alainMenuButton")).not.toBeVisible();
    await expect(page.locator(".embedded-promo")).toBeVisible();
  });

  test("embedded event map suppresses the normal app navigation", async ({
    page,
  }) => {
    await gotoWorkflow(
      page,
      "/embedded/events/swissjam25/map",
      workflowViewports[3],
    );

    await expect(page.locator("app-nav-rail")).not.toBeVisible();
    await expect(page.locator("mat-toolbar")).not.toBeVisible();
    await expect(page.locator("#alainMenuButton")).not.toBeVisible();
    await expect(page.locator(".embedded-promo")).toBeVisible();
  });

  test("embedded promo opens the public app in a new tab", async ({ page }) => {
    await gotoWorkflow(page, "/embedded/map");

    const promoLink = page.locator('.embedded-promo a[href="https://pkspot.app"]').first();
    await expect(promoLink).toBeVisible();
    await expect(promoLink).toHaveAttribute("target", "_blank");
  });

  test("Swissjam event page exposes a map route link or map surface", async ({
    page,
  }) => {
    await gotoWorkflow(page, "/events/swissjam25");

    const mapAffordance = page
      .locator('a[href$="/events/swissjam25/map"], app-event-map-page, app-spot-map')
      .first();
    await expect(mapAffordance).toBeAttached({ timeout: 15_000 });
  });

  test("Swissjam event map renders a map-backed page", async ({ page }) => {
    await gotoWorkflow(page, "/events/swissjam25/map");

    await expect(page.locator("app-event-map-page, app-spot-map, app-google-map-2d").first()).toBeAttached({
      timeout: 20_000,
    });
    await expectAppRendered(page);
  });
});

async function gotoWorkflow(
  page: Page,
  path: string,
  viewport: WorkflowViewport = workflowViewports[0],
): Promise<void> {
  await page.setViewportSize({ width: viewport.width, height: viewport.height });
  await page.addInitScript(() => {
    localStorage.setItem("acceptedVersion", "5");
  });

  await page.goto(localizedPath(path), { waitUntil: "domcontentloaded" });
  await page.waitForSelector("app-root", { state: "attached", timeout: 20_000 });
  await page.waitForLoadState("load");
  await page.waitForTimeout(650);
}

function localizedPath(path: string): string {
  return `/${locale}${path.startsWith("/") ? path : `/${path}`}`;
}

async function expectRoute(page: Page, expectedPath?: RegExp): Promise<void> {
  if (!expectedPath) return;

  await expect.poll(() => new URL(page.url()).pathname).toMatch(expectedPath);
}

async function expectAppRendered(page: Page): Promise<void> {
  await expect(page.locator("app-root")).toBeAttached();
  await expect
    .poll(async () => (await page.locator("body").innerText()).trim().length)
    .toBeGreaterThan(20);
}

async function expectShell(page: Page, shell: ShellMode): Promise<void> {
  if (shell === "rail") {
    await expect(page.locator("app-nav-rail")).toBeVisible();
    await expect(page.locator("mat-toolbar")).not.toBeVisible();
    await expect(page.locator("#alainMenuButton")).not.toBeVisible();
    return;
  }

  if (shell === "toolbar") {
    await expect(page.locator("app-nav-rail")).not.toBeVisible();
    await expect(page.locator("mat-toolbar")).toBeVisible();
    await expect(page.locator("#alainMenuButton")).not.toBeVisible();
    return;
  }

  await expect(page.locator("app-nav-rail")).not.toBeVisible();
  await expect(page.locator("mat-toolbar")).not.toBeVisible();
  await expect(page.locator("#alainMenuButton")).toBeVisible();
}

async function openCompactMenu(page: Page): Promise<void> {
  await page.locator("#alainMenuButton").click();
  await expect(page.locator(".cdk-overlay-container .mat-mdc-menu-panel")).toBeVisible();
}

async function expectSelectedQuickFilter(
  page: Page,
  index: number,
): Promise<void> {
  const chip = page
    .locator("app-filter-chips-bar")
    .first()
    .locator("mat-chip-listbox")
    .first()
    .locator("mat-chip-option")
    .nth(index);

  await expectChipMarkedSelected(chip);
}

async function expectChipMarkedSelected(
  chip: ReturnType<Page["locator"]>,
): Promise<void> {
  await expect(chip).toHaveClass(
    /(?:mat-mdc-chip-selected|mdc-evolution-chip--selected|mdc-evolution-chip--selecting)/u,
  );
}

async function clickQuickFilter(page: Page, index: number): Promise<void> {
  const quickFilterList = page
    .locator("app-filter-chips-bar")
    .first()
    .locator("mat-chip-listbox")
    .first();
  await expect(quickFilterList).toBeVisible({ timeout: 15_000 });
  await quickFilterList.locator("mat-chip-option").nth(index).click();
}

async function clickLocatorCenter(page: Page, locator: ReturnType<Page["locator"]>): Promise<void> {
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  if (!box) return;

  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}
