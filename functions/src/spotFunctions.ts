import { GeoPoint } from "firebase-admin/firestore";
import {
  onDocumentCreated,
  onDocumentWritten,
} from "firebase-functions/v2/firestore";
import * as admin from "firebase-admin";

import { SpotSchema } from "./spotHelpers";
import {
  parseStorageMediaUrl,
  buildStorageMediaUrl,
} from "../../src/db/schemas/Media";

import { googleAPIKey } from "./secrets";
import { getAddressAndLocaleFromGeopoint } from "./spotAddressFunctions";

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

  //// 3. Write a `thumbnail_url` for typesense to use.
  const thumbnailSize = 200;
  if (
    spotData.media &&
    Array.isArray(spotData.media) &&
    spotData.media.length > 0
  ) {
    const firstMediaItem = spotData.media.filter(
      (mediaSchema) => mediaSchema.isInStorage && mediaSchema.type === "image"
    )[0];

    // use the storage media utilities to get the thumbnail URL from the media schema
    if (firstMediaItem) {
      try {
        const parsed = parseStorageMediaUrl(firstMediaItem.src);
        spotDataToUpdate.thumbnail_url = buildStorageMediaUrl(
          parsed,
          undefined,
          `_${thumbnailSize}x${thumbnailSize}`
        );
      } catch (e) {
        console.error("Error generating thumbnail URL for spot:", e);
      }
    }
  }

  return spotDataToUpdate;
};

/**
 * Update the spot fields when a spot is written. This is needed for the
 * things like fetching the address of a spot from reverse geocoding and
 * things like writing an array for typesense to filter the amenities.
 */
export const updateSpotFieldsOnWrite = onDocumentWritten(
  { document: "spots/{spotId}", secrets: [googleAPIKey] },
  async (event) => {
    const apiKey: string = googleAPIKey.value();
    const beforeData = event.data?.before?.data() as SpotSchema;
    const afterData = event.data?.after?.data() as SpotSchema;

    let spotDataToUpdate: Partial<SpotSchema> = {};

    //// 1. Update the address if the location changed
    // if the location of the spot has changed, call Googles reverse geocoding to get the address.
    if (!(beforeData.location as GeoPoint).isEqual(afterData.location)) {
      const location = afterData.location as GeoPoint;

      try {
        const [address, _] = await getAddressAndLocaleFromGeopoint(
          location,
          apiKey
        );
        // update the spot address on the spot document
        spotDataToUpdate.address = address;
      } catch (e) {
        console.error("Error fetching address for spot:", e);
        return null;
      }
    }

    spotDataToUpdate = {
      ...spotDataToUpdate,
      ..._addTypesenseFields(afterData),
    };

    return event.data?.after?.ref.update(spotDataToUpdate);
  }
);

export const updateAllSpotsWithTypesenseFields = onDocumentCreated(
  { document: "spots/typesense" },
  async (event) => {
    const spots = await admin.firestore().collection("spots").get();

    for (const spot of spots.docs) {
      const spotData = spot.data() as SpotSchema;

      const typesenseFields = _addTypesenseFields(spotData);

      if (Object.keys(typesenseFields).length > 0) {
        await spot.ref.update(typesenseFields);
      }
    }

    // delete the run document
    return event.data?.ref.delete();
  }
);
