import { GeoPoint } from "firebase-admin/firestore";
import * as admin from "firebase-admin";
import { onDocumentCreated } from "firebase-functions/v2/firestore";

import { googleAPIKey } from "./secrets";
import { SpotSchema } from "./spotHelpers";
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

type GeocodeApiResponse = {
  status?: string;
  error_message?: string;
  results?: AddressAPIResultType[];
};

const hasAddressData = (address: AddressType | null | undefined): boolean => {
  if (!address) return false;
  return Boolean(
    (typeof address.formatted === "string" && address.formatted.trim()) ||
      (typeof address.locality === "string" && address.locality.trim()) ||
      (typeof address.sublocality === "string" && address.sublocality.trim()) ||
      (address.country?.code && address.country?.name)
  );
};

export const getAddressAndLocaleFromGeopoint = async (
  location: GeoPoint,
  apiKey: string
): Promise<[AddressType, LocaleCode[]]> => {
  const lat = location?.latitude;
  const lng = location?.longitude;

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return Promise.reject("Location is invalid");
  }
  if (!apiKey) {
    return Promise.reject("Google API Key is missing");
  }

  const response = await fetch(
    `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${apiKey}&` +
      `result_type=street_address|country|locality|sublocality`
  ).catch((err) => {
    console.error("Error in reverse geocoding request", err);
    return Promise.reject(err);
  });
  if (!response.ok) {
    return Promise.reject(
      `Reverse geocoding HTTP error: ${response.status} ${response.statusText}`
    );
  }
  const data = (await response.json().catch((err) => {
    console.error("Error parsing reverse geocoding response", err);
    return Promise.reject(err);
  })) as GeocodeApiResponse;

  if (data.status && data.status !== "OK" && data.status !== "ZERO_RESULTS") {
    return Promise.reject(
      `Reverse geocoding status ${data.status}${
        data.error_message ? `: ${data.error_message}` : ""
      }`
    );
  }

  const address: AddressType = {};
  // const locales: LocaleCode[] = [];

  // loop over the results
  for (const result of data.results ?? []) {
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
      // fallback for countries where Google does not provide "locality"
      else if (
        !address.locality &&
        (component.types.includes("postal_town") ||
          component.types.includes("administrative_area_level_3") ||
          component.types.includes("administrative_area_level_2") ||
          component.types.includes("administrative_area_level_1"))
      ) {
        address.locality = component.short_name;
      }
      // set the sublocality if not set yet
      else if (
        !address.sublocality &&
        (component.types.includes("sublocality") ||
          component.types.includes("sublocality_level_1"))
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

  if (!hasAddressData(address)) {
    console.warn(
      "Reverse geocoding returned no usable address data",
      JSON.stringify({
        lat,
        lng,
        status: data.status,
        hasResults: Array.isArray(data.results) && data.results.length > 0,
      })
    );
  }

  return [address, []];
};

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
      const lat = location?.latitude;
      const lng = location?.longitude;
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        console.warn("Spot location is invalid", spot.id, location);
        continue;
      }

      const [address, _] = await getAddressAndLocaleFromGeopoint(
        location,
        apiKey
      ).catch((err) => {
        console.error("Error updating address for spot", spot.id, err);
        return Promise.reject(err);
      });

      if (hasAddressData(address)) {
        await spot.ref.update({ address: address });
        console.log("Updated address for spot", spot.id, address);
      } else {
        console.warn(
          "Skipping empty/incomplete address update for spot",
          spot.id
        );
      }
    }

    // delete the run document
    return event.data?.ref.delete();
  }
);
