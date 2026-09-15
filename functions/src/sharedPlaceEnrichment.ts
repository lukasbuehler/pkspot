import type { Firestore } from "firebase-admin/firestore";
import { entityPlaceKey, placeNamesMatch, publicPlaceNames, type EntityPlaceNames, type PlaceNameSource } from "../../src/scripts/EntityPlaceNames";
import { enrichPlaceNames, placeFingerprint } from "./communityPlaceNames";
import type { CommunityPlaceLocalization, CommunityRegionLocalization } from "../../src/db/schemas/CommunityPageSchema";
import { enrichRegionNames } from "./regionPlaceNames";

/** Communities and entity lookups reuse the same public town-name result. */
export async function enrichSharedPlace(db: Firestore, page: PlaceNameSource, username: string) {
  if (page.scope === "region") {
    const result = await enrichPlaceNames(page, username);
    return result ? { ...result, version: 2 as const } : null;
  }
  const input = { countryCode: page.geography.countryCode, locality: page.geography.localityName,
    lat: page.bounds_center?.[0], lng: page.bounds_center?.[1] };
  const key = entityPlaceKey(input);
  const ref = key ? db.doc(`place_names/${key}`) : undefined;
  const cached = (await ref?.get())?.data() as EntityPlaceNames | undefined;
  const reusable = cached?.source === "geonames" && placeNamesMatch(cached, input) ? cached
    : key && page.place_localization?.fingerprint === placeFingerprint(page) &&
      placeNamesMatch(publicPlaceNames(key, page.place_localization), input) ? page.place_localization : undefined;
  let result: CommunityPlaceLocalization | null = reusable
    ? { source: "geonames", geonamesId: reusable.geonamesId, names: reusable.names,
        ...(reusable.center ? { center: reusable.center } : {}),
        ...(reusable.version ? { version: reusable.version } : {}),
        ...(reusable.region ? { region: reusable.region } : {}),
        fingerprint: placeFingerprint(page), updatedAtMs: Date.now() }
    : await enrichPlaceNames(page, username);
  if (result && result.version !== 2) {
    const region = await enrichRegionNames(result.geonamesId, page.geography.countryCode!.toUpperCase(), username, {
      get: async (id) => (await db.doc(`region_place_names/${id}`).get()).data() as CommunityRegionLocalization | undefined,
      set: async (value) => { await db.doc(`region_place_names/${value.geonamesId}`).set(value); },
    });
    result = { ...result, version: 2, ...(region ? { region } : {}) };
  }
  if (result && ref && key) await ref.set(publicPlaceNames(key, result));
  return result;
}
