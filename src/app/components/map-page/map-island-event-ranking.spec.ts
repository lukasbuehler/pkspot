import { describe, expect, it } from "vitest";
import { Event as PkEvent } from "../../../db/models/Event";
import { EventId, EventSchema } from "../../../db/schemas/EventSchema";
import { rankMapIslandEventsForPoint } from "./map-island-event-ranking";

function event(
  id: string,
  promoCenter: { lat: number; lng: number },
  promoRadiusM: number,
): PkEvent {
  return new PkEvent(id as EventId, {
    name: id,
    venue_string: "",
    locality_string: "",
    spot_ids: [],
    start: "2026-06-14T10:00:00.000Z",
    end: "2026-06-15T10:00:00.000Z",
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
  } as EventSchema);
}

describe("rankMapIslandEventsForPoint", () => {
  const now = new Date("2026-06-14T11:00:00.000Z");

  it("prefers Swiss Jam over WPF Camp for a Switzerland-centered viewport", () => {
    const swissJam = event("swissjam26", { lat: 46.8, lng: 8.2 }, 150_000);
    const wpfCamp = event("wpf-camp", { lat: 47.5596, lng: 7.5886 }, 150_000);

    const ranked = rankMapIslandEventsForPoint(
      [wpfCamp, swissJam],
      { lat: 46.8, lng: 8.2 },
      now,
    );

    expect(ranked.map((row) => row.event.id)).toEqual(["swissjam26", "wpf-camp"]);
    expect(ranked[0].normalizedCenterDistance).toBe(0);
    expect(ranked[1].distanceToPromoCenterM).toBeGreaterThan(96_000);
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
});
