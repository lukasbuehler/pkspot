import { describe, expect, it } from "vitest";
import { GoogleMap2dComponent } from "./google-map-2d.component";

describe("event collision priority", () => {
  it("ranks events above every Spot pill (Spot priorities stop at 999)", () => {
    const event = { id: "event:jam", location: { lat: 0, lng: 0 }, priority: 300 };
    const map = {
      pointMarkers: () => [event],
      _isEventCollisionMarker: () => true,
      _isPointMarkerVisibleAtZoom: () => true,
    };
    const [candidate] = (
      GoogleMap2dComponent.prototype as unknown as {
        _getEventCollisionCandidates(this: unknown, zoom: number): { priority: number }[];
      }
    )._getEventCollisionCandidates.call(map, 12);
    expect(candidate.priority).toBe(1300);
    expect(candidate.priority).toBeGreaterThan(999);
  });
});
