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

const MAINTENANCE_COLLECTION = "maintenance";
const RUN_BACKFILL_EVENT_TYPESENSE_DOC = `${MAINTENANCE_COLLECTION}/run-backfill-event-typesense-fields`;

/**
 * Skip non-runtime docs that share the events collection space (the
 * Firestore→Typesense Firebase Extension uses a `typesense/` settings doc;
 * maintenance sentinels use `run-…` ids). Keeps backfill + write triggers
 * from acting on those.
 */
const isEventRuntimeDoc = (docId: string): boolean =>
  docId !== "typesense" && !docId.startsWith("run-");

const isGeoPointValue = (value: unknown): value is GeoPoint => {
  if (value instanceof GeoPoint) return true;

  const adminGeoPointCtor = (
    admin.firestore as unknown as { GeoPoint?: typeof GeoPoint }
  ).GeoPoint;
  if (
    typeof adminGeoPointCtor === "function" &&
    value instanceof adminGeoPointCtor
  ) {
    return true;
  }

  return Boolean(
    value &&
      typeof value === "object" &&
      typeof (value as { latitude?: unknown }).latitude === "number" &&
      typeof (value as { longitude?: unknown }).longitude === "number"
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

const _timestampSeconds = (value: unknown): number | undefined => {
  if (!value) return undefined;
  if (value instanceof Timestamp) return value.seconds;
  if (
    typeof value === "object" &&
    typeof (value as { seconds?: unknown }).seconds === "number"
  ) {
    return (value as { seconds: number }).seconds;
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

  if (eventData.bounds) {
    const { center, radiusM } = _bboxCenterAndRadius(eventData.bounds);
    // The Firebase Extension only converts `GeoPoint` values to Typesense
    // geopoints, so we *must* write a GeoPoint at runtime even though the
    // TS type is `[lat, lng]`. Matches the spot indexer's approach.
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

  return _removeUndefinedValues(out);
};

const _getChangedFields = (
  currentData: EventSchema,
  proposedData: Partial<EventSchema>
): Partial<EventSchema> => {
  const changed = Object.entries(
    _removeUndefinedValues(proposedData) as Record<string, unknown>
  ).filter(([key, proposedValue]) => {
    const currentValue = (currentData as unknown as Record<string, unknown>)[
      key
    ];
    return !_areValuesEqual(currentValue, proposedValue);
  });
  return Object.fromEntries(changed) as Partial<EventSchema>;
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
