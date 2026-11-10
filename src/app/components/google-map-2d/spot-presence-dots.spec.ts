import { describe, expect, it } from "vitest";
import { GoogleMap2dComponent } from "./google-map-2d.component";

type Map2d = GoogleMap2dComponent & Record<string, unknown>;

describe("Spot presence dots", () => {
  const shown = { id: "a", name: "Shown pill", location: { latitude: 1, longitude: 2 } };
  const hidden = { id: "b", name: "Hidden pill", location: { latitude: 3, longitude: 4 } };
  const regular = {
    id: "c",
    name: () => "Hidden marker",
    location: () => ({ lat: 5, lng: 6 }),
  };

  function map(options: { showAll?: boolean; presence?: unknown[] } = {}) {
    const layout = { hiddenSpotIds: new Set(["spot:b", "spot:c"]) };
    // The real getters return cached arrays, so the fakes keep theirs stable.
    const previews = [shown, hidden];
    const regularSpots = [regular];
    const presence = options.presence ?? [];
    return {
      spotPresence: () => presence,
      showAllHighlightedSpotPins: () => options.showAll ?? false,
      _getVisibleHighlightedSpotPreviews: () => previews,
      _getVisibleRegularSpotMarkers: () => regularSpots,
      _getMarkerCollisionLayout: () => layout,
      _getSpotPreviewCollisionId: (spot: { id: string }) => `spot:${spot.id}`,
      _getSpotModelCollisionId: (spot: { id: string }) => `spot:${spot.id}`,
      _spotPresenceDotsCache: null,
    } as unknown as Map2d;
  }

  const dots = (target: Map2d) => GoogleMap2dComponent.prototype.getSpotPresenceDots.call(target);

  it("adds a dot only for Spots whose pill or marker lost the collision", () => {
    const result = dots(map());
    expect(result.map((dot) => [dot.id, dot.label, dot.location])).toEqual([
      ["spot:b", "Hidden pill", { lat: 3, lng: 4 }],
      ["spot:c", "Hidden marker", { lat: 5, lng: 6 }],
    ]);
    expect(result[0].spot).toBe(hidden);
  });

  it("adds presence points only for Spots without a visible pill or marker", () => {
    const extra = { id: "d", name: "Presence only", location: { latitude: 7, longitude: 8 } };
    const result = dots(map({ presence: [shown, hidden, extra] }));
    expect(result.map((dot) => dot.id)).toEqual(["spot:b", "spot:c", "spot:d"]);
    expect(result[2].location).toEqual({ lat: 7, lng: 8 });
  });

  it("returns the same array while nothing changed", () => {
    const target = map();
    expect(dots(target)).toBe(dots(target));
  });

  it("shows no dots when every pin is shown anyway", () => {
    expect(dots(map({ showAll: true }))).toEqual([]);
  });
});
