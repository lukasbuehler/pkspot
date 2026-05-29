import { describe, expect, it } from "vitest";
import { Event as PkEvent } from "../../../db/models/Event";
import { EventId, EventSchema } from "../../../db/schemas/EventSchema";
import {
  getMapEventMarkerPriority,
  rankMapIslandEventsForPoint,
} from "./map-island-event-ranking";

function event(
  id: string,
  promoCenter: { lat: number; lng: number },
  promoRadiusM: number,
  start: string = "2026-06-14T10:00:00.000Z",
  end: string = "2026-06-15T10:00:00.000Z",
  overrides: Partial<EventSchema> = {},
): PkEvent {
  return new PkEvent(id as EventId, {
    name: id,
    venue_string: "",
    locality_string: "",
    spot_ids: [],
    start,
    end,
    promo_starts_at: "2026-06-01T10:00:00.000Z",
    bounds: {
      north: promoCenter.lat,
      south: promoCenter.lat,
      east: promoCenter.lng,
      west: promoCenter.lng,
    },
    promo_region: {
      center: promoCenter,
      radius_m: promoRadiusM,
    },
    ...overrides,
  } as EventSchema);
}

describe("rankMapIslandEventsForPoint", () => {
  const now = new Date("2026-06-14T11:00:00.000Z");

  it("prefers the earlier event before viewport centrality", () => {
    const swissJam = event(
      "swissjam26",
      { lat: 46.8, lng: 8.2 },
      150_000,
      "2026-06-18T10:00:00.000Z",
      "2026-06-21T10:00:00.000Z",
    );
    const wpfCamp = event(
      "wpf-camp",
      { lat: 47.5596, lng: 7.5886 },
      150_000,
      "2026-06-16T10:00:00.000Z",
      "2026-06-17T10:00:00.000Z",
    );

    const ranked = rankMapIslandEventsForPoint(
      [wpfCamp, swissJam],
      { lat: 46.8, lng: 8.2 },
      now,
    );

    expect(ranked.map((row) => row.event.id)).toEqual(["wpf-camp", "swissjam26"]);
    expect(ranked[0].distanceToPromoCenterM).toBeGreaterThan(96_000);
    expect(ranked[1].normalizedCenterDistance).toBe(0);
  });

  it("prefers the more specific region when candidates are equally central", () => {
    const localJam = event("local-jam", { lat: 46.8, lng: 8.2 }, 25_000);
    const nationalPromo = event("national-promo", { lat: 46.8, lng: 8.2 }, 150_000);

    const ranked = rankMapIslandEventsForPoint(
      [nationalPromo, localJam],
      { lat: 46.8, lng: 8.2 },
      now,
    );

    expect(ranked.map((row) => row.event.id)).toEqual(["local-jam", "national-promo"]);
  });

  it("increases marker priority as an event approaches", () => {
    const earlier = event(
      "wpf-camp",
      { lat: 47.5596, lng: 7.5886 },
      150_000,
      "2026-06-16T10:00:00.000Z",
      "2026-06-17T10:00:00.000Z",
    );
    const later = event(
      "swissjam26",
      { lat: 46.8, lng: 8.2 },
      150_000,
      "2026-06-18T10:00:00.000Z",
      "2026-06-21T10:00:00.000Z",
    );

    expect(getMapEventMarkerPriority(earlier, now)).toBeGreaterThan(
      getMapEventMarkerPriority(later, now),
    );
  });

  it("keeps far future normal events below strong spots", () => {
    const farEvent = event(
      "far-jam",
      { lat: 47.5596, lng: 7.5886 },
      150_000,
      "2026-12-26T10:00:00.000Z",
      "2026-12-26T22:00:00.000Z",
    );

    expect(getMapEventMarkerPriority(farEvent, now)).toBe(250);
  });

  it("lets active sponsored venue events overtake iconic five-star spots", () => {
    const liveEvent = event(
      "live-jam",
      { lat: 47.5596, lng: 7.5886 },
      150_000,
      "2026-06-14T10:00:00.000Z",
      "2026-06-14T22:00:00.000Z",
      {
        is_sponsored: true,
        has_organization: true,
        has_venue_spot: true,
        venue_spot_count: 1,
      },
    );

    expect(getMapEventMarkerPriority(liveEvent, now)).toBe(640);
  });
});
