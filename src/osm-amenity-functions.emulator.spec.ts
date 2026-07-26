import * as admin from "firebase-admin";
import { Timestamp } from "firebase-admin/firestore";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  OSM_AMENITY_CACHE_COLLECTION,
  OSM_AMENITY_TILE_ZOOM,
  OSM_CACHE_FRESH_MS,
  OSM_CACHE_SCHEMA_VERSION,
  acquireOsmAmenityRefreshLease,
  getOsmAmenityTileCacheKey,
  inspectCacheDocument,
  recordOsmAmenityCacheFailure,
  writeOsmAmenityCacheSuccess,
} from "../functions/src/osmAmenityFunctions";

const runWithEmulator = process.env["FIRESTORE_EMULATOR_HOST"]
  ? describe
  : describe.skip;
const projectId = process.env["GCLOUD_PROJECT"] || "demo-pkspot";
let app: admin.app.App;
let db: admin.firestore.Firestore;

runWithEmulator("OSM amenity cache emulator integration", () => {
  beforeAll(() => {
    app = admin.initializeApp(
      { projectId },
      `osm-amenity-cache-${Date.now()}`,
    );
    db = admin.firestore(app);
  });

  afterAll(async () => {
    await app.delete();
  });

  it("serializes cold fills and returns the completed cache to later callers", async () => {
    const tile = uniqueTile(1);
    const cacheRef = db
      .collection(OSM_AMENITY_CACHE_COLLECTION)
      .doc(getOsmAmenityTileCacheKey(tile));
    const now = Date.now();

    expect(await acquireOsmAmenityRefreshLease(db, tile, now)).toMatchObject({
      kind: "acquired",
    });
    expect(
      await acquireOsmAmenityRefreshLease(db, tile, now + 1),
    ).toMatchObject({ kind: "wait" });

    await writeOsmAmenityCacheSuccess(
      cacheRef,
      tile,
      {
        amenities: [
          { id: 1, type: "drinking_water", lat: 47.37, lng: 8.54 },
        ],
        sourceUpdatedAt: "2026-07-26T12:00:00Z",
      },
      now + 2,
    );

    expect(
      await acquireOsmAmenityRefreshLease(db, tile, now + 3),
    ).toMatchObject({
      kind: "fresh",
      document: {
        amenities: [{ id: 1, type: "drinking_water" }],
      },
    });
  });

  it("retains stale data and persists retry backoff after a failed refresh", async () => {
    const tile = uniqueTile(2);
    const cacheRef = db
      .collection(OSM_AMENITY_CACHE_COLLECTION)
      .doc(getOsmAmenityTileCacheKey(tile));
    const now = Date.now();
    await cacheRef.set({
      schema_version: OSM_CACHE_SCHEMA_VERSION,
      tile,
      amenities: [{ id: 2, type: "toilets", lat: 47.37, lng: 8.54 }],
      fetched_at: Timestamp.fromMillis(now - OSM_CACHE_FRESH_MS - 1),
      refresh_after: Timestamp.fromMillis(now - 1),
      stale_until: Timestamp.fromMillis(now + 60_000),
    });

    expect(await acquireOsmAmenityRefreshLease(db, tile, now)).toMatchObject({
      kind: "acquired",
    });
    const failed = await recordOsmAmenityCacheFailure(cacheRef, tile, now + 1);
    expect(inspectCacheDocument(failed, now + 2)).toMatchObject({
      fresh: false,
      staleUsable: true,
    });
    expect(
      await acquireOsmAmenityRefreshLease(db, tile, now + 2),
    ).toMatchObject({
      kind: "backoff",
      document: {
        amenities: [{ id: 2, type: "toilets" }],
        failure_count: 1,
      },
    });
  });
});

function uniqueTile(offset: number) {
  const x = (Math.floor(Date.now() / 10) + offset) % 4096;
  return { zoom: OSM_AMENITY_TILE_ZOOM, x, y: 1400 + offset } as const;
}
