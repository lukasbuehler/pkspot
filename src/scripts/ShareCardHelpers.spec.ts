import { describe, it, expect } from "vitest";
import { shareCardTargetFromPath } from "./ShareCardHelpers";
describe("share-card page targets", () => {
  it("resolves only supported public detail route shapes", () => {
    expect(shareCardTargetFromPath("/de/map/spots/example")).toEqual({kind:"spot",id:"example"});
    expect(shareCardTargetFromPath("/events/jam?x=1")).toEqual({kind:"event",id:"jam"});
    expect(shareCardTargetFromPath("/fr/map/communities/prague")).toEqual({kind:"community",id:"prague"});
    expect(shareCardTargetFromPath("/u/alex")).toEqual({kind:"profile",id:"alex"});
    for (const path of ["/events", "/events/create", "/events/session/id", "/u/alex/logs", "/map/spots/id/edits", "/profile", "/train/log"]) expect(shareCardTargetFromPath(path)).toBeNull();
  });
});
