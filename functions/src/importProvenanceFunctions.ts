import * as admin from "firebase-admin";
import {HttpsError, onCall} from "firebase-functions/v2/https";
import {
  buildPublicImportProvenance,
  PublicImportProvenanceProjection,
} from "./importProvenanceProjection";

const MAX_IMPORT_ID_LENGTH = 180;
const CACHE_TTL_MS = 15 * 60 * 1_000;
const MAX_CACHE_ENTRIES = 1_000;
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_REQUESTS = 60;
const MAX_RATE_LIMIT_ENTRIES = 1_000;

type TimedValue<T> = {expiresAt: number; value: T};

/** Small per-instance cache with explicit bounds; null is a cacheable value. */
export class BoundedTtlCache<T> {
  private readonly entries = new Map<string, TimedValue<T>>();

  constructor(
    private readonly maxEntries: number,
    private readonly ttlMs: number,
  ) {}

  get(key: string, now = Date.now()): {found: boolean; value?: T} {
    const entry = this.entries.get(key);
    if (!entry) return {found: false};
    if (entry.expiresAt <= now) {
      this.entries.delete(key);
      return {found: false};
    }
    this.entries.delete(key);
    this.entries.set(key, entry);
    return {found: true, value: entry.value};
  }

  set(key: string, value: T, now = Date.now()): void {
    this.removeExpired(now);
    this.entries.delete(key);
    this.entries.set(key, {value, expiresAt: now + this.ttlMs});
    while (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next().value as string | undefined;
      if (!oldest) break;
      this.entries.delete(oldest);
    }
  }

  private removeExpired(now: number): void {
    for (const [key, entry] of this.entries) {
      if (entry.expiresAt <= now) this.entries.delete(key);
    }
  }
}

export class PerKeyFixedWindowLimiter {
  private readonly entries = new Map<string, {count: number; windowStart: number}>();

  constructor(
    private readonly maxEntries: number,
    private readonly maxRequests: number,
    private readonly windowMs: number,
  ) {}

  allow(key: string, now = Date.now()): boolean {
    for (const [candidate, entry] of this.entries) {
      if (entry.windowStart + this.windowMs <= now) this.entries.delete(candidate);
    }

    const existing = this.entries.get(key);
    if (!existing || existing.windowStart + this.windowMs <= now) {
      if (!existing && this.entries.size >= this.maxEntries) {
        const oldest = this.entries.keys().next().value as string | undefined;
        if (oldest) this.entries.delete(oldest);
      }
      this.entries.set(key, {count: 1, windowStart: now});
      return true;
    }
    if (existing.count >= this.maxRequests) return false;
    existing.count += 1;
    return true;
  }
}

const cache = new BoundedTtlCache<PublicImportProvenanceProjection | null>(
  MAX_CACHE_ENTRIES,
  CACHE_TTL_MS,
);
const limiter = new PerKeyFixedWindowLimiter(
  MAX_RATE_LIMIT_ENTRIES,
  RATE_LIMIT_REQUESTS,
  RATE_LIMIT_WINDOW_MS,
);

const importIdFrom = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const importId = value.trim();
  return importId &&
    importId.length <= MAX_IMPORT_ID_LENGTH &&
    !importId.includes("/")
    ? importId
    : null;
};

const requestIp = (rawRequest: unknown): string => {
  if (!rawRequest || typeof rawRequest !== "object") return "unknown";
  const request = rawRequest as {
    ip?: unknown;
    headers?: {"x-forwarded-for"?: unknown};
  };
  if (typeof request.ip === "string" && request.ip.trim()) {
    return request.ip.trim();
  }
  const forwarded = request.headers?.["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim()) {
    return forwarded.split(",", 1)[0]?.trim() || "unknown";
  }
  return "unknown";
};

const findLinkedPublicSpot = async (
  db: admin.firestore.Firestore,
  importId: string,
): Promise<FirebaseFirestore.QueryDocumentSnapshot | null> => {
  for (const field of ["import_id", "source"] as const) {
    const result = await db.collection("spots").where(field, "==", importId).limit(1).get();
    if (!result.empty) return result.docs[0] ?? null;
  }
  return null;
};

/**
 * Compatibility endpoint for older clients and unmigrated Spots. Limits and
 * cache are deliberately best-effort per warm Function instance.
 */
export const getPublicImportProvenance = onCall(
  {cors: true, invoker: "public"},
  async (request): Promise<PublicImportProvenanceProjection | null> => {
    const importId = importIdFrom(
      request.data && typeof request.data === "object"
        ? (request.data as Record<string, unknown>)["importId"]
        : undefined,
    );
    if (!importId) {
      throw new HttpsError("invalid-argument", "A valid importId is required.");
    }
    if (!limiter.allow(requestIp(request.rawRequest))) {
      throw new HttpsError("resource-exhausted", "Too many provenance requests.");
    }

    const cached = cache.get(importId);
    if (cached.found) return cached.value ?? null;

    const db = admin.firestore();
    const publicSpot = await findLinkedPublicSpot(db, importId);
    if (!publicSpot) {
      cache.set(importId, null);
      return null;
    }

    const spotProjection = publicSpot.data()["public_import_provenance"];
    if (spotProjection === null) {
      cache.set(importId, null);
      return null;
    }
    if (spotProjection && typeof spotProjection === "object") {
      const sanitized = buildPublicImportProvenance({
        credits: spotProjection,
        source_url: (spotProjection as Record<string, unknown>)["source_url"],
        viewer_url: (spotProjection as Record<string, unknown>)["viewer_url"],
      });
      if (sanitized) {
        cache.set(importId, sanitized);
        return sanitized;
      }
    }

    const importSnapshot = await db.collection("imports").doc(importId).get();
    const projection = buildPublicImportProvenance(importSnapshot.data());
    cache.set(importId, projection);
    return projection;
  },
);
