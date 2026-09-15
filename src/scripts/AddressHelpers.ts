import type { SpotSchema } from "../db/schemas/SpotSchema";
import type { EntityPlaceNames } from "./EntityPlaceNames";
import { localizedCountryName } from "./CommunityPlaceNames";

type SpotAddress = SpotSchema["address"];

/** Presentation only: preserve reverse-geocoded source fields and street addresses. */
export function localizedSpotAddress(address: SpotAddress, place: EntityPlaceNames | undefined, locale: string): SpotAddress {
  if (!address) return address;
  const language = locale.split("-")[0];
  const locality = place?.names[locale] || place?.names[language];
  const region = place?.region?.names[locale] || place?.region?.names[language];
  return {
    ...address,
    ...(locality ? { localityLocal: locality } : {}),
    ...(address.region && region ? { region: { ...address.region, localName: region } } : {}),
    ...(address.country ? { country: { ...address.country, localName: localizedCountryName(address.country.code, locale, getDisplayCountryName(address) || "") } } : {}),
  };
}

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

/** Returns the most specific available location label for compact UI. */
export function getDisplayLocationName(
  address: SpotAddress
): string | undefined {
  return getDisplayLocalityName(address) ?? getDisplayCountryName(address);
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
