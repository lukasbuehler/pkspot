import { FieldValue, GeoPoint, Timestamp } from "firebase-admin/firestore";
import {
  onDocumentCreated,
  onDocumentWritten,
} from "firebase-functions/v2/firestore";
import * as admin from "firebase-admin";

import { SpotSchema } from "./spotHelpers";
import {
  parseStorageMediaUrl,
  buildStorageMediaUrl,
  getMediaPreviewImageUrl,
} from "../../src/db/schemas/Media";
import {
  RESERVED_SPOT_SLUGS,
  deriveSpotCommunityData,
} from "../../src/scripts/SpotLandingHelpers";

import { googleAPIKey } from "./secrets";
import { getAddressAndLocaleFromGeopoint } from "./spotAddressFunctions";
import { calculateBoundsData } from "./boundsHelpers";

const isEmulatorEnvironment =
  process.env.FUNCTIONS_EMULATOR === "true" ||
  !!process.env.FIRESTORE_EMULATOR_HOST;
const geocodeTriggerSecrets = isEmulatorEnvironment ? [] : [googleAPIKey];
const MAINTENANCE_COLLECTION = "maintenance";
const RUN_BACKFILL_TYPESENSE_DOC = `${MAINTENANCE_COLLECTION}/run-backfill-typesense-fields`;
const RUN_BACKFILL_LANDING_DOC = `${MAINTENANCE_COLLECTION}/run-backfill-landing`;
const RUN_AUDIT_RESERVED_SLUGS_DOC = `${MAINTENANCE_COLLECTION}/run-audit-reserved-slugs`;
const RUN_DETECT_DUPLICATE_SPOTS_DOC = `${MAINTENANCE_COLLECTION}/run-detect-duplicate-spots`;
const DUPLICATE_SPOT_RADIUS_METERS = 5;
const isSpotRuntimeDoc = (docId: string): boolean =>
  docId !== "typesense" && !docId.startsWith("run-");

const isGeoPointValue = (value: unknown): value is GeoPoint => {
  if (value instanceof GeoPoint) {
    return true;
  }

  const adminGeoPointCtor = (
    admin.firestore as unknown as {
      GeoPoint?: typeof GeoPoint;
    }
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
    typeof (value as { longitude?: unknown }).longitude === "number",
  );
};

const _removeUndefinedValues = <T>(value: T): T => {
  if (Array.isArray(value)) {
    return value
      .map((entry) => _removeUndefinedValues(entry))
      .filter((entry) => entry !== undefined) as T;
  }

  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, entryValue]) => entryValue !== undefined)
      .map(([entryKey, entryValue]) => [
        entryKey,
        _removeUndefinedValues(entryValue),
      ]);

    return Object.fromEntries(entries) as T;
  }

  return value;
};

const _normalizeComparableValue = (value: unknown): unknown => {
  if (isGeoPointValue(value)) {
    return {
      latitude: value.latitude,
      longitude: value.longitude,
    };
  }

  if (Array.isArray(value)) {
    return value.map((entry) => _normalizeComparableValue(entry));
  }

  if (value && typeof value === "object") {
    const normalizedEntries = Object.entries(value as Record<string, unknown>)
      .filter(([, entryValue]) => entryValue !== undefined)
      .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
      .map(([entryKey, entryValue]) => [
        entryKey,
        _normalizeComparableValue(entryValue),
      ]);

    return Object.fromEntries(normalizedEntries);
  }

  return value;
};

const _areValuesEqual = (left: unknown, right: unknown): boolean => {
  return (
    JSON.stringify(_normalizeComparableValue(left)) ===
    JSON.stringify(_normalizeComparableValue(right))
  );
};

const _toRadians = (degrees: number): number => (degrees * Math.PI) / 180;

const _getDistanceMeters = (
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
): number => {
  const earthRadiusMeters = 6371000;
  const dLat = _toRadians(to.lat - from.lat);
  const dLng = _toRadians(to.lng - from.lng);
  const fromLat = _toRadians(from.lat);
  const toLat = _toRadians(to.lat);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(fromLat) *
      Math.cos(toLat) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);

  return earthRadiusMeters * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const _getLocationLiteral = (
  spotData: Partial<SpotSchema>,
): { lat: number; lng: number } | null => {
  if (isGeoPointValue(spotData.location)) {
    return {
      lat: spotData.location.latitude,
      lng: spotData.location.longitude,
    };
  }

  if (
    spotData.location_raw &&
    Number.isFinite(spotData.location_raw.lat) &&
    Number.isFinite(spotData.location_raw.lng)
  ) {
    return {
      lat: spotData.location_raw.lat,
      lng: spotData.location_raw.lng,
    };
  }

  return null;
};

const _getSpotNameForDuplicateFlag = (
  spotData: Partial<SpotSchema>,
): string | undefined => {
  const name = spotData.name;
  if (!name) return undefined;

  const firstName = Object.values(name)[0];
  if (typeof firstName === "string") return firstName;
  if (firstName && typeof firstName === "object" && "text" in firstName) {
    const text = (firstName as { text?: unknown }).text;
    return typeof text === "string" ? text : undefined;
  }

  return undefined;
};

const _makeDuplicateCheck = (
  candidates: {
    spot_id: string;
    distance_m: number;
    name?: string;
  }[],
): NonNullable<SpotSchema["duplicate_check"]> => ({
  status: candidates.length > 0 ? "possible_duplicate" : "clear",
  radius_m: DUPLICATE_SPOT_RADIUS_METERS,
  checked_at: Timestamp.now(),
  ...(candidates.length > 0 ? { candidates } : {}),
});

const _findNearbyDuplicateCandidates = async (
  spotId: string,
  spotData: SpotSchema,
): Promise<NonNullable<SpotSchema["duplicate_check"]>> => {
  const location = _getLocationLiteral(spotData);
  const z16Tile = spotData.tile_coordinates?.z16;

  if (!location || !z16Tile) {
    return _makeDuplicateCheck([]);
  }

  const candidateDocs = await Promise.all(
    [-1, 0, 1].flatMap((xOffset) =>
      [-1, 0, 1].map((yOffset) =>
        admin
          .firestore()
          .collection("spots")
          .where("tile_coordinates.z16.x", "==", z16Tile.x + xOffset)
          .where("tile_coordinates.z16.y", "==", z16Tile.y + yOffset)
          .get(),
      ),
    ),
  );

  const candidates = new Map<
    string,
    { spot_id: string; distance_m: number; name?: string }
  >();

  candidateDocs
    .flatMap((snapshot) => snapshot.docs)
    .forEach((doc) => {
      if (doc.id === spotId || !isSpotRuntimeDoc(doc.id)) return;

      const candidateData = doc.data() as SpotSchema;
      const candidateLocation = _getLocationLiteral(candidateData);
      if (!candidateLocation) return;

      const distanceMeters = _getDistanceMeters(location, candidateLocation);
      if (distanceMeters > DUPLICATE_SPOT_RADIUS_METERS) return;

      candidates.set(doc.id, {
        spot_id: doc.id,
        distance_m: Math.round(distanceMeters * 10) / 10,
        name: _getSpotNameForDuplicateFlag(candidateData),
      });
    });

  return _makeDuplicateCheck(
    Array.from(candidates.values()).sort(
      (left, right) => left.distance_m - right.distance_m,
    ),
  );
};

const _getChangedFields = (
  currentData: SpotSchema,
  proposedData: Partial<SpotSchema>,
): Partial<SpotSchema> => {
  const changedEntries = Object.entries(
    _removeUndefinedValues(proposedData) as Record<string, unknown>,
  ).filter(([fieldPath, proposedValue]) => {
    const currentValue = (currentData as unknown as Record<string, unknown>)[
      fieldPath
    ];
    return !_areValuesEqual(currentValue, proposedValue);
  });

  return Object.fromEntries(changedEntries) as Partial<SpotSchema>;
};

const _addTypesenseFields = (spotData: SpotSchema): Partial<SpotSchema> => {
  const spotDataToUpdate: Partial<SpotSchema> = {};

  //// 2. Write an array of amenities for typesense to filter: `amenities_true`, `amenities_false`
  if (spotData.amenities && Object.keys(spotData.amenities).length > 0) {
    // build an array of string values for all the amenities that are true and one for all false
    const amenitiesTrue: string[] = [];
    const amenitiesFalse: string[] = [];
    Object.entries(spotData.amenities).forEach(([key, value]) => {
      if (value === true) {
        amenitiesTrue.push(key);
      } else if (value === false) {
        amenitiesFalse.push(key);
      }
      // otherwise the amenity is null or undefined or not set which represents unknown.
    });
    spotDataToUpdate.amenities_true = amenitiesTrue;
    spotDataToUpdate.amenities_false = amenitiesFalse;
  }

  //// 3. Write `thumbnail_small_url` and `thumbnail_medium_url` for typesense to use.
  if (
    spotData.media &&
    Array.isArray(spotData.media) &&
    spotData.media.length > 0
  ) {
    const firstMediaItem = spotData.media.find(
      (mediaSchema) => mediaSchema.type === "image",
    );

    // use the storage media utilities to get the thumbnail URL from the media schema
    if (firstMediaItem) {
      try {
        if (firstMediaItem.isInStorage) {
          const parsed = parseStorageMediaUrl(firstMediaItem.src);
          spotDataToUpdate.thumbnail_small_url = buildStorageMediaUrl(
            parsed,
            undefined,
            `_200x200`,
          );
          spotDataToUpdate.thumbnail_medium_url = buildStorageMediaUrl(
            parsed,
            undefined,
            `_400x400`,
          );
        } else {
          // External images have no resized variants. Reuse the source URL so
          // image-based Typesense filters still include these spots.
          const previewSrc = getMediaPreviewImageUrl(firstMediaItem);
          if (previewSrc) {
            spotDataToUpdate.thumbnail_small_url = previewSrc;
            spotDataToUpdate.thumbnail_medium_url = previewSrc;
          }
        }
      } catch (e) {
        console.error("Error generating thumbnail URLs for spot:", e);
      }
    }
  }

  //// 4. name_search

  if (spotData.name && Object.keys(spotData.name).length > 0) {
    const nameSearch: string[] = [];
    Object.values(spotData.name).forEach((nameMap) => {
      if (typeof nameMap === "string") {
        nameSearch.push(nameMap);
      } else if ("text" in nameMap) {
        nameSearch.push(nameMap.text);
      }
    });
    spotDataToUpdate.name_search = nameSearch;
  }

  //// 5. description_search

  if (spotData.description && Object.keys(spotData.description).length > 0) {
    const descriptionSearch: string[] = [];
    Object.values(spotData.description).forEach((descriptionMap) => {
      if (typeof descriptionMap === "string") {
        descriptionSearch.push(descriptionMap);
      } else if ("text" in descriptionMap) {
        descriptionSearch.push(descriptionMap.text);
      }
    });
    spotDataToUpdate.description_search = descriptionSearch;
  }

  //// 6. Set rating to zero if not set
  if (spotData.rating === undefined || spotData.rating === null) {
    spotDataToUpdate.rating = 0;
  }

  if (spotData.num_reviews === undefined || spotData.num_reviews === null) {
    spotDataToUpdate.num_reviews = 0;
  }

  //// 8. Landing page helper fields
  const communityData = deriveSpotCommunityData(spotData);
  if (communityData) {
    spotDataToUpdate.landing = communityData;
  }

  //// 9. Serialize bounds for Typesense proximity queries and mobile compatibility
  const boundsResult = calculateBoundsData(spotData.bounds);

  if (boundsResult.boundsRaw && boundsResult.boundsRaw.length >= 3) {
    // Always store bounds_raw for mobile (Capacitor can't handle GeoPoints)
    // This is an array of {lat, lng} objects - NOT a nested array, so Firestore accepts it
    spotDataToUpdate.bounds_raw = boundsResult.boundsRaw;

    // Note: We do NOT overwrite spotData.bounds here!
    // The original bounds array of GeoPoints is already in Firestore.
    // The Firebase Extension will sync the GeoPoints to Typesense, which converts them.

    if (boundsResult.isValid) {
      // Bounds are valid and within size limit
      // IMPORTANT: bounds_center must be a GeoPoint, not a plain array!
      // The Firebase Extension only converts GeoPoint objects to Typesense geopoints.
      const [centerLat, centerLng] = boundsResult.boundsCenter!;
      spotDataToUpdate.bounds_center = new GeoPoint(
        centerLat,
        centerLng,
      ) as any;
      spotDataToUpdate.bounds_radius_m = boundsResult.boundsRadiusM!;
    } else {
      // Bounds too large - log warning and clear proximity fields
      console.warn(`Spot bounds: ${boundsResult.error}`);
      spotDataToUpdate.bounds_center = undefined as any;
      spotDataToUpdate.bounds_radius_m = undefined;
    }
  }

  //// Return the fields to update

  return _removeUndefinedValues(spotDataToUpdate);
};

const _hasUsableAddress = (address: SpotSchema["address"]): boolean => {
  if (!address) return false;
  return Boolean(
    (typeof address.formatted === "string" && address.formatted.trim()) ||
    (typeof address.formattedLocal === "string" &&
      address.formattedLocal.trim()) ||
    (typeof address.locality === "string" && address.locality.trim()) ||
    (typeof address.localityLocal === "string" &&
      address.localityLocal.trim()) ||
    (typeof address.sublocality === "string" && address.sublocality.trim()) ||
    (typeof address.sublocalityLocal === "string" &&
      address.sublocalityLocal.trim()) ||
    (typeof address.region?.name === "string" && address.region.name.trim()) ||
    (typeof address.region?.localName === "string" &&
      address.region.localName.trim()) ||
    (address.country?.code && address.country?.name),
  );
};

/**
 * Update the spot fields when a spot is written. This is needed for the
 * things like fetching the address of a spot from reverse geocoding and
 * things like writing an array for typesense to filter the amenities.
 */
export const updateSpotFieldsOnWrite = onDocumentWritten(
  { document: "spots/{spotId}", secrets: geocodeTriggerSecrets },
  async (event) => {
    if (!event.data?.after?.exists) {
      // Ignore deletes.
      return null;
    }

    if (!isSpotRuntimeDoc(String(event.params.spotId ?? ""))) {
      return null;
    }

    const apiKey: string = isEmulatorEnvironment ? "" : googleAPIKey.value();
    const beforeData = event.data?.before?.data() as SpotSchema;
    const afterData = event.data?.after?.data() as SpotSchema;
    if (!afterData) {
      return null;
    }

    let spotDataToUpdate: Partial<SpotSchema> = {};

    //// 1. Update the address if the location changed OR if there is no address yet.
    // if the location of the spot has changed, call Googles reverse geocoding to get the address.

    // Helper to get a stable comparable string for location
    const getLocStr = (d: SpotSchema) => {
      if (d?.location) return `${d.location.latitude},${d.location.longitude}`;
      if (d?.location_raw) return `${d.location_raw.lat},${d.location_raw.lng}`;
      return null;
    };
    const beforeLoc = getLocStr(beforeData);
    const afterLoc = getLocStr(afterData);

    const locationChanged = beforeLoc !== afterLoc;
    const addressMissingOrIncomplete = !_hasUsableAddress(afterData.address);
    const shouldCheckDuplicates =
      Boolean(afterLoc) && (locationChanged || !afterData.duplicate_check);

    if (
      (locationChanged && afterLoc) ||
      (addressMissingOrIncomplete && afterLoc)
    ) {
      let location: GeoPoint;
      if (afterData.location) {
        location = afterData.location as GeoPoint;
      } else if (afterData.location_raw) {
        location = new GeoPoint(
          afterData.location_raw.lat,
          afterData.location_raw.lng,
        );
      } else {
        // Should not happen due to check above
        return null;
      }

      try {
        const [address, _] = await getAddressAndLocaleFromGeopoint(
          location,
          apiKey,
        );
        // Only write usable address data. Avoid storing empty maps because
        // they block the "missing address" condition on future writes.
        if (_hasUsableAddress(address as SpotSchema["address"])) {
          spotDataToUpdate.address = address as SpotSchema["address"];
        } else {
          console.warn(
            "Skipping empty/incomplete geocoded address for spot",
            event.params.spotId,
          );
        }
      } catch (e) {
        console.error("Error fetching address for spot:", e);
        // Continue and still update derived Typesense fields even if geocoding fails.
      }
    }

    const mergedSpotData = {
      ...afterData,
      ...spotDataToUpdate,
      address: spotDataToUpdate.address ?? afterData.address,
    } as SpotSchema;

    spotDataToUpdate = {
      ...spotDataToUpdate,
      ..._addTypesenseFields(mergedSpotData),
    };

    if (shouldCheckDuplicates) {
      spotDataToUpdate.duplicate_check = await _findNearbyDuplicateCandidates(
        String(event.params.spotId),
        {
          ...mergedSpotData,
          ...spotDataToUpdate,
        } as SpotSchema,
      );
    }

    const changedFields = _getChangedFields(afterData, spotDataToUpdate);

    if (Object.keys(changedFields).length > 0) {
      return event.data?.after?.ref.update(changedFields);
    }
    return null;
  },
);

export const updateAllSpotsWithTypesenseFields = onDocumentCreated(
  { document: RUN_BACKFILL_TYPESENSE_DOC },
  async (event) => {
    // get all spots
    const spots = await admin.firestore().collection("spots").get();

    for (const spot of spots.docs) {
      if (!isSpotRuntimeDoc(spot.id)) {
        continue;
      }

      const spotData = spot.data() as SpotSchema;

      const typesenseFields = _addTypesenseFields(spotData);

      if (Object.keys(typesenseFields).length > 0) {
        await spot.ref.update(typesenseFields);
      }
    }

    // delete the run document
    return event.data?.ref.delete();
  },
);

export const detectDuplicateSpots = onDocumentCreated(
  {
    document: RUN_DETECT_DUPLICATE_SPOTS_DOC,
    timeoutSeconds: 540,
    memory: "1GiB",
  },
  async () => {
    const spots = await admin.firestore().collection("spots").get();
    let batch = admin.firestore().batch();
    let batchSize = 0;
    let checkedCount = 0;
    let flaggedCount = 0;

    for (const spot of spots.docs) {
      if (!isSpotRuntimeDoc(spot.id)) {
        continue;
      }

      const duplicateCheck = await _findNearbyDuplicateCandidates(
        spot.id,
        spot.data() as SpotSchema,
      );

      batch.update(spot.ref, { duplicate_check: duplicateCheck });
      batchSize += 1;
      checkedCount += 1;
      if (duplicateCheck.status === "possible_duplicate") {
        flaggedCount += 1;
      }

      if (batchSize >= 450) {
        await batch.commit();
        batch = admin.firestore().batch();
        batchSize = 0;
      }
    }

    if (batchSize > 0) {
      await batch.commit();
    }

    console.log(
      `Duplicate spot scan completed. Checked ${checkedCount}, flagged ${flaggedCount}.`,
    );
  },
);

export const backfillAllSpotsWithLandingFields = onDocumentCreated(
  { document: RUN_BACKFILL_LANDING_DOC },
  async (event) => {
    const spots = await admin.firestore().collection("spots").get();
    const batchSize = 400;
    let batch = admin.firestore().batch();
    let queuedWrites = 0;
    let updatedCount = 0;

    for (const spot of spots.docs) {
      if (!isSpotRuntimeDoc(spot.id)) {
        continue;
      }

      const derivedFields = _addTypesenseFields(spot.data() as SpotSchema);
      if (Object.keys(derivedFields).length === 0) {
        continue;
      }

      batch.update(spot.ref, derivedFields);
      queuedWrites += 1;
      updatedCount += 1;

      if (queuedWrites >= batchSize) {
        await batch.commit();
        batch = admin.firestore().batch();
        queuedWrites = 0;
      }
    }

    if (queuedWrites > 0) {
      await batch.commit();
    }

    await event.data?.ref.set(
      {
        status: "DONE",
        updated_count: updatedCount,
        completed_at: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  },
);

export const auditReservedSpotSlugs = onDocumentCreated(
  { document: RUN_AUDIT_RESERVED_SLUGS_DOC },
  async (event) => {
    const db = admin.firestore();
    const conflicts: Array<{
      source: "spot_slugs" | "spots";
      slug: string;
      id: string;
    }> = [];

    for (const slug of RESERVED_SPOT_SLUGS) {
      const slugDoc = await db.collection("spot_slugs").doc(slug).get();
      if (slugDoc.exists) {
        conflicts.push({
          source: "spot_slugs",
          slug,
          id: String(slugDoc.data()?.spot_id ?? slugDoc.id),
        });
      }
    }

    const spotDocs = await db
      .collection("spots")
      .where("slug", "in", [...RESERVED_SPOT_SLUGS])
      .get();

    for (const spotDoc of spotDocs.docs) {
      const spotSlug = String((spotDoc.data() as SpotSchema).slug ?? "").trim();
      if (!spotSlug) {
        continue;
      }

      conflicts.push({
        source: "spots",
        slug: spotSlug,
        id: spotDoc.id,
      });
    }

    await event.data?.ref.set(
      {
        status: conflicts.length > 0 ? "FAILED" : "DONE",
        conflicts,
        completed_at: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    if (conflicts.length > 0) {
      throw new Error(
        `Reserved spot slug audit failed with ${conflicts.length} conflict(s).`,
      );
    }
  },
);
