import * as admin from "firebase-admin";
import {createRequire} from "node:module";
import {resolve} from "node:path";
import type {CallableRequest} from "../functions/node_modules/firebase-functions/lib/v2/providers/https";
const functionsRequire = createRequire(resolve("functions/package.json"));
const functionAdmin: typeof admin = functionsRequire("firebase-admin");
import { Timestamp } from "firebase-admin/firestore";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
  OSM_AMENITY_CACHE_COLLECTION,
  OSM_AMENITY_TILE_ZOOM,
  OSM_CACHE_FRESH_MS,
  OSM_CACHE_SCHEMA_VERSION,
  acquireOsmAmenityRefreshLease,
  getOsmAmenityTileCacheKey,
  getOsmAmenityTile,
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
let functionApp: admin.app.App;

runWithEmulator("OSM amenity cache emulator integration", () => {
  beforeAll(() => {
    app = admin.initializeApp(
      { projectId },
      `osm-amenity-cache-${Date.now()}`,
    );
    db = admin.firestore(app);
    functionApp = functionAdmin.initializeApp({projectId});
  });

  afterEach(() => vi.unstubAllGlobals());

  afterAll(async () => {
    await app.delete();
    await functionApp.delete();
  });

  const invoke = (data: unknown) => getOsmAmenityTile.run({data} as CallableRequest<unknown>);
  const upstreamSuccess = () => new Response(JSON.stringify({elements: [
    {type: "node", id: 42, lat: 47.37, lon: 8.54, tags: {amenity: "drinking_water"}},
  ]}));

  it("calls Overpass, persists a cold result and serves the next request from cache", async () => {
    const fetch = vi.fn().mockImplementation(async () => upstreamSuccess());
    vi.stubGlobal("fetch", fetch);
    const tile = uniqueTile(10);
    expect((await invoke({...tile, acceptUnavailable: true})).amenities).toHaveLength(1);
    expect((await invoke(tile)).amenities).toHaveLength(1);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("uses the second endpoint when the first returns 504", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(new Response("timeout", {status: 504}))
      .mockImplementationOnce(async () => upstreamSuccess());
    vi.stubGlobal("fetch", fetch);
    expect((await invoke({...uniqueTile(11), acceptUnavailable: true})).amenities).toHaveLength(1);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("returns explicit cold outages, respects backoff, preserves legacy retries, then recovers", async () => {
    const fetch = vi.fn().mockImplementation(async () => new Response("timeout", {status: 503}));
    vi.stubGlobal("fetch", fetch);
    const tile = uniqueTile(12);
    const outage = await invoke({...tile, acceptUnavailable: true});
    expect(outage).toMatchObject({status: "unavailable", amenities: []});
    expect(outage.retryAfterSeconds).toBeGreaterThan(0);
    await expect(invoke(tile)).rejects.toMatchObject({code: "unavailable"});
    expect(fetch).toHaveBeenCalledTimes(2);
    const ref = db.collection(OSM_AMENITY_CACHE_COLLECTION).doc(getOsmAmenityTileCacheKey(tile));
    await ref.update({retry_after: Timestamp.fromMillis(0), lease_until: Timestamp.fromMillis(0)});
    fetch.mockImplementation(async () => upstreamSuccess());
    expect((await invoke({...tile, acceptUnavailable: true})).amenities).toHaveLength(1);
  });

  it("serves stale amenities when both providers time out", async () => {
    const tile = uniqueTile(13);
    const ref = db.collection(OSM_AMENITY_CACHE_COLLECTION).doc(getOsmAmenityTileCacheKey(tile));
    await writeOsmAmenityCacheSuccess(ref, tile, {amenities: [{id: 42, type: "drinking_water", lat: 47.37, lng: 8.54}]}, Date.now() - OSM_CACHE_FRESH_MS - 1000);
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new DOMException("timeout", "AbortError")));
    expect(await invoke(tile)).toMatchObject({stale: true, amenities: [{id: 42}]});
  });

  it("does not hide invalid requests or a broken Overpass query", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response("bad query", {status: 400}));
    vi.stubGlobal("fetch", fetch);
    await expect(invoke({zoom: 1})).rejects.toMatchObject({code: "invalid-argument"});
    expect(fetch).not.toHaveBeenCalled();
    await expect(invoke({...uniqueTile(14), acceptUnavailable: true})).rejects.toMatchObject({status: 400});
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
