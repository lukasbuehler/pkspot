import { describe, expect, it } from "vitest";
import { routes } from "./app.routes";

describe("app routes", () => {
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
});
