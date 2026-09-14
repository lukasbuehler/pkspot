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
import { entityPlaceKey, entityPlaceSource, publicPlaceNames, type EntityPlaceInput } from "../../src/scripts/EntityPlaceNames";
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

export const queueSpotPlaceNames = onDocumentWritten({ document: "spots/{id}", region: "europe-west1" }, async (event) => {
  const data = event.data?.after.data() as SpotSchema | undefined;
  const before = event.data?.before.data() as SpotSchema | undefined;
  if (data && (!before || entityPlaceKey(spotPlaceInput(before)) !== entityPlaceKey(spotPlaceInput(data))))
    await queueEntityPlace(admin.firestore(), spotPlaceInput(data));
});
export const queueEventPlaceNames = onDocumentWritten({ document: "events/{id}", region: "europe-west1" }, async (event) => {
  const data = event.data?.after.data() as EventSchema | undefined;
  const before = event.data?.before.data() as EventSchema | undefined;
  const input = data && eventPlaceInput(data);
  const previous = before && eventPlaceInput(before);
  if (input && (!previous || entityPlaceKey(previous) !== entityPlaceKey(input)))
    await queueEntityPlace(admin.firestore(), input);
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
  for (const doc of docs.docs) {
    const input = collection === "spots" ? spotPlaceInput(doc.data() as SpotSchema) : eventPlaceInput(doc.data() as EventSchema);
    if (await queueEntityPlace(admin.firestore(), input)) queued++;
  }
  return { queued, scanned: docs.size, nextCursor: docs.size === 50 ? docs.docs[docs.size - 1].id : null };
});
