import { GeoPoint } from "firebase-admin/firestore";
import * as admin from "firebase-admin";
import {
  onDocumentCreated,
  onDocumentWritten,
} from "firebase-functions/v2/firestore";

import { googleAPIKey } from "./secrets";
import { SpotSchema } from "./spotHelpers";
import { SpotReviewSchema } from "../../src/db/schemas/SpotReviewSchema";
import { LocaleCode } from "../../src/db/models/Interfaces";

type AddressType = {
  sublocality?: string;
  locality?: string;
  country?: {
    code: string; // alpha 2
    name: string;
  };
  formatted?: string;
};

type AddressAPIResultType = {
  address_components: {
    long_name: string;
    short_name: string;
    types: string[];
  }[];
  formatted_address: string;
  geometry: any;
  place_id: string;
};

const updateSpotAddressFromLocation = async (
  location: GeoPoint,
  apiKey: string
): Promise<[AddressType, LocaleCode[]]> => {
  if (!location || !location.latitude || !location.longitude) {
    return Promise.reject("Location is invalid");
  }
  if (!apiKey) {
    return Promise.reject("Google API Key is missing");
  }

  const lat = location.latitude;
  const lng = location.longitude;

  const response = await fetch(
    `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${apiKey}&` +
      `result_type=street_address|country|locality|sublocality`
  ).catch((err) => {
    console.error("Error in reverse geocoding request", err);
    return Promise.reject(err);
  });
  const data = await response.json().catch((err) => {
    console.error("Error parsing reverse geocoding response", err);
    return Promise.reject(err);
  });

  const address: AddressType = {};
  // const locales: LocaleCode[] = [];

  // loop over the results
  for (const result of data.results as AddressAPIResultType[]) {
    // set the formatted address if not set yet
    if (!address.formatted) {
      address.formatted = result.formatted_address;
    }

    for (const component of result.address_components) {
      // set the country if not set yet
      if (!address.country && component.types.includes("country")) {
        address.country = {
          code: component.short_name,
          name: component.long_name,
        };
      }
      // set the locality if not set yet
      else if (!address.locality && component.types.includes("locality")) {
        address.locality = component.short_name;
      }
      // set the sublocality if not set yet
      else if (
        !address.sublocality &&
        component.types.includes("sublocality")
      ) {
        address.sublocality = component.short_name;
      } else if (
        !!address.country &&
        !!address.locality &&
        !!address.sublocality
      ) {
        break;
      } else {
        continue;
      }
    }
    if (
      !!address.formatted &&
      !!address.country &&
      !!address.locality &&
      !!address.sublocality
    ) {
      console.debug(
        "Found formatted address and all address components, sublocality, locality, country. Exiting early."
      );
      break;
    }
  }

  return [address, []];
};

/**
 * Update the address of a spot when the location changes.
 * This function is triggered when a spot is written (created, updated or deleted).
 */
// export const updateSpotAddressOnWrite = functions.firestore.onDocumentWritten(
//   "spots/{spotId}",
//   async (event) => {
//     // if the location of the spot has changed, call Googles reverse geocoding to get the address.
//     if (
//       !(event.data?.before?.data()?.location as GeoPoint).isEqual(
//         event.data?.after?.data()?.location
//       )
//     ) {
//       const location = event.data?.after?.data()?.location as GeoPoint;

//       const address = await updateSpotAddressFromLocation(location);

//       return event.data?.after?.ref.update({ address: address });
//     }
//     return;
//   }
// );

/**
 * Update the addresses of all existing spots.
 */
export const updateAllSpotAddresses = onDocumentCreated(
  { document: "spots/run-update-addresses", secrets: [googleAPIKey] },
  async (event) => {
    const spots = await admin.firestore().collection("spots").get();
    const apiKey: string = googleAPIKey.value();

    for (const spot of spots.docs) {
      const location = (spot.data() as SpotSchema).location;
      if (!location) {
        console.warn("Spot has no location", spot.id);
        continue;
      }
      if (!location?.latitude || !location?.longitude) {
        console.warn("Spot location is invalid", spot.id, location);
        continue;
      }

      const [address, _] = await updateSpotAddressFromLocation(
        location,
        apiKey
      ).catch((err) => {
        console.error("Error updating address for spot", spot.id, err);
        return Promise.reject(err);
      });

      await spot.ref.update({ address: address });
      console.log("Updated address for spot", spot.id, address);
    }

    // delete the run document
    return event.data?.ref.delete();
  }
);

export const computeRatingOnWrite = onDocumentWritten(
  "spots/{spotId}/reviews/{reviewId}",
  async (event) => {
    const spotId = event.params.spotId;

    const spotRef = admin.firestore().collection("spots").doc(spotId);

    return spotRef
      .collection("reviews")
      .get()
      .then((snapshot) => {
        let ratingSum = 0;
        let ratingHistogram = {
          1: 0,
          2: 0,
          3: 0,
          4: 0,
          5: 0,
        };

        snapshot.forEach((doc) => {
          const rating: 1 | 2 | 3 | 4 | 5 = (doc.data() as SpotReviewSchema)
            .rating as 1 | 2 | 3 | 4 | 5;
          ratingSum += rating;
          ratingHistogram[rating]++;
        });

        const rating = ratingSum / snapshot.size;

        return spotRef.update({
          rating: rating, // value between 1 and 5
          num_reviews: snapshot.size,
          rating_histogram: ratingHistogram,
        });
      });
  }
);
