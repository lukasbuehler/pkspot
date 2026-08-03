/* eslint-disable max-len, object-curly-spacing, operator-linebreak, require-jsdoc */
import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";
import type { Timestamp } from "firebase-admin/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";
import {
  CallableRequest,
  HttpsError,
  onCall,
} from "firebase-functions/v2/https";

export const OSM_AMENITY_TILE_ZOOM = 12;
export const OSM_AMENITY_CACHE_COLLECTION = "osm_amenity_tile_cache";
export const OSM_OVERPASS_USAGE_COLLECTION = "osm_overpass_usage";
export const OSM_CACHE_SCHEMA_VERSION = 1;
export const OSM_CACHE_FRESH_MS = 7 * 24 * 60 * 60 * 1000;
export const OSM_CACHE_STALE_MS = 30 * 24 * 60 * 60 * 1000;
export const OSM_REFRESH_LEASE_MS = 30 * 1000;
export const OSM_COLD_WAIT_MS = 28 * 1000;
export const OSM_OVERPASS_FETCH_TIMEOUT_MS = 12 * 1000;
export const OSM_DAILY_QUERY_BUDGET = 8_000;
export const OSM_DAILY_BYTE_BUDGET = 800 * 1024 * 1024;
export const OVERPASS_ENDPOINTS = [
  {
    id: "vk-maps",
    url: "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
  },
  {
    id: "fossgis",
    url: "https://overpass-api.de/api/interpreter",
  },
] as const;
export const OSM_ATTRIBUTION = {
  text: "Amenity data © OpenStreetMap contributors",
  url: "https://www.openstreetmap.org/copyright",
  license: "ODbL 1.0",
} as const;
export const OVERPASS_REQUEST_HEADERS = {
  "Content-Type": "text/plain; charset=utf-8",
  Referer: "https://pkspot.app/",
  "User-Agent": "PKSpot/1.0 (+https://pkspot.app/contact)",
} as const;

export interface OsmAmenityTileRequest {
  zoom: typeof OSM_AMENITY_TILE_ZOOM;
  x: number;
  y: number;
}

export type OsmAmenityType = "toilets" | "drinking_water" | "fountain";

export interface OsmAmenityRecord {
  id: number;
  type: OsmAmenityType;
  lat: number;
  lng: number;
  name?: string;
  operator?: string;
  fee?: "yes" | "no";
  charge?: string;
  openingHours?: string;
  drinkingWater?: "yes" | "no";
}

export interface OsmAmenityTileResponse {
  tile: OsmAmenityTileRequest;
  fetchedAt: string;
  sourceUpdatedAt?: string;
  stale: boolean;
  amenities: OsmAmenityRecord[];
  attribution: typeof OSM_ATTRIBUTION;
}

export interface OsmAmenityCacheDocument {
  schema_version: typeof OSM_CACHE_SCHEMA_VERSION;
  tile: OsmAmenityTileRequest;
  amenities?: OsmAmenityRecord[];
  fetched_at?: Timestamp | Date;
  refresh_after?: Timestamp | Date;
  stale_until?: Timestamp | Date;
  source_updated_at?: string;
  lease_until?: Timestamp | Date;
  failure_count?: number;
  retry_after?: Timestamp | Date;
}

interface OverpassFetchResult {
  amenities: OsmAmenityRecord[];
  sourceUpdatedAt?: string;
  responseBytes: number;
  endpoint: string;
}

interface OverpassElement {
  type?: unknown;
  id?: unknown;
  lat?: unknown;
  lon?: unknown;
  tags?: unknown;
}

interface CacheSnapshot {
  document?: OsmAmenityCacheDocument;
  fresh: boolean;
  staleUsable: boolean;
  retryAfterMs?: number;
  leaseUntilMs?: number;
}

type LeaseResult =
  | { kind: "fresh"; document: OsmAmenityCacheDocument }
  | { kind: "stale"; document: OsmAmenityCacheDocument }
  | { kind: "wait" }
  | {
      kind: "backoff";
      retryAfterMs: number;
      document?: OsmAmenityCacheDocument;
    }
  | { kind: "acquired"; document?: OsmAmenityCacheDocument };

class OverpassResponseError extends Error {
  constructor(
    readonly status: number,
    readonly responseBytes: number,
    message: string,
  ) {
    super(message);
    this.name = "OverpassResponseError";
  }
}

export const getOsmAmenityTile = onCall(
  {
    enforceAppCheck: true,
    timeoutSeconds: 45,
  },
  async (
    request: CallableRequest<unknown>,
  ): Promise<OsmAmenityTileResponse> => {
    const tile = parseOsmAmenityTileRequest(request.data);
    const firestore = admin.firestore();
    const cacheRef = firestore
      .collection(OSM_AMENITY_CACHE_COLLECTION)
      .doc(getOsmAmenityTileCacheKey(tile));
    const nowMs = Date.now();
    const initialSnapshot = await cacheRef.get();
    const initial = inspectCacheDocument(initialSnapshot.data(), nowMs);

    if (initial.fresh && initial.document) {
      logger.info("OSM amenity cache result", { cacheStatus: "fresh" });
      return cacheDocumentToResponse(initial.document, false);
    }

    const lease = await acquireOsmAmenityRefreshLease(firestore, tile, nowMs);

    if (lease.kind === "fresh") {
      logger.info("OSM amenity cache result", { cacheStatus: "fresh-race" });
      return cacheDocumentToResponse(lease.document, false);
    }
    if (lease.kind === "stale") {
      logger.info("OSM amenity cache result", {
        cacheStatus: "stale-refreshing",
      });
      return cacheDocumentToResponse(lease.document, true);
    }
    if (lease.kind === "backoff") {
      if (
        lease.document &&
        inspectCacheDocument(lease.document, nowMs).staleUsable
      ) {
        logger.info("OSM amenity cache result", {
          cacheStatus: "stale-backoff",
        });
        return cacheDocumentToResponse(lease.document, true);
      }
      throw unavailableDuringBackoff(lease.retryAfterMs, nowMs);
    }
    if (lease.kind === "wait") {
      return waitForColdCacheFill(cacheRef, nowMs);
    }

    const refreshStartedAt = Date.now();
    try {
      const result = await fetchOverpassAmenityTile(firestore, tile);
      const document = await writeOsmAmenityCacheSuccess(
        cacheRef,
        tile,
        result,
        Date.now(),
      );
      logger.info("OSM amenity cache result", {
        cacheStatus: lease.document ? "refreshed" : "cold-fill",
        upstreamDurationMs: Date.now() - refreshStartedAt,
        upstreamBytes: result.responseBytes,
        amenityCount: result.amenities.length,
        upstreamEndpoint: result.endpoint,
      });
      return cacheDocumentToResponse(document, false);
    } catch (error) {
      const failureDocument = await recordOsmAmenityCacheFailure(
        cacheRef,
        tile,
        Date.now(),
      );
      logger.warn("Overpass amenity refresh failed", {
        cacheStatus: lease.document ? "stale-fallback" : "cold-failure",
        upstreamDurationMs: Date.now() - refreshStartedAt,
        upstreamStatus:
          error instanceof OverpassResponseError ? error.status : undefined,
        errorName: error instanceof Error ? error.name : "UnknownError",
      });
      if (inspectCacheDocument(failureDocument, Date.now()).staleUsable) {
        return cacheDocumentToResponse(failureDocument, true);
      }
      if (error instanceof HttpsError) {
        throw error;
      }
      throw new HttpsError(
        "unavailable",
        "Amenity data is temporarily unavailable.",
      );
    }
  },
);

export const cleanupExpiredOsmAmenityCache = onSchedule(
  "every day 03:15",
  async () => {
    const firestore = admin.firestore();
    const now = new Date();

    for (let iteration = 0; iteration < 4; iteration += 1) {
      const snapshot = await firestore
        .collection(OSM_AMENITY_CACHE_COLLECTION)
        .where("stale_until", "<=", now)
        .limit(300)
        .get();
      if (snapshot.empty) return;

      const batch = firestore.batch();
      snapshot.docs.forEach((document) => batch.delete(document.ref));
      await batch.commit();
    }
  },
);

export function parseOsmAmenityTileRequest(
  value: unknown,
): OsmAmenityTileRequest {
  if (!isRecord(value)) {
    throw new HttpsError("invalid-argument", "request must be an object");
  }

  const zoom = value["zoom"];
  const x = value["x"];
  const y = value["y"];
  const tileCount = 2 ** OSM_AMENITY_TILE_ZOOM;
  if (zoom !== OSM_AMENITY_TILE_ZOOM) {
    throw new HttpsError(
      "invalid-argument",
      `zoom must be ${OSM_AMENITY_TILE_ZOOM}`,
    );
  }
  if (!Number.isInteger(x) || Number(x) < 0 || Number(x) >= tileCount) {
    throw new HttpsError("invalid-argument", "x is outside the tile range");
  }
  if (!Number.isInteger(y) || Number(y) < 0 || Number(y) >= tileCount) {
    throw new HttpsError("invalid-argument", "y is outside the tile range");
  }

  return { zoom, x: Number(x), y: Number(y) };
}

export function getOsmAmenityTileCacheKey(tile: OsmAmenityTileRequest): string {
  return `z${tile.zoom}_${tile.x}_${tile.y}`;
}

export function getOsmAmenityTileBounds(tile: OsmAmenityTileRequest): {
  north: number;
  south: number;
  east: number;
  west: number;
} {
  const tileCount = 2 ** tile.zoom;
  const west = (tile.x / tileCount) * 360 - 180;
  const east = ((tile.x + 1) / tileCount) * 360 - 180;
  const north = tileYToLatitude(tile.y, tileCount);
  const south = tileYToLatitude(tile.y + 1, tileCount);
  return { north, south, east, west };
}

export function buildOverpassAmenityQuery(tile: OsmAmenityTileRequest): string {
  const bounds = getOsmAmenityTileBounds(tile);
  const bbox = [bounds.south, bounds.west, bounds.north, bounds.east].join(",");
  return `[out:json][timeout:12];
node["amenity"~"^(toilets|drinking_water|fountain)$"](${bbox});
out body qt;`;
}

export function normalizeOverpassAmenityResponse(value: unknown): {
  amenities: OsmAmenityRecord[];
  sourceUpdatedAt?: string;
} {
  if (!isRecord(value) || !Array.isArray(value["elements"])) {
    throw new Error("Overpass response is missing elements");
  }

  const amenities = value["elements"]
    .map((element) => normalizeOverpassElement(element))
    .filter((element): element is OsmAmenityRecord => element !== undefined);
  const osm3s = isRecord(value["osm3s"]) ? value["osm3s"] : undefined;
  const sourceUpdatedAt =
    typeof osm3s?.["timestamp_osm_base"] === "string"
      ? osm3s["timestamp_osm_base"]
      : undefined;
  return { amenities, sourceUpdatedAt };
}

export function inspectCacheDocument(
  value: unknown,
  nowMs: number,
): CacheSnapshot {
  if (!isRecord(value)) {
    return { fresh: false, staleUsable: false };
  }

  const document = value as unknown as OsmAmenityCacheDocument;
  const hasData =
    document.schema_version === OSM_CACHE_SCHEMA_VERSION &&
    Array.isArray(document.amenities) &&
    timestampToMillis(document.fetched_at) !== undefined;
  const refreshAfterMs = timestampToMillis(document.refresh_after);
  const staleUntilMs = timestampToMillis(document.stale_until);
  const retryAfterMs = timestampToMillis(document.retry_after);
  const leaseUntilMs = timestampToMillis(document.lease_until);

  return {
    document,
    fresh: hasData && refreshAfterMs !== undefined && refreshAfterMs > nowMs,
    staleUsable: hasData && staleUntilMs !== undefined && staleUntilMs > nowMs,
    retryAfterMs,
    leaseUntilMs,
  };
}

export function getOsmAmenityRetryDelayMs(failureCount: number): number {
  const retrySteps = [5, 15, 60, 6 * 60];
  const minutes = retrySteps[Math.min(Math.max(failureCount - 1, 0), 3)];
  return minutes * 60 * 1000;
}

export async function acquireOsmAmenityRefreshLease(
  firestore: FirebaseFirestore.Firestore,
  tile: OsmAmenityTileRequest,
  nowMs: number,
): Promise<LeaseResult> {
  const cacheRef = firestore
    .collection(OSM_AMENITY_CACHE_COLLECTION)
    .doc(getOsmAmenityTileCacheKey(tile));

  return firestore.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(cacheRef);
    const cache = inspectCacheDocument(snapshot.data(), nowMs);
    if (cache.fresh && cache.document) {
      return { kind: "fresh", document: cache.document };
    }
    if (cache.retryAfterMs && cache.retryAfterMs > nowMs) {
      return {
        kind: "backoff",
        retryAfterMs: cache.retryAfterMs,
        document: cache.document,
      };
    }
    if (cache.leaseUntilMs && cache.leaseUntilMs > nowMs) {
      if (cache.staleUsable && cache.document) {
        return { kind: "stale", document: cache.document };
      }
      return { kind: "wait" };
    }

    transaction.set(
      cacheRef,
      {
        schema_version: OSM_CACHE_SCHEMA_VERSION,
        tile,
        lease_until: new Date(nowMs + OSM_REFRESH_LEASE_MS),
      },
      { merge: true },
    );
    return { kind: "acquired", document: cache.document };
  });
}

export async function writeOsmAmenityCacheSuccess(
  cacheRef: FirebaseFirestore.DocumentReference,
  tile: OsmAmenityTileRequest,
  result: Pick<OverpassFetchResult, "amenities" | "sourceUpdatedAt">,
  nowMs: number,
): Promise<OsmAmenityCacheDocument> {
  const document: OsmAmenityCacheDocument = {
    schema_version: OSM_CACHE_SCHEMA_VERSION,
    tile,
    amenities: result.amenities,
    fetched_at: new Date(nowMs),
    refresh_after: new Date(nowMs + OSM_CACHE_FRESH_MS),
    stale_until: new Date(nowMs + OSM_CACHE_STALE_MS),
    ...(result.sourceUpdatedAt
      ? { source_updated_at: result.sourceUpdatedAt }
      : {}),
  };
  await cacheRef.set(document);
  return document;
}

export async function recordOsmAmenityCacheFailure(
  cacheRef: FirebaseFirestore.DocumentReference,
  tile: OsmAmenityTileRequest,
  nowMs: number,
): Promise<OsmAmenityCacheDocument> {
  return cacheRef.firestore.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(cacheRef);
    const current = (snapshot.data() as
      | OsmAmenityCacheDocument
      | undefined) ?? {
      schema_version: OSM_CACHE_SCHEMA_VERSION,
      tile,
    };
    const failureCount = (current.failure_count ?? 0) + 1;
    const document = {
      ...current,
      schema_version: OSM_CACHE_SCHEMA_VERSION,
      tile,
      failure_count: failureCount,
      stale_until: current.stale_until ?? new Date(nowMs + OSM_CACHE_STALE_MS),
      retry_after: new Date(nowMs + getOsmAmenityRetryDelayMs(failureCount)),
    } satisfies OsmAmenityCacheDocument;
    transaction.set(
      cacheRef,
      {
        ...document,
        lease_until: new Date(nowMs - 1),
      },
      { merge: true },
    );
    delete document.lease_until;
    return document;
  });
}

async function fetchOverpassAmenityTile(
  firestore: FirebaseFirestore.Firestore,
  tile: OsmAmenityTileRequest,
): Promise<OverpassFetchResult> {
  let lastError: unknown;

  for (const endpoint of OVERPASS_ENDPOINTS) {
    await consumeOverpassQueryBudget(firestore, new Date());
    const attemptStartedAt = Date.now();
    try {
      const result = await fetchOverpassAmenityTileFromEndpoint(
        tile,
        endpoint.url,
      );
      await recordOverpassResponseBytes(
        firestore,
        new Date(),
        result.responseBytes,
      );
      return { ...result, endpoint: endpoint.id };
    } catch (error) {
      lastError = error;
      if (error instanceof OverpassResponseError) {
        await recordOverpassResponseBytes(
          firestore,
          new Date(),
          error.responseBytes,
        );
      }
      logger.warn("Overpass endpoint attempt failed", {
        upstreamEndpoint: endpoint.id,
        upstreamDurationMs: Date.now() - attemptStartedAt,
        upstreamStatus:
          error instanceof OverpassResponseError ? error.status : undefined,
        errorName: error instanceof Error ? error.name : "UnknownError",
        errorCode: getNetworkErrorCode(error),
      });
    }
  }

  throw lastError ?? new Error("No Overpass endpoint is configured.");
}

async function fetchOverpassAmenityTileFromEndpoint(
  tile: OsmAmenityTileRequest,
  endpoint: string,
): Promise<Omit<OverpassFetchResult, "endpoint">> {
  const abortController = new AbortController();
  const timeoutId = setTimeout(
    () => abortController.abort(),
    OSM_OVERPASS_FETCH_TIMEOUT_MS,
  );

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: OVERPASS_REQUEST_HEADERS,
      body: buildOverpassAmenityQuery(tile),
      signal: abortController.signal,
    });
    const responseText = await response.text();
    const responseBytes = Buffer.byteLength(responseText, "utf8");
    if (!response.ok) {
      throw new OverpassResponseError(
        response.status,
        responseBytes,
        `Overpass returned HTTP ${response.status}`,
      );
    }
    const normalized = normalizeOverpassAmenityResponse(
      JSON.parse(responseText) as unknown,
    );
    return { ...normalized, responseBytes };
  } finally {
    clearTimeout(timeoutId);
  }
}

async function consumeOverpassQueryBudget(
  firestore: FirebaseFirestore.Firestore,
  date: Date,
): Promise<void> {
  const usageRef = firestore
    .collection(OSM_OVERPASS_USAGE_COLLECTION)
    .doc(getUtcDateKey(date));
  await firestore.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(usageRef);
    const queries = Number(snapshot.data()?.["queries"] ?? 0);
    const bytes = Number(snapshot.data()?.["bytes"] ?? 0);
    if (queries >= OSM_DAILY_QUERY_BUDGET || bytes >= OSM_DAILY_BYTE_BUDGET) {
      throw new HttpsError(
        "resource-exhausted",
        "The daily amenity refresh budget is exhausted.",
      );
    }
    transaction.set(
      usageRef,
      {
        date: getUtcDateKey(date),
        queries: queries + 1,
        bytes,
        updated_at: date,
      },
      { merge: true },
    );
  });
}

async function recordOverpassResponseBytes(
  firestore: FirebaseFirestore.Firestore,
  date: Date,
  responseBytes: number,
): Promise<void> {
  const usageRef = firestore
    .collection(OSM_OVERPASS_USAGE_COLLECTION)
    .doc(getUtcDateKey(date));
  await firestore.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(usageRef);
    const bytes = Number(snapshot.data()?.["bytes"] ?? 0);
    transaction.set(
      usageRef,
      {
        bytes: bytes + responseBytes,
        updated_at: date,
      },
      { merge: true },
    );
  });
}

async function waitForColdCacheFill(
  cacheRef: FirebaseFirestore.DocumentReference,
  startedAtMs: number,
): Promise<OsmAmenityTileResponse> {
  while (Date.now() - startedAtMs < OSM_COLD_WAIT_MS) {
    await delay(500 + Math.floor(Math.random() * 250));
    const snapshot = await cacheRef.get();
    const cache = inspectCacheDocument(snapshot.data(), Date.now());
    if (cache.fresh && cache.document) {
      logger.info("OSM amenity cache result", {
        cacheStatus: "cold-race-fill",
      });
      return cacheDocumentToResponse(cache.document, false);
    }
    if (cache.retryAfterMs && cache.retryAfterMs > Date.now()) {
      throw unavailableDuringBackoff(cache.retryAfterMs, Date.now());
    }
  }
  throw new HttpsError("unavailable", "Amenity data is still being refreshed.");
}

function cacheDocumentToResponse(
  document: OsmAmenityCacheDocument,
  stale: boolean,
): OsmAmenityTileResponse {
  const fetchedAtMs = timestampToMillis(document.fetched_at);
  if (fetchedAtMs === undefined || !document.amenities) {
    throw new HttpsError("internal", "Amenity cache record is incomplete.");
  }
  return {
    tile: document.tile,
    fetchedAt: new Date(fetchedAtMs).toISOString(),
    ...(document.source_updated_at
      ? { sourceUpdatedAt: document.source_updated_at }
      : {}),
    stale,
    amenities: document.amenities,
    attribution: OSM_ATTRIBUTION,
  };
}

function normalizeOverpassElement(
  value: unknown,
): OsmAmenityRecord | undefined {
  if (!isRecord(value)) return undefined;
  const element = value as OverpassElement;
  if (
    element.type !== "node" ||
    typeof element.id !== "number" ||
    typeof element.lat !== "number" ||
    typeof element.lon !== "number" ||
    !isRecord(element.tags)
  ) {
    return undefined;
  }

  const amenity = element.tags["amenity"];
  if (
    amenity !== "toilets" &&
    amenity !== "drinking_water" &&
    amenity !== "fountain"
  ) {
    return undefined;
  }
  const drinkingWater = yesNo(element.tags["drinking_water"]);
  if (amenity === "fountain" && drinkingWater === "no") {
    return undefined;
  }

  return {
    id: element.id,
    type: amenity,
    lat: element.lat,
    lng: element.lon,
    ...stringProperty(element.tags, "name", "name"),
    ...stringProperty(element.tags, "operator", "operator"),
    ...yesNoProperty(element.tags, "fee", "fee"),
    ...stringProperty(element.tags, "charge", "charge"),
    ...stringProperty(element.tags, "opening_hours", "openingHours"),
    ...(drinkingWater ? { drinkingWater } : {}),
  };
}

function unavailableDuringBackoff(
  retryAfterMs: number,
  nowMs: number,
): HttpsError {
  return new HttpsError(
    "unavailable",
    "Amenity data is temporarily unavailable.",
    {
      retryAfterSeconds: Math.max(1, Math.ceil((retryAfterMs - nowMs) / 1000)),
    },
  );
}

function tileYToLatitude(y: number, tileCount: number): number {
  const mercatorY = Math.PI * (1 - (2 * y) / tileCount);
  return (Math.atan(Math.sinh(mercatorY)) * 180) / Math.PI;
}

function timestampToMillis(value: unknown): number | undefined {
  if (value instanceof Date) {
    return value.getTime();
  }
  if (
    value &&
    typeof value === "object" &&
    "toMillis" in value &&
    typeof value.toMillis === "function"
  ) {
    return value.toMillis();
  }
  return undefined;
}

function getUtcDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function yesNo(value: unknown): "yes" | "no" | undefined {
  return value === "yes" || value === "no" ? value : undefined;
}

function yesNoProperty(
  source: Record<string, unknown>,
  sourceKey: string,
  targetKey: "fee",
): Pick<OsmAmenityRecord, "fee"> | Record<string, never> {
  const value = yesNo(source[sourceKey]);
  return value ? { [targetKey]: value } : {};
}

function stringProperty<
  TKey extends "name" | "operator" | "charge" | "openingHours",
>(
  source: Record<string, unknown>,
  sourceKey: string,
  targetKey: TKey,
): Pick<OsmAmenityRecord, TKey> | Record<string, never> {
  const value = source[sourceKey];
  return typeof value === "string" && value.trim()
    ? ({ [targetKey]: value } as Pick<OsmAmenityRecord, TKey>)
    : {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getNetworkErrorCode(error: unknown): string | undefined {
  if (!isRecord(error) || !isRecord(error["cause"])) return undefined;
  const code = error["cause"]["code"];
  return typeof code === "string" ? code : undefined;
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
