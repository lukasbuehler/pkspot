import { describe, expect, it } from "vitest";
import { Event as PkEvent } from "../../../db/models/Event";
import { EventId, EventSchema } from "../../../db/schemas/EventSchema";
import {
  getMapEventMarkerPriority,
  rankMapPanelEvents,
  rankMapIslandEventsForPoint,
  rankMapIslandEventsForViewport,
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
      {
        promo_region: undefined,
        promo_starts_at: undefined,
      },
    );

    expect(getMapEventMarkerPriority(farEvent, now)).toBe(250);
  });

  it("lets active promo venue events overtake five-star spots", () => {
    const promotedVenueEvent = event(
      "wpf-camp",
      { lat: 47.5596, lng: 7.5886 },
      150_000,
      "2026-07-16T10:00:00.000Z",
      "2026-07-19T10:00:00.000Z",
      {
        has_organization: true,
        has_venue_spot: true,
        venue_spot_count: 1,
      },
    );

    expect(
      getMapEventMarkerPriority(
        promotedVenueEvent,
        new Date("2026-06-01T10:00:00.000Z"),
      ),
    ).toBeGreaterThan(500);
  });

  it("does not give sponsored disclosure an extra marker priority boost", () => {
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

    expect(getMapEventMarkerPriority(liveEvent, now)).toBe(685);
  });

  it("sorts an upcoming promoted event before a normal event one week earlier in the map panel", () => {
    const normalEvent = event(
      "british-parkour-championships",
      { lat: 52.5, lng: -1.9 },
      150_000,
      "2026-08-01T10:00:00.000Z",
      "2026-08-02T18:00:00.000Z",
      {
        promo_region: undefined,
        promo_starts_at: undefined,
      },
    );
    const promotedEvent = event(
      "wpf-camp",
      { lat: 47.5596, lng: 7.5886 },
      150_000,
      "2026-08-08T10:00:00.000Z",
      "2026-08-09T18:00:00.000Z",
      {
        is_promoted: true,
        promo_starts_at: "2026-06-01T10:00:00.000Z",
      },
    );

    expect(getMapEventMarkerPriority(promotedEvent, now)).toBeGreaterThan(
      getMapEventMarkerPriority(normalEvent, now),
    );
    expect(rankMapPanelEvents([normalEvent, promotedEvent], now)[0].id).toBe(
      "wpf-camp",
    );
  });

  it("does not give the map panel promotion boost before the promotion starts", () => {
    const normalEvent = event(
      "british-parkour-championships",
      { lat: 52.5, lng: -1.9 },
      150_000,
      "2026-08-01T10:00:00.000Z",
      "2026-08-02T18:00:00.000Z",
      {
        promo_region: undefined,
        promo_starts_at: undefined,
      },
    );
    const futurePromotion = event(
      "swissjam26",
      { lat: 46.8, lng: 8.2 },
      150_000,
      "2026-08-08T10:00:00.000Z",
      "2026-08-09T18:00:00.000Z",
      {
        is_promoted: true,
        promo_starts_at: "2026-08-05T10:00:00.000Z",
      },
    );

    expect(futurePromotion.isPromoted).toBe(true);
    expect(futurePromotion.isPromotable(now)).toBe(false);
    expect(getMapEventMarkerPriority(futurePromotion, now)).toBeLessThan(
      getMapEventMarkerPriority(normalEvent, now),
    );
    expect(rankMapPanelEvents([futurePromotion, normalEvent], now)[0].id).toBe(
      "british-parkour-championships",
    );
  });
});

describe("rankMapIslandEventsForViewport", () => {
  const now = new Date("2026-06-14T11:00:00.000Z");

  it("includes promos whose radius intersects the viewport edge", () => {
    const edgePromo = event("edge-promo", { lat: 47, lng: 8.2 }, 16_000);
    const viewport = {
      north: 47.05,
      south: 46.95,
      east: 8,
      west: 7.8,
    };

    expect(
      rankMapIslandEventsForPoint(
        [edgePromo],
        { lat: 47, lng: 7.9 },
        now,
      ),
    ).toEqual([]);
    expect(
      rankMapIslandEventsForViewport([edgePromo], viewport, now)[0]?.event.id,
    ).toBe("edge-promo");
  });
});
