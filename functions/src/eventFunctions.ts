import { GeoPoint, Timestamp } from "firebase-admin/firestore";
import {
  onDocumentCreated,
  onDocumentWritten,
} from "firebase-functions/v2/firestore";
import * as admin from "firebase-admin";

import {
  EventBoundsSchema,
  EventPromoRegionSchema,
  EventSchema,
} from "../../src/db/schemas/EventSchema";
import {
  EventRSVPCountsSchema,
  EventRSVPSchema,
} from "../../src/db/schemas/EventRSVPSchema";

const MAINTENANCE_COLLECTION = "maintenance";
const RUN_BACKFILL_EVENT_TYPESENSE_DOC = `${MAINTENANCE_COLLECTION}/run-backfill-event-typesense-fields`;
const TYPESENSE_HELPER_FIELDS = [
  "start_seconds",
  "end_seconds",
  "promo_starts_at_seconds",
  "bounds_center",
  "bounds_radius_m",
  "promo_radius_m",
  "promo_bounds_north",
  "promo_bounds_south",
  "promo_bounds_east",
  "promo_bounds_west",
  "promo_region_center",
  "promo_region_radius_m",
] as const;

/**
 * Skip non-runtime docs that share the events collection space (the
 * Firestore→Typesense Firebase Extension uses a `typesense/` settings doc;
 * maintenance sentinels use `run-…` ids). Keeps backfill + write triggers
 * from acting on those.
 */
const isEventRuntimeDoc = (docId: string): boolean =>
  docId !== "typesense" && !docId.startsWith("run-");

const isGeoPointValue = (value: unknown): value is GeoPoint => {
  if (isActualGeoPointValue(value)) return true;

  return Boolean(
    value &&
      typeof value === "object" &&
      typeof (value as { latitude?: unknown }).latitude === "number" &&
      typeof (value as { longitude?: unknown }).longitude === "number"
  );
};

const isActualGeoPointValue = (value: unknown): value is GeoPoint => {
  if (value instanceof GeoPoint) return true;

  const adminGeoPointCtor = (
    admin.firestore as unknown as { GeoPoint?: typeof GeoPoint }
  ).GeoPoint;
  return Boolean(
    typeof adminGeoPointCtor === "function" &&
    value instanceof adminGeoPointCtor
  );
};

const _removeUndefinedValues = <T>(value: T): T => {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const entries = Object.entries(value as Record<string, unknown>).filter(
      ([, v]) => v !== undefined
    );
    return Object.fromEntries(entries) as T;
  }
  return value;
};

const _normalizeComparableValue = (value: unknown): unknown => {
  if (isGeoPointValue(value)) {
    return { latitude: value.latitude, longitude: value.longitude };
  }
  if (Array.isArray(value)) {
    return value.map((entry) => _normalizeComparableValue(entry));
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => [k, _normalizeComparableValue(v)]);
    return Object.fromEntries(entries);
  }
  return value;
};

const _areValuesEqual = (left: unknown, right: unknown): boolean =>
  JSON.stringify(_normalizeComparableValue(left)) ===
  JSON.stringify(_normalizeComparableValue(right));

const _toRadians = (deg: number): number => (deg * Math.PI) / 180;

const _haversineMeters = (
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
): number => {
  const R = 6371000;
  const dLat = _toRadians(b.lat - a.lat);
  const dLng = _toRadians(b.lng - a.lng);
  const φ1 = _toRadians(a.lat);
  const φ2 = _toRadians(b.lat);
  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
};

const _bboxCenterAndRadius = (
  bounds: EventBoundsSchema
): { center: { lat: number; lng: number }; radiusM: number } => {
  const center = {
    lat: (bounds.north + bounds.south) / 2,
    lng: (bounds.east + bounds.west) / 2,
  };
  // Distance from the center to a corner — by symmetry all four corners
  // are equidistant. Round up so we never under-cover the box.
  const corner = { lat: bounds.north, lng: bounds.east };
  return { center, radiusM: Math.ceil(_haversineMeters(center, corner)) };
};

const _promoBoundsFromCenterRadius = (
  center: { lat: number; lng: number },
  radiusM: number
): Pick<
  EventSchema,
  | "promo_bounds_north"
  | "promo_bounds_south"
  | "promo_bounds_east"
  | "promo_bounds_west"
> => {
  const radius = Math.max(0, radiusM);
  const dLat = radius / 111000;
  const cosLat = Math.cos(_toRadians(center.lat)) || 1e-6;
  const dLng = radius / (111000 * cosLat);
  return {
    promo_bounds_north: center.lat + dLat,
    promo_bounds_south: center.lat - dLat,
    promo_bounds_east: center.lng + dLng,
    promo_bounds_west: center.lng - dLng,
  };
};

const _promoRegionCenterAndRadius = (
  region: EventPromoRegionSchema | undefined
): { center: { lat: number; lng: number }; radiusM: number } | null => {
  if (!region) return null;
  if (region.center && typeof region.radius_m === "number") {
    return { center: region.center, radiusM: region.radius_m };
  }
  if (region.bounds) {
    return _bboxCenterAndRadius(region.bounds);
  }
  return null;
};

const _promoRadiusMeters = (
  eventData: EventSchema,
  legacyPromo: { radiusM: number } | null
): number | undefined => {
  if (
    typeof eventData.promo_radius_m === "number" &&
    Number.isFinite(eventData.promo_radius_m)
  ) {
    return Math.max(0, eventData.promo_radius_m);
  }
  if (legacyPromo && Number.isFinite(legacyPromo.radiusM)) {
    return Math.max(0, legacyPromo.radiusM);
  }
  return undefined;
};

const _rawCoordinate = (
  value: EventSchema["location_raw"] | undefined
): { lat: number; lng: number } | undefined => {
  const lat = Number(value?.lat);
  const lng = Number(value?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return undefined;
  return { lat, lng };
};

const _geoPointCoordinate = (
  value: EventSchema["location"] | undefined
): { lat: number; lng: number } | undefined => {
  if (!isGeoPointValue(value)) return undefined;
  return { lat: value.latitude, lng: value.longitude };
};

const _timestampSeconds = (value: unknown): number | undefined => {
  const timestamp = _timestampValue(value);
  return timestamp?.seconds;
};

const _timestampValue = (value: unknown): Timestamp | undefined => {
  if (!value) return undefined;
  if (value instanceof Timestamp) return value;
  if (value instanceof Date) return Timestamp.fromDate(value);
  if (typeof value === "string" || typeof value === "number") {
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? Timestamp.fromDate(date) : undefined;
  }
  if (
    typeof value === "object" &&
    (typeof (value as { seconds?: unknown }).seconds === "number" ||
      typeof (value as { _seconds?: unknown })._seconds === "number")
  ) {
    const timestampLike = value as {
      seconds?: number;
      nanoseconds?: number;
      _seconds?: number;
      _nanoseconds?: number;
    };
    return new Timestamp(
      timestampLike.seconds ?? timestampLike._seconds ?? 0,
      timestampLike.nanoseconds ?? timestampLike._nanoseconds ?? 0
    );
  }
  return undefined;
};

/**
 * Compute the Typesense helper fields that need to live on the Firestore
 * event document so the Firestore→Typesense extension can sync them as-is.
 * Returns only the fields that have a defined value.
 */
const _addTypesenseFields = (
  eventData: EventSchema
): Partial<EventSchema> => {
  const out: Partial<EventSchema> = {};

  out.start_seconds = _timestampSeconds(eventData.start);
  out.end_seconds = _timestampSeconds(eventData.end);
  out.promo_starts_at_seconds = _timestampSeconds(eventData.promo_starts_at);

  const start = _timestampValue(eventData.start);
  if (start) out.start = start as unknown as EventSchema["start"];
  const end = _timestampValue(eventData.end);
  if (end) out.end = end as unknown as EventSchema["end"];
  const promoStartsAt = _timestampValue(eventData.promo_starts_at);
  if (promoStartsAt) {
    out.promo_starts_at =
      promoStartsAt as unknown as EventSchema["promo_starts_at"];
  }

  const location =
    _rawCoordinate(eventData.location_raw) ??
    _geoPointCoordinate(eventData.location) ??
    (eventData.bounds
      ? _bboxCenterAndRadius(eventData.bounds).center
      : undefined);
  if (location) {
    out.location = new GeoPoint(
      location.lat,
      location.lng
    ) as unknown as EventSchema["location"];
    out.location_raw = location;
  }

  if (eventData.bounds) {
    const { center, radiusM } = _bboxCenterAndRadius(eventData.bounds);
    // The Firestore→Typesense extension converts Firestore GeoPoints to
    // Typesense geopoint arrays.
    out.bounds_center = new GeoPoint(center.lat, center.lng) as unknown as [
      number,
      number,
    ];
    out.bounds_radius_m = radiusM;
  }

  const promo = _promoRegionCenterAndRadius(eventData.promo_region);
  if (promo) {
    out.promo_region_center = new GeoPoint(
      promo.center.lat,
      promo.center.lng
    ) as unknown as [number, number];
    out.promo_region_radius_m = promo.radiusM;
  }

  const promoRadiusM = _promoRadiusMeters(eventData, promo);
  if (promoRadiusM !== undefined) {
    out.promo_radius_m = promoRadiusM;
  }
  if (location && promoRadiusM !== undefined && promoRadiusM > 0) {
    Object.assign(out, _promoBoundsFromCenterRadius(location, promoRadiusM));
  }

  return _removeUndefinedValues(out);
};

const _getChangedFields = (
  currentData: EventSchema,
  proposedData: Partial<EventSchema>
): Record<string, unknown> => {
  const runtimeGeoPointFields = new Set([
    "location",
    "bounds_center",
    "promo_region_center",
  ]);
  const proposed = _removeUndefinedValues(proposedData) as Record<
    string,
    unknown
  >;
  const changed = Object.entries(
    proposed
  ).filter(([key, proposedValue]) => {
    const currentValue = (currentData as unknown as Record<string, unknown>)[
      key
    ];
    if (
      runtimeGeoPointFields.has(key) &&
      isActualGeoPointValue(proposedValue) &&
      !isActualGeoPointValue(currentValue)
    ) {
      return true;
    }
    return !_areValuesEqual(currentValue, proposedValue);
  });
  const out = Object.fromEntries(changed) as Record<string, unknown>;

  const current = currentData as unknown as Record<string, unknown>;
  for (const field of TYPESENSE_HELPER_FIELDS) {
    if (field in proposed) continue;
    if (current[field] !== undefined) {
      out[field] = admin.firestore.FieldValue.delete();
    }
  }

  return out;
};

/**
 * Maintain the Typesense helper fields on every event write. The Firestore
 * → Typesense Firebase Extension then syncs the event document verbatim,
 * including these derived fields. Loop-safe: only writes back when at
 * least one derived field would change.
 */
export const updateEventFieldsOnWrite = onDocumentWritten(
  { document: "events/{eventId}" },
  async (event) => {
    if (!event.data?.after?.exists) return null;
    if (!isEventRuntimeDoc(String(event.params.eventId ?? ""))) return null;

    const afterData = event.data.after.data() as EventSchema | undefined;
    if (!afterData) return null;

    const derived = _addTypesenseFields(afterData);
    const changed = _getChangedFields(afterData, derived);
    if (Object.keys(changed).length === 0) return null;

    return event.data.after.ref.update(changed);
  }
);

/**
 * Keep the public RSVP aggregate on the event while individual RSVP docs stay
 * in `/events/{eventId}/rsvps/{userId}` with privacy-focused rules.
 */
export const countEventRsvpsOnWrite = onDocumentWritten(
  { document: "events/{eventId}/rsvps/{userId}" },
  async (event) => {
    const eventId = String(event.params.eventId ?? "");
    if (!isEventRuntimeDoc(eventId)) return null;

    const snapshot = await admin
      .firestore()
      .collection("events")
      .doc(eventId)
      .collection("rsvps")
      .get();

    const counts: EventRSVPCountsSchema = {
      going: 0,
      interested: 0,
      notgoing: 0,
      total: 0,
    };

    for (const doc of snapshot.docs) {
      const rsvp = (doc.data() as EventRSVPSchema).rsvp;
      if (rsvp !== "going" && rsvp !== "interested" && rsvp !== "notgoing") {
        continue;
      }
      counts[rsvp] += 1;
      counts.total += 1;
    }

    return admin.firestore().collection("events").doc(eventId).update({
      rsvp_counts: counts,
    });
  }
);

/**
 * Backfill helper. Create a doc at
 * `maintenance/run-backfill-event-typesense-fields` (any contents) to
 * recompute the Typesense fields on every event in the database. The doc
 * is deleted on completion so a future create re-triggers the job.
 */
export const updateAllEventsWithTypesenseFields = onDocumentCreated(
  { document: RUN_BACKFILL_EVENT_TYPESENSE_DOC, timeoutSeconds: 540 },
  async (event) => {
    const events = await admin.firestore().collection("events").get();

    for (const doc of events.docs) {
      if (!isEventRuntimeDoc(doc.id)) continue;

      const eventData = doc.data() as EventSchema;
      const derived = _addTypesenseFields(eventData);
      const changed = _getChangedFields(eventData, derived);

      if (Object.keys(changed).length > 0) {
        await doc.ref.update(changed);
      }
    }

    return event.data?.ref.delete();
  }
);
