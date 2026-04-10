import { SpotSchema } from "../db/schemas/SpotSchema";

type SpotAddress = SpotSchema["address"];

export function getDisplayCountryName(address: SpotAddress): string | undefined {
  return (
    address?.country?.localName?.trim() ||
    address?.country?.name?.trim() ||
    undefined
  );
}

export function getCanonicalCountryName(
  address: SpotAddress
): string | undefined {
  return address?.country?.name?.trim() || undefined;
}

export function getDisplayRegionName(address: SpotAddress): string | undefined {
  return (
    address?.region?.localName?.trim() ||
    address?.region?.name?.trim() ||
    undefined
  );
}

export function getCanonicalRegionName(
  address: SpotAddress
): string | undefined {
  return address?.region?.name?.trim() || undefined;
}

export function getDisplayLocalityName(
  address: SpotAddress
): string | undefined {
  return (
    address?.localityLocal?.trim() ||
    address?.locality?.trim() ||
    address?.sublocalityLocal?.trim() ||
    address?.sublocality?.trim() ||
    undefined
  );
}

export function getCanonicalLocalityName(
  address: SpotAddress
): string | undefined {
  return (
    address?.locality?.trim() || address?.sublocality?.trim() || undefined
  );
}

export function getDisplaySublocalityName(
  address: SpotAddress
): string | undefined {
  return address?.sublocalityLocal?.trim() || address?.sublocality?.trim() || undefined;
}

export function getDisplayFormattedAddress(
  address: SpotAddress
): string | undefined {
  return address?.formattedLocal?.trim() || address?.formatted?.trim() || undefined;
}

export function getDisplayLocalityString(address: SpotAddress): string {
  const parts = [
    getDisplaySublocalityName(address),
    getDisplayLocalityName(address),
    address?.country?.code?.trim().toUpperCase() || undefined,
  ].filter((value, index, array) => {
    if (!value) {
      return false;
    }

    return array.indexOf(value) === index;
  });

  return parts.join(", ");
}
