import type { Firestore } from "firebase-admin/firestore";
import { entityPlaceKey, placeNamesMatch, publicPlaceNames, type EntityPlaceNames, type PlaceNameSource } from "../../src/scripts/EntityPlaceNames";
import { enrichPlaceNames, placeFingerprint } from "./communityPlaceNames";

/** Communities and entity lookups reuse the same public town-name result. */
export async function enrichSharedPlace(db: Firestore, page: PlaceNameSource, username: string) {
  const input = { countryCode: page.geography.countryCode, locality: page.geography.localityName,
    lat: page.bounds_center?.[0], lng: page.bounds_center?.[1] };
  const key = entityPlaceKey(input);
  const ref = key ? db.doc(`place_names/${key}`) : undefined;
  const cached = (await ref?.get())?.data() as EntityPlaceNames | undefined;
  if (cached?.source === "geonames" && placeNamesMatch(cached, input)) {
    return { source: "geonames" as const, geonamesId: cached.geonamesId, center: cached.center,
      names: cached.names, fingerprint: placeFingerprint(page), updatedAtMs: Date.now() };
  }
  const result = await enrichPlaceNames(page, username);
  if (result && ref && key) await ref.set(publicPlaceNames(key, result));
  return result;
}
