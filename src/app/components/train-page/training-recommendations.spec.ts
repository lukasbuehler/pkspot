import type { SpotId } from "../../../db/schemas/SpotSchema";
import type { SpotPreviewData } from "../../../db/schemas/SpotPreviewData";
import type { EventDiscoveryItem } from "../../services/search.service";
import { describe, expect, it } from "vitest";
import {
  rankCommunityTrainingEvents,
  rankNearbyTrainingEvents,
  rankTrainingSpots,
} from "./training-recommendations";

const nowSeconds = 2_000_000_000;

describe("training recommendations", () => {
  it("puts a live event first and then favours the soonest nearby session", () => {
    const events = [
      event({ id: "later-but-close", startSeconds: nowSeconds + 7_200, location: [0, 0.01] }),
      event({ id: "soon-but-farther", startSeconds: nowSeconds + 3_600, location: [0, 0.2] }),
      event({ id: "live", startSeconds: nowSeconds - 600, endSeconds: nowSeconds + 600, location: [0, 0.1] }),
    ];

    const recommendations = rankNearbyTrainingEvents(events, nowSeconds, [0, 0]);

    expect(recommendations.radiusKm).toBe(25);
    expect(recommendations.items.map((item) => item.id)).toEqual([
      "live",
      "soon-but-farther",
      "later-but-close",
    ]);
  });

  it("does not distance-limit followed-community events", () => {
    const remoteEvent = event({
      id: "remote-community-event",
      location: [4, 4],
    });

    expect(
      rankCommunityTrainingEvents([remoteEvent], nowSeconds, [0, 0]),
    ).toEqual([expect.objectContaining({ id: "remote-community-event" })]);
  });

  it("lets proximity improve otherwise similar Spot choices without outranking a clearly better Spot", () => {
    const spots = [
      spot({ id: "excellent-far", rating: 10, location_raw: { lat: 0.22, lng: 0 } }),
      spot({ id: "good-near", rating: 8, location_raw: { lat: 0.01, lng: 0 } }),
      spot({ id: "similar-far", rating: 9, location_raw: { lat: 0.22, lng: 0 } }),
      spot({ id: "similar-near", rating: 8, location_raw: { lat: 0.01, lng: 0 } }),
    ];

    const ranked = rankTrainingSpots(spots, [0, 0], 25, 4);

    expect(ranked.map((item) => item.id)).toEqual([
      "excellent-far",
      "good-near",
      "similar-near",
      "similar-far",
    ]);
  });
});

function event(
  overrides: Partial<EventDiscoveryItem> & Pick<EventDiscoveryItem, "id">,
): EventDiscoveryItem {
  return {
    id: overrides.id,
    name: overrides.name ?? overrides.id,
    isSponsored: false,
    hasOrganization: false,
    hasVenueSpot: false,
    venueSpotCount: 0,
    startSeconds: overrides.startSeconds ?? nowSeconds + 3_600,
    endSeconds: overrides.endSeconds ?? nowSeconds + 7_200,
    lifecycleStatus: "planned",
    eventLinks: [],
    ticketOptions: [],
    spotIds: [],
    communityKeys: [],
    seriesIds: [],
    eventCategories: [],
    rsvpCounts: { going: 0, interested: 0, notgoing: 0, total: 0 },
    seriesRoles: [],
    qualifiesToKeys: [],
    requiredQualifierKeys: [],
    ...overrides,
  };
}

function spot(
  overrides: Partial<SpotPreviewData> & Pick<SpotPreviewData, "id">,
): SpotPreviewData {
  return {
    id: overrides.id as SpotId,
    name: overrides.id,
    locality: "Zurich",
    imageSrc: "",
    isIconic: false,
    ...overrides,
  };
}
