import {describe, expect, it} from "vitest";
import {groupDuplicateSpotCandidates} from "./moderation-reports.service";

describe("groupDuplicateSpotCandidates", () => {
  it("groups bidirectional candidates once and keeps unnamed Spots usable", () => {
    const groups = groupDuplicateSpotCandidates([
      {
        id: "named",
        name: {en: "Named Spot"},
        duplicate_check: {
          status: "possible_duplicate",
          radius_m: 5,
          candidates: [
            {spot_id: "unnamed", distance_m: 0},
            {spot_id: "nearby", distance_m: 4.5, name: "Nearby Spot"},
          ],
        },
      },
      {
        id: "unnamed",
        name: {},
        duplicate_check: {
          status: "possible_duplicate",
          radius_m: 5,
          candidates: [{spot_id: "named", distance_m: 0, name: "Named Spot"}],
        },
      },
      {
        id: "nearby",
        name: {en: "Nearby Spot"},
        duplicate_check: {
          status: "possible_duplicate",
          radius_m: 5,
          candidates: [{spot_id: "named", distance_m: 4.5, name: "Named Spot"}],
        },
      },
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0].closestDistanceMeters).toBe(0);
    expect(groups[0].spots).toEqual([
      {id: "named", label: "Named Spot"},
      {id: "nearby", label: "Nearby Spot"},
      {id: "unnamed", label: "unnamed"},
    ]);
  });

  it("drops deleted or no-longer-flagged candidates from stale scan data", () => {
    const groups = groupDuplicateSpotCandidates([
      {
        id: "greenwood",
        name: {en: "Greenwood"},
        duplicate_check: {
          status: "possible_duplicate",
          radius_m: 5,
          candidates: [
            {spot_id: "deleted-copy", distance_m: 0, name: "Greenwood"},
          ],
        },
      },
    ]);

    expect(groups).toEqual([]);
  });
});
