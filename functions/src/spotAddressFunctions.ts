import { GeoPoint } from "firebase-admin/firestore";
import * as admin from "firebase-admin";
import { onDocumentCreated } from "firebase-functions/v2/firestore";

import { googleAPIKey } from "./secrets";
import { SpotSchema } from "./spotHelpers";
import { LocaleCode } from "../../src/db/models/Interfaces";

type AddressType = {
  sublocality?: string;
  sublocalityLocal?: string;
  locality?: string;
  localityLocal?: string;
  region?: {
    code?: string;
    name: string;
    localName?: string;
  };
  country?: {
    code: string; // alpha 2
    name: string;
    localName?: string;
  };
  formatted?: string;
  formattedLocal?: string;
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
      (typeof address.formattedLocal === "string" &&
        address.formattedLocal.trim()) ||
      (typeof address.locality === "string" && address.locality.trim()) ||
      (typeof address.localityLocal === "string" && address.localityLocal.trim()) ||
      (typeof address.sublocality === "string" && address.sublocality.trim()) ||
      (typeof address.sublocalityLocal === "string" &&
        address.sublocalityLocal.trim()) ||
      (typeof address.region?.name === "string" && address.region.name.trim()) ||
      (typeof address.region?.localName === "string" &&
        address.region.localName.trim()) ||
      (address.country?.code && address.country?.name)
  );
};

const GEOCODE_RESULT_TYPES =
  "street_address|country|locality|sublocality|administrative_area_level_1";

const fetchReverseGeocodeResponse = async (
  location: GeoPoint,
  apiKey: string,
  language?: string
): Promise<GeocodeApiResponse> => {
  const lat = location.latitude;
  const lng = location.longitude;
  const languageParam = language ? `language=${language}&` : "";

  const response = await fetch(
    `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${apiKey}&` +
      `${languageParam}result_type=${GEOCODE_RESULT_TYPES}`
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

  return data;
};

const extractAddressFromGeocodeResponse = (
  data: GeocodeApiResponse
): AddressType => {
  const address: AddressType = {};

  for (const result of data.results ?? []) {
    if (!address.formatted) {
      address.formatted = result.formatted_address;
    }

    for (const component of result.address_components) {
      if (!address.country && component.types.includes("country")) {
        address.country = {
          code: component.short_name,
          name: component.long_name,
        };
      } else if (
        !address.region &&
        component.types.includes("administrative_area_level_1")
      ) {
        address.region = {
          code: component.short_name,
          name: component.long_name,
        };
      } else if (!address.locality && component.types.includes("locality")) {
        address.locality = component.short_name;
      } else if (
        !address.locality &&
        (component.types.includes("postal_town") ||
          component.types.includes("administrative_area_level_3") ||
          component.types.includes("administrative_area_level_2") ||
          component.types.includes("administrative_area_level_1"))
      ) {
        address.locality = component.short_name;
      } else if (
        !address.sublocality &&
        (component.types.includes("sublocality") ||
          component.types.includes("sublocality_level_1"))
      ) {
        address.sublocality = component.short_name;
      } else if (
        !!address.country &&
        !!address.region &&
        !!address.locality &&
        !!address.sublocality
      ) {
        break;
      }
    }

    if (
      !!address.formatted &&
      !!address.country &&
      !!address.region &&
      !!address.locality &&
      !!address.sublocality
    ) {
      break;
    }
  }

  return address;
};

const mergeEnglishAndLocalAddress = (
  englishAddress: AddressType,
  localAddress?: AddressType | null
): AddressType => {
  if (!localAddress) {
    return englishAddress;
  }

  return {
    ...englishAddress,
    formattedLocal:
      localAddress.formatted &&
      localAddress.formatted !== englishAddress.formatted
        ? localAddress.formatted
        : undefined,
    localityLocal:
      localAddress.locality &&
      localAddress.locality !== englishAddress.locality
        ? localAddress.locality
        : undefined,
    sublocalityLocal:
      localAddress.sublocality &&
      localAddress.sublocality !== englishAddress.sublocality
        ? localAddress.sublocality
        : undefined,
    region: englishAddress.region
      ? {
          ...englishAddress.region,
          localName:
            localAddress.region?.name &&
            localAddress.region.name !== englishAddress.region.name
              ? localAddress.region.name
              : undefined,
        }
      : localAddress.region,
    country: englishAddress.country
      ? {
          ...englishAddress.country,
          localName:
            localAddress.country?.name &&
            localAddress.country.name !== englishAddress.country.name
              ? localAddress.country.name
              : undefined,
        }
      : localAddress.country,
  };
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

  const englishData = await fetchReverseGeocodeResponse(location, apiKey, "en");
  const englishAddress = extractAddressFromGeocodeResponse(englishData);
  const localAddress = await fetchReverseGeocodeResponse(location, apiKey).then(
    extractAddressFromGeocodeResponse
  ).catch((err) => {
    console.warn("Local-language reverse geocoding failed; using English only.", err);
    return null;
  });
  const address = mergeEnglishAndLocalAddress(englishAddress, localAddress);

  if (!hasAddressData(address)) {
    console.warn(
      "Reverse geocoding returned no usable address data",
      JSON.stringify({
        lat,
        lng,
        status: englishData.status,
        hasResults:
          Array.isArray(englishData.results) && englishData.results.length > 0,
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
