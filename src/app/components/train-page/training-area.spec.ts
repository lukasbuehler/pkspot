import { describe, expect, it } from "vitest";
import type { CommunitySearchPreview } from "../../services/search.service";
import {
  resolveTrainingCenter,
  resolveTrainingSpotRadiusKm,
} from "./training-area";

const area = {
  id: "country:ch",
  communityKey: "country:ch",
  slug: "switzerland",
  displayName: "Switzerland",
  totalSpots: 100,
  boundsCenter: [46.8, 8.2],
  boundsRadiusM: 180_000,
} satisfies CommunitySearchPreview;

describe("training area", () => {
  it("gives the selected community precedence over device location", () => {
    expect(
      resolveTrainingCenter(area, { lat: 47.3769, lng: 8.5417 }),
    ).toEqual([46.8, 8.2]);
  });

  it("uses device location when no community is selected", () => {
    expect(
      resolveTrainingCenter(null, { lat: 47.3769, lng: 8.5417 }),
    ).toEqual([47.3769, 8.5417]);
  });

  it("uses the indexed community radius for spot discovery", () => {
    expect(resolveTrainingSpotRadiusKm(area)).toBe(180);
    expect(resolveTrainingSpotRadiusKm(null)).toBe(25);
  });
});
