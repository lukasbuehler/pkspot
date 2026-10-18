import { enrichSharedPlace } from "./sharedPlaceEnrichment";
import * as admin from "firebase-admin";
import { FieldPath } from "firebase-admin/firestore";
import { defineString } from "firebase-functions/params";
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { info } from "firebase-functions/logger";
import type { SpotSchema } from "../../src/db/schemas/SpotSchema";
import type { EventSchema } from "../../src/db/schemas/EventSchema";
import type { CommunityPageSchema } from "../../src/db/schemas/CommunityPageSchema";
import { entityPlaceKey, entityPlaceSource, placeNamesMatch, publicPlaceNames, type EntityPlaceInput, type EntityPlaceNames } from "../../src/scripts/EntityPlaceNames";
import { localizedSearchNames, placeLabelNames, samePlaceFields, type PlaceLabelNames } from "../../src/scripts/LocalizedPlaceLabels";
import { enqueueCommunityPlace, processCommunityPlaces } from "./communityPlaceLocalizationStore";

const store = { pages: "place_name_sources", queue: "place_name_jobs" };
const username = defineString("GEONAMES_USERNAME", { default: "" });

export function spotPlaceInput(spot: SpotSchema): EntityPlaceInput {
  return { countryCode: spot.address?.country?.code, locality: spot.address?.locality,
    lat: spot.location_raw?.lat ?? spot.location?.latitude,
    lng: spot.location_raw?.lng ?? spot.location?.longitude };
}
export function eventPlaceInput(event: EventSchema): EntityPlaceInput | undefined {
  if (!(event.publication_state === "published" || (event.publication_state === undefined && event.published)) ||
    (event.visibility ?? "public") !== "public" || event.listing_tier === "community" ||
    event.viewer_policy !== undefined) return undefined;
  return { countryCode: event.country_code, locality: event.locality_string,
    lat: event.location_raw?.lat ?? event.location?.latitude,
    lng: event.location_raw?.lng ?? event.location?.longitude };
}

export async function queueEntityPlace(db: admin.firestore.Firestore, input: EntityPlaceInput | undefined): Promise<boolean> {
  const source = input && entityPlaceSource(input);
  if (!source) return false;
  const ref = db.collection(store.pages).doc(source.communityKey);
  // One source and job per lookup key, regardless of how many entities use it.
  await db.runTransaction(async (tx) => {
    if (!(await tx.get(ref)).exists) tx.create(ref, source);
  });
  return enqueueCommunityPlace(db, source.communityKey, false, store);
}

type PlacedEntity = Pick<SpotSchema, "place_key" | "place_names" | "localized_search_names">;
type PlaceCollection = "spots" | "events";

function placeInputFor(collection: PlaceCollection, data: unknown): EntityPlaceInput | undefined {
  return collection === "spots" ? spotPlaceInput(data as SpotSchema) : eventPlaceInput(data as EventSchema);
}

/**
 * The server-owned place fields an entity should carry: its lookup key, the
 * cached localized names when they match its location, and every spelling
 * search should match. Private Events and unplaceable entities carry none.
 */
export function entityPlaceFields(
  collection: PlaceCollection,
  data: unknown,
  cached: EntityPlaceNames | undefined,
): { place_key: string; place_names?: PlaceLabelNames; localized_search_names: string[] } | null {
  const input = placeInputFor(collection, data);
  const key = input && entityPlaceKey(input);
  if (!input || !key) return null;
  const names = cached && placeNamesMatch(cached, input) ? placeLabelNames(cached) : undefined;
  const region = collection === "spots" ? (data as SpotSchema).address?.region?.name : undefined;
  return {
    place_key: key,
    place_names: names,
    localized_search_names: localizedSearchNames({
      locality: input.locality, region, countryCode: input.countryCode, names,
    }),
  };
}

/**
 * Brings one Spot or Event in line with the cached names. Writes only when a
 * field changes, so the write it causes does not trigger another one.
 * Returns whether names are still missing and need a provider lookup.
 */
export async function syncEntityPlace(
  db: admin.firestore.Firestore,
  ref: admin.firestore.DocumentReference,
  collection: PlaceCollection,
  data: unknown,
  cached?: EntityPlaceNames | null,
): Promise<{ written: boolean; missingNames: boolean }> {
  const input = placeInputFor(collection, data);
  const key = input && entityPlaceKey(input);
  const names = cached !== undefined ? cached ?? undefined
    : key ? (await db.doc(`place_names/${key}`).get()).data() as EntityPlaceNames | undefined : undefined;
  const desired = entityPlaceFields(collection, data, names);
  const current = data as PlacedEntity;
  const remove = admin.firestore.FieldValue.delete();
  const update: Record<string, unknown> = {};
  for (const field of ["place_key", "place_names", "localized_search_names"] as const) {
    const value = desired?.[field];
    if (samePlaceFields(current[field], value)) continue;
    update[field] = value === undefined ? remove : value;
  }
  if (Object.keys(update).length) await ref.update(update);
  return { written: Object.keys(update).length > 0, missingNames: !!desired && !desired.place_names };
}

async function onPlacedEntityWritten(collection: PlaceCollection, event: Parameters<Parameters<typeof onDocumentWritten>[1]>[0]) {
  const data = event.data?.after.data();
  if (!data || !event.data?.after.ref) return;
  const stored = data as PlacedEntity;
  const input = placeInputFor(collection, data);
  const key = input ? entityPlaceKey(input) : undefined;
  // An unchanged place gets new names through `applyEntityPlaceNames` instead,
  // so most writes (ratings, activity, media) cost nothing here.
  if (stored.place_key === key && (key || (!stored.place_names && !stored.localized_search_names))) return;
  const { missingNames } = await syncEntityPlace(admin.firestore(), event.data.after.ref, collection, data);
  if (missingNames) await queueEntityPlace(admin.firestore(), input);
}

export const queueSpotPlaceNames = onDocumentWritten({ document: "spots/{id}", region: "europe-west1" },
  (event) => onPlacedEntityWritten("spots", event));
export const queueEventPlaceNames = onDocumentWritten({ document: "events/{id}", region: "europe-west1" },
  (event) => onPlacedEntityWritten("events", event));

/** Upper bound for one fan-out; a town with more entities finishes on the next name update. */
const MAX_FAN_OUT = 5_000;

/**
 * When a town's names are published or updated, copy them onto every Spot and
 * public Event at that place. Entities are found by their stored `place_key`,
 * so this never scans whole collections.
 */
export async function applyPlaceNamesToEntities(
  db: admin.firestore.Firestore,
  key: string,
  names: EntityPlaceNames | null,
): Promise<number> {
  let written = 0;
  for (const collection of ["spots", "events"] as const) {
    let cursor: admin.firestore.QueryDocumentSnapshot | undefined;
    for (let scanned = 0; scanned < MAX_FAN_OUT;) {
      let query = db.collection(collection).where("place_key", "==", key).orderBy(FieldPath.documentId()).limit(200);
      if (cursor) query = query.startAfter(cursor);
      const page = await query.get();
      for (const doc of page.docs) {
        if ((await syncEntityPlace(db, doc.ref, collection, doc.data(), names)).written) written++;
      }
      scanned += page.size;
      if (page.size < 200) break;
      cursor = page.docs[page.size - 1];
    }
  }
  return written;
}

export const applyEntityPlaceNames = onDocumentWritten({ document: "place_names/{key}", region: "europe-west1", timeoutSeconds: 540 }, async (event) => {
  const after = event.data?.after.data() as EntityPlaceNames | undefined;
  const before = event.data?.before.data() as EntityPlaceNames | undefined;
  if (after && before && samePlaceFields(placeLabelNames(after), placeLabelNames(before)) &&
    samePlaceFields(after.center, before.center)) return;
  const written = await applyPlaceNamesToEntities(admin.firestore(), event.params.key, after ?? null);
  info("Applied place names", { key: event.params.key, written });
});
export const enrichEntityPlaceNames = onSchedule({ schedule: "every 60 minutes", region: "europe-west1", timeoutSeconds: 540, maxInstances: 1 }, async () => {
  if (!username.value()) return;
  info("Entity place localization batch", await processCommunityPlaces(admin.firestore(), (page) => enrichSharedPlace(admin.firestore(), page, username.value()), store));
});
export const publishEntityPlaceNames = onDocumentWritten({ document: "place_name_sources/{key}", region: "europe-west1" }, async (event) => {
  const page = event.data?.after.data() as CommunityPageSchema | undefined;
  if (!page?.place_localization) return;
  // Publish names only. Lookup coordinates, jobs and source metadata stay private.
  await admin.firestore().doc(`place_names/${event.params.key}`).set(publicPlaceNames(event.params.key, page.place_localization));
});
export const backfillEntityPlaceNames = onCall({ region: "europe-west1", enforceAppCheck: true, timeoutSeconds: 120 }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in first.");
  if ((await admin.firestore().doc(`users/${request.auth.uid}`).get()).data()?.is_admin !== true) throw new HttpsError("permission-denied", "Admin access required.");
  const collection: unknown = request.data?.collection;
  const cursor: unknown = request.data?.startAfter;
  if ((collection !== "spots" && collection !== "events") || (cursor !== undefined && (typeof cursor !== "string" || cursor.length > 200 || cursor.includes("/")))) throw new HttpsError("invalid-argument", "Invalid collection or cursor.");
  let query = admin.firestore().collection(collection).orderBy(FieldPath.documentId()).limit(50);
  if (cursor) query = query.startAfter(cursor);
  const docs = await query.get();
  let queued = 0;
  let updated = 0;
  // Reuse cached names first; only places without names are queued for a lookup.
  const cache = new Map<string, EntityPlaceNames | null>();
  for (const doc of docs.docs) {
    const input = placeInputFor(collection, doc.data());
    const key = input && entityPlaceKey(input);
    if (key && !cache.has(key)) {
      cache.set(key, ((await admin.firestore().doc(`place_names/${key}`).get()).data() as EntityPlaceNames | undefined) ?? null);
    }
    const result = await syncEntityPlace(admin.firestore(), doc.ref, collection, doc.data(), key ? cache.get(key) : null);
    if (result.written) updated++;
    if (result.missingNames && await queueEntityPlace(admin.firestore(), input)) queued++;
  }
  return { queued, updated, scanned: docs.size, nextCursor: docs.size === 50 ? docs.docs[docs.size - 1].id : null };
});
