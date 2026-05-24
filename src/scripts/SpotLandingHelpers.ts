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

type CommunityGeographyFields = {
  countryCode: string;
  regionCode?: string;
  regionName?: string;
  localityName?: string;
};

type CanonicalCommunityGeographyFields = CommunityGeographyFields & {
  regionSlug?: string;
  localitySlug?: string;
  displayLocalityName?: string;
};

type LocalityAlias = {
  countryCode: string;
  localitySlugs: readonly string[];
  canonicalLocalityName: string;
  canonicalLocalitySlug: string;
  regionSlugs?: readonly string[];
  canonicalRegionCode?: string;
  canonicalRegionName?: string;
  canonicalRegionSlug?: string;
};

const LOCALITY_ALIASES: readonly LocalityAlias[] = [
  {
    countryCode: "CZ",
    localitySlugs: ["hlavni-mesto-praha", "prague", "praha"],
    canonicalLocalityName: "Prague",
    canonicalLocalitySlug: "hlavni-mesto-praha",
    regionSlugs: ["hlavni-mesto-praha", "prague", "praha"],
    canonicalRegionCode: "PRAGUE",
    canonicalRegionName: "Prague",
    canonicalRegionSlug: "hlavni-mesto-praha",
  },
  {
    countryCode: "IT",
    localitySlugs: ["milan", "milano"],
    canonicalLocalityName: "Milan",
    canonicalLocalitySlug: "milan",
    regionSlugs: ["lombardy", "lombardia"],
    canonicalRegionCode: "LOMBARDY",
    canonicalRegionName: "Lombardy",
    canonicalRegionSlug: "lombardy",
  },
  {
    countryCode: "AU",
    localitySlugs: ["melbourn", "melbourne"],
    canonicalLocalityName: "Melbourne",
    canonicalLocalitySlug: "melbourne",
    regionSlugs: ["victoria", "vic"],
    canonicalRegionCode: "VICTORIA",
    canonicalRegionName: "Victoria",
    canonicalRegionSlug: "victoria",
  },
  {
    countryCode: "AR",
    localitySlugs: [
      "buenos-aires",
      "caba",
      "cdad-autonoma-de-buenos-aires",
      "ciudad-autonoma-de-buenos-aires",
    ],
    canonicalLocalityName: "Buenos Aires",
    canonicalLocalitySlug: "buenos-aires",
    regionSlugs: [
      "buenos-aires",
      "caba",
      "cdad-autonoma-de-buenos-aires",
      "ciudad-autonoma-de-buenos-aires",
    ],
    canonicalRegionCode: "CABA",
    canonicalRegionName: "Autonomous City of Buenos Aires",
    canonicalRegionSlug: "autonomous-city-of-buenos-aires",
  },
];

const REGION_ALIASES: Record<
  string,
  Record<
    string,
    {
      code?: string;
      name: string;
      slug: string;
    }
  >
> = {
  AR: {
    "buenos-aires-province": {
      name: "Buenos Aires Province",
      slug: "buenos-aires-province",
    },
    "provincia-de-buenos-aires": {
      name: "Buenos Aires Province",
      slug: "buenos-aires-province",
    },
  },
  BE: {
    "region-wallonne": {
      name: "Wallonia",
      slug: "wallonia",
    },
    "waals-gewest": {
      name: "Wallonia",
      slug: "wallonia",
    },
    wallonia: {
      name: "Wallonia",
      slug: "wallonia",
    },
  },
};

const stripCzechAdministrativeLocalityNoise = (
  localityName: string | undefined,
): string | undefined => {
  const trimmed = localityName?.trim();
  if (!trimmed) {
    return undefined;
  }

  const withoutDistrictPrefix = trimmed.replace(/^okres\s+/iu, "").trim();
  const withoutPostalDistrict = withoutDistrictPrefix
    .replace(/\s+\d+$/u, "")
    .trim();

  return withoutPostalDistrict || trimmed;
};

const isUsableCommunityLocalityName = (
  localityName: string | undefined,
): boolean => {
  const slug = slugifyUrlSegment(localityName);
  return slug.length >= 2;
};

function getMatchingLocalityAlias(
  countryCode: string,
  localitySlug: string | undefined,
  regionSlug: string | undefined,
): LocalityAlias | undefined {
  if (!localitySlug) {
    return undefined;
  }

  return LOCALITY_ALIASES.find((alias) => {
    if (alias.countryCode !== countryCode) {
      return false;
    }

    const localityMatches = alias.localitySlugs.includes(localitySlug);
    const pragueRegionOnlyMatch =
      alias.countryCode === "CZ" &&
      !!regionSlug &&
      alias.regionSlugs?.includes(regionSlug);

    return localityMatches || pragueRegionOnlyMatch;
  });
}

export function canonicalizeCommunityGeography(
  fields: CommunityGeographyFields,
): CanonicalCommunityGeographyFields {
  const countryCode = fields.countryCode.trim().toUpperCase();
  let regionCode = fields.regionCode?.trim().toUpperCase() || undefined;
  let regionName = fields.regionName?.trim() || undefined;
  let localityName = fields.localityName?.trim() || undefined;

  if (countryCode === "CZ") {
    localityName = stripCzechAdministrativeLocalityNoise(localityName);
  }

  if (!isUsableCommunityLocalityName(localityName)) {
    localityName = undefined;
  }

  let regionSlug =
    slugifyUrlSegment(regionCode || regionName || "") || undefined;
  let localitySlug = localityName
    ? slugifyUrlSegment(localityName)
    : undefined;

  const regionAlias = regionSlug ? REGION_ALIASES[countryCode]?.[regionSlug] : undefined;
  if (regionAlias) {
    regionCode = regionAlias.code ?? regionCode;
    regionName = regionAlias.name;
    regionSlug = regionAlias.slug;
  }

  const localityAlias = getMatchingLocalityAlias(
    countryCode,
    localitySlug,
    regionSlug,
  );

  if (localityAlias) {
    localityName = localityAlias.canonicalLocalityName;
    localitySlug = localityAlias.canonicalLocalitySlug;
    regionCode = localityAlias.canonicalRegionCode ?? regionCode;
    regionName = localityAlias.canonicalRegionName ?? regionName;
    regionSlug = localityAlias.canonicalRegionSlug ?? regionSlug;
  }

  return {
    countryCode,
    regionCode,
    regionName,
    regionSlug,
    localityName,
    localitySlug,
    displayLocalityName: localityName,
  };
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

  const communityGeography = canonicalizeCommunityGeography({
    countryCode: country.countryCode,
    localityName: getSpotLocalityName(spotLike.address),
    regionCode: spotLike.address?.region?.code,
    regionName: spotLike.address?.region?.name,
  });

  return {
    ...country,
    regionCode: communityGeography.regionCode,
    regionName: communityGeography.regionName,
    regionSlug: communityGeography.regionSlug,
    localityName: communityGeography.localityName,
    localitySlug: communityGeography.localitySlug,
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
