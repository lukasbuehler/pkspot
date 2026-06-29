import { describe, expect, it } from "vitest";
import { routes } from "./app.routes";

describe("app routes", () => {
  const legacyCommunityPrefix = ["map", "community"].join("/");
  const legacyCommunityRoute = `${legacyCommunityPrefix}/:slug`;

  it("should register the flat community landing route before the generic map route", () => {
    const communityIndex = routes.findIndex(
      (route) => route.path === "map/communities/:slug"
    );
    const mapIndex = routes.findIndex((route) => route.path === "map");

    expect(communityIndex).toBeGreaterThanOrEqual(0);
    expect(mapIndex).toBeGreaterThanOrEqual(0);
    expect(communityIndex).toBeLessThan(mapIndex);
  });

  it("should only register canonical spot child routes under the map route", () => {
    const mapRoute = routes.find((route) => route.path === "map");
    const spotChildIndex = mapRoute?.children?.findIndex(
      (route) => route.path === "spots/:spot"
    );
    const genericSpotChildIndex = mapRoute?.children?.findIndex(
      (route) => route.path === ":spot"
    );
    const legacyRedirectIndex = routes.findIndex(
      (route) => route.path === "map/:spot"
    );
    const mapIndex = routes.findIndex((route) => route.path === "map");

    expect(spotChildIndex).toBeGreaterThanOrEqual(0);
    expect(genericSpotChildIndex).toBe(-1);
    expect(legacyRedirectIndex).toBeGreaterThanOrEqual(0);
    expect(legacyRedirectIndex).toBeLessThan(mapIndex);
  });

  it("should redirect the singular map event route before the generic map route", () => {
    const eventIndex = routes.findIndex(
      (route) => route.path === "map/events/:eventId"
    );
    const legacyEventIndex = routes.findIndex(
      (route) => route.path === "map/event/:eventId"
    );
    const mapIndex = routes.findIndex((route) => route.path === "map");

    expect(eventIndex).toBeGreaterThanOrEqual(0);
    expect(legacyEventIndex).toBeGreaterThanOrEqual(0);
    expect(legacyEventIndex).toBeLessThan(mapIndex);
    expect(typeof routes[legacyEventIndex].redirectTo).toBe("function");
    expect(
      getRedirectTarget(routes[legacyEventIndex], {
        params: { eventId: "swissjam25" },
      })
    ).toBe("/map/events/swissjam25");
  });

  it("should register organization pages", () => {
    const organizationRoute = routes.find(
      (route) => route.path === "organizations/:slugOrId"
    );

    expect(organizationRoute).toBeDefined();
    expect(organizationRoute?.data?.["routeName"]).toBe("Organization");
  });

  it("should keep organization admin and review boilerplate hidden from navigation", () => {
    const hiddenOrganizationRoutes = routes.filter((route) =>
      ["organization-admin", "organization-reviews"].includes(route.path ?? "")
    );

    expect(hiddenOrganizationRoutes.map((route) => route.path).sort()).toEqual([
      "organization-admin",
      "organization-reviews",
    ]);
    expect(hiddenOrganizationRoutes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "organization-admin",
          data: expect.objectContaining({
            routeName: "Organization Admin",
            discoverable: false,
          }),
        }),
        expect.objectContaining({
          path: "organization-reviews",
          data: expect.objectContaining({
            routeName: "Organization Reviews",
            discoverable: false,
          }),
        }),
      ])
    );
  });

  it("should expose activity only under the moderation section", () => {
    const publicActivityRoute = routes.find((route) => route.path === "activity");
    const moderationActivityRoute = routes.find(
      (route) => route.path === "moderation/activity"
    );

    expect(publicActivityRoute).toBeUndefined();
    expect(moderationActivityRoute).toBeDefined();
    expect(moderationActivityRoute?.data).toEqual(
      expect.objectContaining({
        routeName: "Moderation Activity",
        discoverable: false,
      })
    );
  });

  it("should register the contact page as an acceptance-free static route", () => {
    const contactRoute = routes.find((route) => route.path === "contact");

    expect(contactRoute).toBeDefined();
    expect(contactRoute?.data?.["routeName"]).toBe("Contact");
    expect(contactRoute?.data?.["acceptanceFree"]).toBe(true);
  });

  it("should register event map routes before generic event info routes", () => {
    const publicMapIndex = routes.findIndex(
      (route) => route.path === "events/:slug/map"
    );
    const publicInfoIndex = routes.findIndex(
      (route) => route.path === "events/:slug"
    );
    const embeddedMapIndex = routes.findIndex(
      (route) => route.path === "embedded/events/:eventID/map"
    );
    const embeddedInfoIndex = routes.findIndex(
      (route) => route.path === "embedded/events/:eventID"
    );

    expect(publicMapIndex).toBeGreaterThanOrEqual(0);
    expect(publicInfoIndex).toBeGreaterThanOrEqual(0);
    expect(publicMapIndex).toBeLessThan(publicInfoIndex);
    expect(embeddedMapIndex).toBeGreaterThanOrEqual(0);
    expect(embeddedInfoIndex).toBeGreaterThanOrEqual(0);
    expect(embeddedMapIndex).toBeLessThan(embeddedInfoIndex);
  });

  it("should redirect legacy embedded event URLs to the embedded event map", () => {
    const legacy = routes.find((route) => route.path === "embedded/event/:eventID");
    expect(legacy).toBeDefined();
    expect(typeof legacy?.redirectTo).toBe("function");

    const redirect = legacy!.redirectTo as (route: {
      params: Record<string, string>;
      queryParams: Record<string, string>;
    }) => string;
    expect(
      redirect({
        params: { eventID: "swissjam25" },
        queryParams: { showHeader: "false" },
      })
    ).toBe("/embedded/events/swissjam25/map?showHeader=false");
  });

  it("should redirect the legacy singular community route to the plural form via a function (string form is unsafe with locale base href)", () => {
    const canonical = routes.find(
      (route) => route.path === "map/communities/:slug"
    );
    const legacy = routes.find((route) => route.path === legacyCommunityRoute);

    expect(canonical).toBeDefined();
    expect(legacy).toBeDefined();
    expect(legacy?.pathMatch).toBe("full");
    expect(typeof legacy?.redirectTo).toBe("function");

    const redirect = legacy!.redirectTo as (route: {
      params: Record<string, string>;
    }) => string;
    expect(redirect({ params: { slug: "zuerich" } })).toBe(
      "/map/communities/zuerich"
    );
  });

  it("should order the legacy singular community redirect before the generic map route", () => {
    const legacyIndex = routes.findIndex(
      (route) => route.path === legacyCommunityRoute
    );
    const mapIndex = routes.findIndex((route) => route.path === "map");
    expect(legacyIndex).toBeGreaterThanOrEqual(0);
    expect(legacyIndex).toBeLessThan(mapIndex);
  });

  it("should use function redirects so localized base href does not duplicate URL segments", () => {
    const redirectRoutes = routes.filter((route) => route.redirectTo);

    expect(redirectRoutes.length).toBeGreaterThan(0);
    expect(
      redirectRoutes.filter((route) => typeof route.redirectTo === "string")
    ).toEqual([]);

    expect(
      getRedirectTarget(findRoute("map/:spot/edits"), {
        params: { spot: "josefhalle" },
      })
    ).toBe("/map/spots/josefhalle/edits");
    expect(
      getRedirectTarget(findRoute("map/:spot/c/:challenge"), {
        params: { spot: "josefhalle", challenge: "cat-pass" },
      })
    ).toBe("/map/spots/josefhalle/c/cat-pass");
    expect(
      getRedirectTarget(findRoute("e/:slug"), {
        params: { slug: "swissjam25" },
      })
    ).toBe("/events/swissjam25");
    expect(getRedirectTarget(findRoute("tos"))).toBe("/terms-of-service");
    expect(getRedirectTarget(findRoute("pp"))).toBe("/privacy-policy");
  });
});

function findRoute(path: string) {
  const route = routes.find((candidate) => candidate.path === path);
  if (!route) {
    throw new Error(`Route not found: ${path}`);
  }
  return route;
}

function getRedirectTarget(
  route: { redirectTo?: unknown },
  routeSnapshot: {
    params?: Record<string, string>;
    queryParams?: Record<string, string>;
  } = {}
): string {
  if (typeof route.redirectTo !== "function") {
    throw new Error("Route does not use a function redirect.");
  }

  return route.redirectTo({
    params: {},
    queryParams: {},
    ...routeSnapshot,
  } as never) as string;
}
