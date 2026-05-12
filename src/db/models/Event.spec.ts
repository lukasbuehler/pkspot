import { describe, expect, it } from "vitest";
import { Event } from "./Event";
import { EventId, EventSchema } from "../schemas/EventSchema";

const baseEvent = {
  name: "Test Event",
  venue_string: "Test Venue",
  locality_string: "Test City",
  spot_ids: [],
  bounds: {
    north: 47,
    south: 46,
    east: 8,
    west: 7,
  },
} satisfies Partial<EventSchema>;

describe("Event", () => {
  it("parses Firestore timestamp-like dates with string seconds", () => {
    const event = new Event("event-1" as EventId, {
      ...baseEvent,
      start: { seconds: "1781431200", nanoseconds: "0" },
      end: { seconds: "1781517600", nanoseconds: "0" },
    } as EventSchema);

    expect(event.start.toISOString()).toBe("2026-06-14T10:00:00.000Z");
    expect(event.end.toISOString()).toBe("2026-06-15T10:00:00.000Z");
    expect(Number.isFinite(event.start.getTime())).toBe(true);
    expect(Number.isFinite(event.end.getTime())).toBe(true);
  });

  it("parses admin SDK timestamp-like dates", () => {
    const event = new Event("event-1" as EventId, {
      ...baseEvent,
      start: { _seconds: 1781431200, _nanoseconds: 123_000_000 },
      end: { _seconds: 1781517600, _nanoseconds: 0 },
    } as EventSchema);

    expect(event.start.toISOString()).toBe("2026-06-14T10:00:00.123Z");
    expect(event.end.toISOString()).toBe("2026-06-15T10:00:00.000Z");
  });

  it("exposes circle promo geometry for ranking overlapping promotions", () => {
    const event = new Event("event-1" as EventId, {
      ...baseEvent,
      start: "2026-06-14T10:00:00.000Z",
      end: "2026-06-15T10:00:00.000Z",
      promo_region: {
        center: { lat: 47.3769, lng: 8.5417 },
        radius_m: 25_000,
      },
    } as EventSchema);

    expect(event.promoCenter()).toEqual({ lat: 47.3769, lng: 8.5417 });
    expect(event.promoRadiusMeters()).toBe(25_000);
    expect(
      event.distanceFromPromoCenterMeters({ lat: 47.3769, lng: 8.5417 })
    ).toBe(0);
    expect(
      event.containsPromoPoint({ lat: 47.3769, lng: 8.5417 })
    ).toBe(true);
    expect(event.containsPromoPoint({ lat: 48.8566, lng: 2.3522 })).toBe(
      false
    );
  });

  it("derives bounds promo geometry for ranking overlapping promotions", () => {
    const event = new Event("event-1" as EventId, {
      ...baseEvent,
      start: "2026-06-14T10:00:00.000Z",
      end: "2026-06-15T10:00:00.000Z",
      promo_region: {
        bounds: {
          north: 47.7,
          south: 47.3,
          east: 8.0,
          west: 7.6,
        },
      },
    } as EventSchema);

    expect(event.promoCenter()).toEqual({ lat: 47.5, lng: 7.8 });
    expect(event.promoRadiusMeters()).toBeGreaterThan(20_000);
    expect(event.promoRadiusMeters()).toBeLessThan(35_000);
    expect(event.containsPromoPoint({ lat: 47.5, lng: 7.8 })).toBe(true);
    expect(event.containsPromoPoint({ lat: 46.9, lng: 7.8 })).toBe(false);
  });
});
