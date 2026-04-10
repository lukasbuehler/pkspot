import { FieldValue, GeoPoint } from "firebase-admin/firestore";
import * as admin from "firebase-admin";
import { onDocumentCreated } from "firebase-functions/v2/firestore";

import { googleAPIKey } from "./secrets";
import { SpotSchema } from "./spotHelpers";
import { LocaleCode } from "../../src/db/models/Interfaces";

const isEmulatorEnvironment =
  process.env.FUNCTIONS_EMULATOR === "true" ||
  !!process.env.FIRESTORE_EMULATOR_HOST;

const geocodeTriggerSecrets = isEmulatorEnvironment ? [] : [googleAPIKey];
const MAINTENANCE_COLLECTION = "maintenance";
const RUN_UPDATE_ADDRESSES_DOC = `${MAINTENANCE_COLLECTION}/run-update-addresses`;

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

const hasLocalizedAddressData = (
  address: AddressType | SpotSchema["address"] | null | undefined
): boolean => {
  if (!address) return false;

  return Boolean(
    (typeof address.formattedLocal === "string" &&
      address.formattedLocal.trim()) ||
      (typeof address.localityLocal === "string" &&
        address.localityLocal.trim()) ||
      (typeof address.sublocalityLocal === "string" &&
        address.sublocalityLocal.trim()) ||
      (typeof address.region?.localName === "string" &&
        address.region.localName.trim()) ||
      (typeof address.country?.localName === "string" &&
        address.country.localName.trim())
  );
};

const shouldRefreshAddress = (
  address: AddressType | SpotSchema["address"] | null | undefined
): boolean => {
  if (!hasAddressData(address)) {
    return true;
  }

  return !hasLocalizedAddressData(address);
};

const removeUndefinedValues = <T>(value: T): T => {
  if (Array.isArray(value)) {
    return value
      .map((entry) => removeUndefinedValues(entry))
      .filter((entry) => entry !== undefined) as T;
  }

  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, entryValue]) => entryValue !== undefined)
      .map(([entryKey, entryValue]) => [
        entryKey,
        removeUndefinedValues(entryValue),
      ]);

    return Object.fromEntries(entries) as T;
  }

  return value;
};

const GEOCODE_RESULT_TYPES =
  "street_address|country|locality|sublocality|administrative_area_level_1";

const EMULATOR_MOCK_ADDRESS_DATA: Array<{
  center: { lat: number; lng: number };
  radius: number;
  english: AddressType;
  local?: AddressType;
}> = [
  {
    center: { lat: 47.3769, lng: 8.5417 },
    radius: 0.15,
    english: {
      formatted: "Zurich, Zurich, Switzerland",
      locality: "Zurich",
      region: { code: "ZH", name: "Zurich" },
      country: { code: "CH", name: "Switzerland" },
    },
    local: {
      formatted: "Zurich, ZH, Schweiz",
      locality: "Zürich",
      region: { code: "ZH", name: "Zürich" },
      country: { code: "CH", name: "Schweiz" },
    },
  },
  {
    center: { lat: 47.3688, lng: 8.7854 },
    radius: 0.08,
    english: {
      formatted: "Pfaffikon, Zurich, Switzerland",
      locality: "Pfaffikon",
      region: { code: "ZH", name: "Zurich" },
      country: { code: "CH", name: "Switzerland" },
    },
    local: {
      formatted: "Pfäffikon, ZH, Schweiz",
      locality: "Pfäffikon",
      region: { code: "ZH", name: "Zürich" },
      country: { code: "CH", name: "Schweiz" },
    },
  },
  {
    center: { lat: 47.2018, lng: 8.7785 },
    radius: 0.08,
    english: {
      formatted: "Pfaffikon, Schwyz, Switzerland",
      locality: "Pfaffikon",
      region: { code: "SZ", name: "Schwyz" },
      country: { code: "CH", name: "Switzerland" },
    },
    local: {
      formatted: "Pfäffikon, SZ, Schweiz",
      locality: "Pfäffikon",
      region: { code: "SZ", name: "Schwyz" },
      country: { code: "CH", name: "Schweiz" },
    },
  },
  {
    center: { lat: 48.8566, lng: 2.3522 },
    radius: 0.2,
    english: {
      formatted: "Paris, Ile-de-France, France",
      locality: "Paris",
      region: { code: "IDF", name: "Ile-de-France" },
      country: { code: "FR", name: "France" },
    },
    local: {
      formatted: "Paris, Île-de-France, France",
      locality: "Paris",
      region: { code: "IDF", name: "Île-de-France" },
      country: { code: "FR", name: "France" },
    },
  },
];

const getDistanceInDegrees = (
  left: { lat: number; lng: number },
  right: { lat: number; lng: number }
): number => {
  const latDiff = left.lat - right.lat;
  const lngDiff = left.lng - right.lng;
  return Math.sqrt(latDiff * latDiff + lngDiff * lngDiff);
};

const getMockAddressAndLocalesFromGeopoint = (
  location: GeoPoint
): [AddressType, LocaleCode[]] => {
  const point = { lat: location.latitude, lng: location.longitude };
  const matchedMock = EMULATOR_MOCK_ADDRESS_DATA.find(
    (candidate) => getDistanceInDegrees(point, candidate.center) <= candidate.radius
  );

  if (!matchedMock) {
    return [
      {
        formatted: `Test Spot ${point.lat.toFixed(3)}, ${point.lng.toFixed(3)}`,
        locality: `test-locality-${Math.abs(Math.round(point.lat * 100))}`,
        localityLocal: `test-locality-${Math.abs(Math.round(point.lat * 100))}`,
        region: { code: "TS", name: "Test State", localName: "Test State" },
        country: { code: "TS", name: "Testland", localName: "Testland" },
      },
      ["en"],
    ];
  }

  return [
    removeUndefinedValues(
      mergeEnglishAndLocalAddress(matchedMock.english, matchedMock.local)
    ),
    ["en"],
  ];
};

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
  if (isEmulatorEnvironment) {
    return getMockAddressAndLocalesFromGeopoint(location);
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
  {
    document: RUN_UPDATE_ADDRESSES_DOC,
    secrets: geocodeTriggerSecrets,
    timeoutSeconds: 540,
  },
  async (event) => {
    const spots = await admin.firestore().collection("spots").get();
    const apiKey: string = isEmulatorEnvironment ? "" : googleAPIKey.value();
    let updatedCount = 0;
    let skippedCount = 0;
    let failedCount = 0;

    for (const spot of spots.docs) {
      if (spot.id === "typesense" || spot.id.startsWith("run-")) {
        skippedCount += 1;
        continue;
      }

      const spotData = spot.data() as SpotSchema;
      if (!shouldRefreshAddress(spotData.address)) {
        skippedCount += 1;
        continue;
      }

      const location = spotData.location;
      if (!location) {
        console.warn("Spot has no location", spot.id);
        failedCount += 1;
        continue;
      }
      const lat = location?.latitude;
      const lng = location?.longitude;
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        console.warn("Spot location is invalid", spot.id, location);
        failedCount += 1;
        continue;
      }

      try {
        const [address, _] = await getAddressAndLocaleFromGeopoint(
          location,
          apiKey
        );

        if (hasAddressData(address)) {
          await spot.ref.update({ address: removeUndefinedValues(address) });
          updatedCount += 1;
          console.log("Updated address for spot", spot.id, address);
        } else {
          skippedCount += 1;
          console.warn(
            "Skipping empty/incomplete address update for spot",
            spot.id
          );
        }
      } catch (err) {
        failedCount += 1;
        console.error("Error updating address for spot", spot.id, err);
      }
    }

    await event.data?.ref.set(
      {
        status: failedCount > 0 ? "DONE_WITH_ERRORS" : "DONE",
        updated_count: updatedCount,
        skipped_count: skippedCount,
        failed_count: failedCount,
        completed_at: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    if (failedCount > 0) {
      return null;
    }

    return event.data?.ref.delete();
  }
);
