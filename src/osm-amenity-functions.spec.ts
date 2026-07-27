import { Timestamp } from "firebase-admin/firestore";
import { describe, expect, it } from "vitest";
import {
  OSM_AMENITY_TILE_ZOOM,
  OSM_ATTRIBUTION,
  OVERPASS_ENDPOINTS,
  OVERPASS_REQUEST_HEADERS,
  buildOverpassAmenityQuery,
  getOsmAmenityRetryDelayMs,
  getOsmAmenityTileBounds,
  inspectCacheDocument,
  normalizeOverpassAmenityResponse,
  parseOsmAmenityTileRequest,
} from "../functions/src/osmAmenityFunctions";

describe("OSM amenity functions", () => {
  const tile = { zoom: OSM_AMENITY_TILE_ZOOM, x: 2145, y: 1432 } as const;

  it("accepts only canonical zoom-12 tile requests", () => {
    expect(parseOsmAmenityTileRequest(tile)).toEqual(tile);
    expect(() =>
      parseOsmAmenityTileRequest({ ...tile, zoom: 11 }),
    ).toThrow(/zoom must be 12/);
    expect(() =>
      parseOsmAmenityTileRequest({ ...tile, x: 4096 }),
    ).toThrow(/outside the tile range/);
    expect(() =>
      parseOsmAmenityTileRequest({ ...tile, y: 1.5 }),
    ).toThrow(/outside the tile range/);
  });

  it("builds a bounded, node-only query with a server timeout", () => {
    const bounds = getOsmAmenityTileBounds(tile);
    const query = buildOverpassAmenityQuery(tile);

    expect(bounds.north).toBeGreaterThan(bounds.south);
    expect(bounds.east).toBeGreaterThan(bounds.west);
    expect(query).toContain("[out:json][timeout:12]");
    expect(query).toContain(
      'node["amenity"~"^(toilets|drinking_water|fountain)$"]',
    );
    expect(query).toContain("out body qt;");
    expect(query).not.toContain("way[");
    expect(query).not.toContain("relation[");
  });

  it("uses only fixed application headers for Overpass", () => {
    expect(OVERPASS_REQUEST_HEADERS).toEqual({
      "Content-Type": "text/plain; charset=utf-8",
      Referer: "https://pkspot.app/",
      "User-Agent": "PKSpot/1.0 (+https://pkspot.app/contact)",
    });
    expect(OVERPASS_ENDPOINTS).toEqual([
      {
        id: "vk-maps",
        url: "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
      },
      {
        id: "fossgis",
        url: "https://overpass-api.de/api/interpreter",
      },
    ]);
  });

  it("normalizes supported amenities and omits non-drinking fountains", () => {
    const result = normalizeOverpassAmenityResponse({
      osm3s: { timestamp_osm_base: "2026-07-26T12:00:00Z" },
      elements: [
        node(1, "drinking_water", { operator: "City" }),
        node(2, "fountain", { drinking_water: "yes", name: "Spring" }),
        node(3, "fountain", { drinking_water: "no" }),
        node(4, "toilets", {
          fee: "yes",
          charge: "CHF 1",
          opening_hours: "24/7",
        }),
        { type: "way", id: 5, tags: { amenity: "toilets" } },
      ],
    });

    expect(result).toEqual({
      sourceUpdatedAt: "2026-07-26T12:00:00Z",
      amenities: [
        {
          id: 1,
          type: "drinking_water",
          lat: 47.37,
          lng: 8.54,
          operator: "City",
        },
        {
          id: 2,
          type: "fountain",
          lat: 47.37,
          lng: 8.54,
          name: "Spring",
          drinkingWater: "yes",
        },
        {
          id: 4,
          type: "toilets",
          lat: 47.37,
          lng: 8.54,
          fee: "yes",
          charge: "CHF 1",
          openingHours: "24/7",
        },
      ],
    });
  });

  it("distinguishes fresh, stale, and expired cache records", () => {
    const now = Date.parse("2026-07-26T12:00:00Z");
    const base = {
      schema_version: 1,
      tile,
      amenities: [],
      fetched_at: Timestamp.fromMillis(now - 1_000),
    };

    expect(
      inspectCacheDocument(
        {
          ...base,
          refresh_after: Timestamp.fromMillis(now + 1_000),
          stale_until: Timestamp.fromMillis(now + 2_000),
        },
        now,
      ),
    ).toMatchObject({ fresh: true, staleUsable: true });
    expect(
      inspectCacheDocument(
        {
          ...base,
          refresh_after: Timestamp.fromMillis(now - 1),
          stale_until: Timestamp.fromMillis(now + 2_000),
        },
        now,
      ),
    ).toMatchObject({ fresh: false, staleUsable: true });
    expect(
      inspectCacheDocument(
        {
          ...base,
          refresh_after: Timestamp.fromMillis(now - 2_000),
          stale_until: Timestamp.fromMillis(now - 1_000),
        },
        now,
      ),
    ).toMatchObject({ fresh: false, staleUsable: false });
  });

  it("uses bounded exponential failure backoff", () => {
    expect(getOsmAmenityRetryDelayMs(1)).toBe(5 * 60 * 1_000);
    expect(getOsmAmenityRetryDelayMs(2)).toBe(15 * 60 * 1_000);
    expect(getOsmAmenityRetryDelayMs(3)).toBe(60 * 60 * 1_000);
    expect(getOsmAmenityRetryDelayMs(20)).toBe(6 * 60 * 60 * 1_000);
  });

  it("publishes ODbL attribution metadata", () => {
    expect(OSM_ATTRIBUTION).toEqual({
      text: "Amenity data © OpenStreetMap contributors",
      url: "https://www.openstreetmap.org/copyright",
      license: "ODbL 1.0",
    });
  });
});

function node(
  id: number,
  amenity: "toilets" | "drinking_water" | "fountain",
  tags: Record<string, string> = {},
) {
  return {
    type: "node",
    id,
    lat: 47.37,
    lon: 8.54,
    tags: { amenity, ...tags },
  };
}
