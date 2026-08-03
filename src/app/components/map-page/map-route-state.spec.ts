import { describe, expect, it } from "vitest";
import { parseMapSpotRouteState } from "./map-route-state";

describe("parseMapSpotRouteState", () => {
  it.each([
    ["/map/spots/josefhalle", "josefhalle"],
    ["/map/josefhalle", "josefhalle"],
    ["/map/spots/encoded%20spot?filter=parkour#details", "encoded spot"],
  ])("parses spot routes from %s", (url, spotIdOrSlug) => {
    expect(parseMapSpotRouteState(url)).toEqual({
      spotIdOrSlug,
      showChallenges: false,
      challengeId: null,
      showEditHistory: false,
    });
  });

  it("parses a challenge list route", () => {
    expect(parseMapSpotRouteState("/map/spots/josefhalle/c")).toEqual({
      spotIdOrSlug: "josefhalle",
      showChallenges: true,
      challengeId: null,
      showEditHistory: false,
    });
  });

  it("parses a selected challenge route", () => {
    expect(
      parseMapSpotRouteState("/map/spots/josefhalle/c/running%20precision"),
    ).toEqual({
      spotIdOrSlug: "josefhalle",
      showChallenges: true,
      challengeId: "running precision",
      showEditHistory: false,
    });
  });

  it("parses spot edit history routes", () => {
    expect(parseMapSpotRouteState("/map/spots/josefhalle/edits")).toEqual({
      spotIdOrSlug: "josefhalle",
      showChallenges: false,
      challengeId: null,
      showEditHistory: true,
    });
  });

  it.each([
    "",
    "/map",
    "/events/swissjam25",
    "/map/events/swissjam25",
    "/map/communities/zuerich",
  ])("returns empty spot state for %s", (url) => {
    expect(parseMapSpotRouteState(url)).toEqual({
      spotIdOrSlug: null,
      showChallenges: false,
      challengeId: null,
      showEditHistory: false,
    });
  });
});
