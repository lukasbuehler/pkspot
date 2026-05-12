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
    expect(routes[legacyEventIndex].redirectTo).toBe("map/events/:eventId");
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
});
