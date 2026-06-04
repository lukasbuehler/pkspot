import { describe, expect, it } from "vitest";
import { filterEventSpotCollisions } from "./map-marker-collision-filter";
import type {
  MapMarkerCollisionCandidate,
} from "./map-marker-collision-filter";

const event = (
  id: string,
  priority: number,
  location: google.maps.LatLngLiteral = { lat: 47, lng: 8 },
): MapMarkerCollisionCandidate => ({
  id,
  kind: "event",
  location,
  priority,
  widthPx: 48,
  heightPx: 48,
  anchor: "center",
});

const spot = (
  id: string,
  priority: number,
  location: google.maps.LatLngLiteral = { lat: 47, lng: 8 },
): MapMarkerCollisionCandidate => ({
  id,
  kind: "spot",
  location,
  priority,
  widthPx: 124,
  heightPx: 52,
  anchor: "bottom-center",
});

const community = (
  id: string,
  location: google.maps.LatLngLiteral = { lat: 47, lng: 8 },
): MapMarkerCollisionCandidate => ({
  id,
  kind: "community",
  location,
  priority: 40,
  widthPx: 10,
  heightPx: 10,
  anchor: "center",
});

describe("filterEventSpotCollisions", () => {
  it("keeps a higher-priority event over an overlapping spot", () => {
    const layout = filterEventSpotCollisions(
      [spot("low-spot", 100), event("event", 250)],
      14,
    );

    expect(layout.hiddenEventIds).toEqual(new Set());
    expect(layout.hiddenSpotIds).toEqual(new Set(["low-spot"]));
    expect(layout.hiddenCommunityIds).toEqual(new Set());
  });

  it("keeps a higher-priority spot over an overlapping event", () => {
    const layout = filterEventSpotCollisions(
      [spot("iconic-spot", 600), event("event", 250)],
      14,
    );

    expect(layout.hiddenEventIds).toEqual(new Set(["event"]));
    expect(layout.hiddenSpotIds).toEqual(new Set());
    expect(layout.hiddenCommunityIds).toEqual(new Set());
  });

  it("lets events win priority ties with spots", () => {
    const layout = filterEventSpotCollisions(
      [spot("spot", 250), event("event", 250)],
      14,
    );

    expect(layout.hiddenEventIds).toEqual(new Set());
    expect(layout.hiddenSpotIds).toEqual(new Set(["spot"]));
    expect(layout.hiddenCommunityIds).toEqual(new Set());
  });

  it("keeps both markers when they have enough screen-space separation", () => {
    const layout = filterEventSpotCollisions(
      [spot("spot", 100), event("event", 250, { lat: 47, lng: 8.1 })],
      14,
    );

    expect(layout.hiddenEventIds).toEqual(new Set());
    expect(layout.hiddenSpotIds).toEqual(new Set());
    expect(layout.hiddenCommunityIds).toEqual(new Set());
  });

  it("keeps only the strongest spot in an overlapping spot cluster", () => {
    const layout = filterEventSpotCollisions(
      [
        spot("weak-spot", 150),
        spot("medium-spot", 300),
        spot("strong-spot", 500),
      ],
      14,
    );

    expect(layout.hiddenEventIds).toEqual(new Set());
    expect(layout.hiddenSpotIds).toEqual(
      new Set(["medium-spot", "weak-spot"]),
    );
    expect(layout.hiddenCommunityIds).toEqual(new Set());
  });

  it("does not hide alternate marker candidates for the same spot", () => {
    const layout = filterEventSpotCollisions(
      [spot("spot", 500), spot("spot", 100)],
      14,
    );

    expect(layout.hiddenEventIds).toEqual(new Set());
    expect(layout.hiddenSpotIds).toEqual(new Set());
    expect(layout.hiddenCommunityIds).toEqual(new Set());
  });

  it("hides overlapping communities behind spots and events", () => {
    const layout = filterEventSpotCollisions(
      [community("community"), spot("spot", 500), event("event", 600)],
      14,
    );

    expect(layout.hiddenEventIds).toEqual(new Set());
    expect(layout.hiddenSpotIds).toEqual(new Set(["spot"]));
    expect(layout.hiddenCommunityIds).toEqual(new Set(["community"]));
  });
});
