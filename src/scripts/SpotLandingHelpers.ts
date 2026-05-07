import { SpotLandingSchema } from "../db/schemas/SpotLandingSchema";
import { SpotSchema } from "../db/schemas/SpotSchema";
import { countries } from "./Countries";

export const RESERVED_SPOT_SLUGS = ["community", "c", "edits"] as const;

const DRY_SPOT_TYPES = new Set([
  "parkour gym",
  "garage",
  "gymnastics gym",
  "trampoline park",
]);

export function slugifyUrlSegment(
  value: string | null | undefined,
  maxLength: number = 80,
): string {
  const normalized = String(value ?? "")
    .replace(/ä/gi, "ae")
    .replace(/ö/gi, "oe")
    .replace(/ü/gi, "ue")
    .replace(/ß/gi, "ss")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized.slice(0, maxLength).replace(/-+$/g, "");
}

export function normalizeSpotSlug(value: string | null | undefined): string {
  return slugifyUrlSegment(value, 80);
}

export function isReservedSpotSlug(value: string | null | undefined): boolean {
  const normalized = normalizeSpotSlug(value);
  return RESERVED_SPOT_SLUGS.includes(
    normalized as (typeof RESERVED_SPOT_SLUGS)[number],
  );
}

export function getSpotSlugValidationError(
  value: string | null | undefined,
): string | null {
  const rawValue = String(value ?? "")
    .trim()
    .toLowerCase();
  const normalized = normalizeSpotSlug(value);

  if (!normalized) {
    return "The slug must only contain lowercase alphanumeric characters and hyphens.";
  }

  if (normalized !== rawValue) {
    return "The slug must only contain lowercase alphanumeric characters and hyphens.";
  }

  if (isReservedSpotSlug(normalized)) {
    return "This URL is reserved for PK Spot pages. Please choose another.";
  }

  return null;
}

export function getCountryMetadata(
  countryCode: string | null | undefined,
  fallbackName?: string | null,
): Pick<
  SpotLandingSchema,
  "countryCode" | "countryNameEn" | "countrySlug"
> | null {
  const normalizedCode = String(countryCode ?? "")
    .trim()
    .toUpperCase();
  const knownCountry = normalizedCode ? countries[normalizedCode] : undefined;
  const countryNameEn = knownCountry?.name || String(fallbackName ?? "").trim();

  if (!normalizedCode || !countryNameEn) {
    return null;
  }

  return {
    countryCode: normalizedCode,
    countryNameEn,
    countrySlug: slugifyUrlSegment(countryNameEn),
  };
}

export function getSpotLocalityName(
  address: SpotSchema["address"],
): string | undefined {
  const locality = address?.locality?.trim();
  if (locality) {
    return locality;
  }

  const sublocality = address?.sublocality?.trim();
  return sublocality || undefined;
}

export function isDrySpotCandidate(
  spotLike: Pick<SpotSchema, "type" | "amenities">,
): boolean {
  const type = String(spotLike.type ?? "")
    .trim()
    .toLowerCase();
  const amenities = spotLike.amenities ?? {};

  return (
    DRY_SPOT_TYPES.has(type) ||
    amenities.covered === true ||
    amenities.indoor === true
  );
}

export function deriveSpotCommunityData(
  spotLike: Pick<SpotSchema, "address" | "type" | "amenities">,
): SpotLandingSchema | null {
  const country = getCountryMetadata(
    spotLike.address?.country?.code,
    spotLike.address?.country?.name,
  );

  if (!country) {
    return null;
  }

  const localityName = getSpotLocalityName(spotLike.address);
  const localitySlug = localityName
    ? slugifyUrlSegment(localityName)
    : undefined;
  const regionName = spotLike.address?.region?.name?.trim() || undefined;
  const regionCode =
    spotLike.address?.region?.code?.trim().toUpperCase() || undefined;
  const regionSlug =
    slugifyUrlSegment(regionCode || regionName || "") || undefined;

  return {
    ...country,
    regionCode,
    regionName,
    regionSlug,
    localityName,
    localitySlug,
    isDry: isDrySpotCandidate(spotLike),
    organizationVerified: false,
  };
}

export function humanizeSlugSegment(value: string | null | undefined): string {
  return String(value ?? "")
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
