import {
  CommunityBreadcrumbSchema,
  CommunityGeographySchema,
  CommunityPageSchema,
  CommunityScope,
} from "../db/schemas/CommunityPageSchema";
import { SpotSchema } from "../db/schemas/SpotSchema";
import {
  getCountryMetadata,
  slugifyUrlSegment,
} from "./SpotLandingHelpers";
import {
  getCanonicalLocalityName,
  getDisplayCountryName,
  getDisplayLocalityName,
  getDisplayRegionName,
} from "./AddressHelpers";

export const COMMUNITY_PAGE_MIN_SPOTS = 5;
export const COMMUNITY_DEFAULT_IMAGE_PATH = "/assets/banner_1200x630.png";

const COUNTRY_SLUG_ALIASES: Record<string, string> = {
  GB: "uk",
};

export interface CommunityCandidate {
  communityKey: string;
  scope: CommunityScope;
  displayName: string;
  geography: CommunityGeographySchema;
}

export function normalizeCommunitySlug(
  value: string | null | undefined
): string {
  return slugifyUrlSegment(value, 80);
}

export function buildCommunityLandingPath(
  slug: string | null | undefined
): string {
  return `/map/community/${normalizeCommunitySlug(slug)}`;
}

export function getCommunityCountrySuffix(
  countryCode: string | null | undefined
): string {
  const normalizedCode = String(countryCode ?? "").trim().toUpperCase();
  if (!normalizedCode) {
    return "";
  }

  return COUNTRY_SLUG_ALIASES[normalizedCode] ?? normalizedCode.toLowerCase();
}

export function getCommunityRegionSuffix(
  regionCode: string | null | undefined,
  regionName?: string | null
): string {
  const normalizedRegionCode = normalizeCommunitySlug(regionCode);
  if (normalizedRegionCode) {
    return normalizedRegionCode;
  }

  return normalizeCommunitySlug(regionName);
}

export function buildCountryCommunityKey(
  countryCode: string | null | undefined
): string {
  const normalizedCountryCode = String(countryCode ?? "").trim().toLowerCase();
  return normalizedCountryCode ? `country:${normalizedCountryCode}` : "";
}

export function buildLocalityCommunityKey(
  countryCode: string | null | undefined,
  localitySlug: string | null | undefined,
  regionSlug?: string | null
): string {
  const normalizedCountryCode = String(countryCode ?? "").trim().toLowerCase();
  const normalizedLocalitySlug = normalizeCommunitySlug(localitySlug);
  const normalizedRegionSlug = normalizeCommunitySlug(regionSlug);

  if (!normalizedCountryCode || !normalizedLocalitySlug) {
    return "";
  }

  if (normalizedRegionSlug) {
    return `locality:${normalizedCountryCode}:${normalizedRegionSlug}:${normalizedLocalitySlug}`;
  }

  return `locality:${normalizedCountryCode}:${normalizedLocalitySlug}`;
}

export function getSpotRegionMetadata(
  address: SpotSchema["address"]
): Pick<CommunityGeographySchema, "regionCode" | "regionName" | "regionSlug"> {
  const regionName = address?.region?.name?.trim();
  const regionCode = address?.region?.code?.trim().toUpperCase();

  return {
    regionCode: regionCode || undefined,
    regionName: regionName || undefined,
    regionSlug: slugifyUrlSegment(regionCode || regionName || ""),
  };
}

export function getSpotCommunityCandidates(
  spotLike: Pick<SpotSchema, "address" | "landing">
): CommunityCandidate[] {
  const country = getCountryMetadata(
    spotLike.landing?.countryCode || spotLike.address?.country?.code,
    spotLike.landing?.countryNameEn || spotLike.address?.country?.name
  );

  if (!country) {
    return [];
  }

  const region = {
    regionCode:
      spotLike.landing?.regionCode || spotLike.address?.region?.code || undefined,
    regionName:
      spotLike.landing?.regionName || spotLike.address?.region?.name || undefined,
    regionSlug:
      spotLike.landing?.regionSlug ||
      slugifyUrlSegment(
        spotLike.address?.region?.code || spotLike.address?.region?.name || ""
      ) ||
      undefined,
  };

  const countryCandidate: CommunityCandidate = {
    communityKey: buildCountryCommunityKey(country.countryCode),
    scope: "country",
    displayName: country.countryNameEn,
    geography: {
      countryCode: country.countryCode,
      countryName: country.countryNameEn,
      countryLocalName: getDisplayCountryName(spotLike.address),
      countrySlug: country.countrySlug,
    },
  };

  const localityName =
    spotLike.landing?.localityName || getCanonicalLocalityName(spotLike.address);
  const localitySlug =
    spotLike.landing?.localitySlug || normalizeCommunitySlug(localityName);
  const localityLocalName = getDisplayLocalityName(spotLike.address);

  if (!localityName || !localitySlug) {
    return [countryCandidate];
  }

  const localityCandidate: CommunityCandidate = {
    communityKey: buildLocalityCommunityKey(
      country.countryCode,
      localitySlug,
      region.regionSlug
    ),
    scope: "locality",
    displayName: localityLocalName || localityName,
    geography: {
      ...countryCandidate.geography,
      ...region,
      regionLocalName: getDisplayRegionName(spotLike.address),
      localityName,
      localityLocalName,
      localitySlug,
    },
  };

  return [countryCandidate, localityCandidate].filter(
    (candidate) => !!candidate.communityKey
  );
}

export function buildCommunityPageTitle(
  scope: CommunityScope,
  displayName: string,
  geography: CommunityGeographySchema
): string {
  if (scope === "locality" && geography.countryName) {
    return `${displayName}, ${geography.countryName} Parkour Community | PK Spot`;
  }

  return `${displayName} Parkour Community | PK Spot`;
}

export function buildCommunityPageDescription(
  scope: CommunityScope,
  displayName: string,
  geography: CommunityGeographySchema,
  totalSpots: number,
  drySpotCount: number
): string {
  if (scope === "locality" && geography.countryName) {
    return `Discover ${totalSpots} parkour spots and ${drySpotCount} dry training options in ${displayName}, ${geography.countryName} on PK Spot.`;
  }

  return `Discover ${totalSpots} parkour spots and ${drySpotCount} dry training options across ${displayName} on PK Spot.`;
}

export function buildCommunitySlugCandidates(
  candidate: Pick<CommunityCandidate, "displayName" | "geography">,
  conflictingCountryCode?: string | null
): string[] {
  const baseSlug =
    normalizeCommunitySlug(candidate.displayName) ||
    normalizeCommunitySlug(
      candidate.geography.localitySlug ||
        candidate.geography.countrySlug ||
        candidate.geography.regionSlug
    );

  const regionSuffix = getCommunityRegionSuffix(
    candidate.geography.regionCode,
    candidate.geography.regionName
  );
  const countrySuffix = getCommunityCountrySuffix(candidate.geography.countryCode);

  const isCrossCountryConflict =
    !!conflictingCountryCode &&
    !!candidate.geography.countryCode &&
    candidate.geography.countryCode.toUpperCase() !==
      conflictingCountryCode.toUpperCase();

  const orderedSuffixes = isCrossCountryConflict
    ? [countrySuffix, regionSuffix, [regionSuffix, countrySuffix].filter(Boolean).join("-")]
    : [regionSuffix, countrySuffix, [regionSuffix, countrySuffix].filter(Boolean).join("-")];

  return [
    baseSlug,
    ...orderedSuffixes
      .filter(Boolean)
      .map((suffix) => `${baseSlug}-${suffix}`),
  ].filter(Boolean);
}

export function buildCommunityBreadcrumbs(
  page: Pick<
    CommunityPageSchema,
    "scope" | "displayName" | "canonicalPath" | "geography"
  >,
  countryPagePath?: string | null
): CommunityBreadcrumbSchema[] {
  const breadcrumbs: CommunityBreadcrumbSchema[] = [
    { name: "Map", path: "/map" },
  ];

  if (page.scope === "locality" && page.geography.countryName && countryPagePath) {
    breadcrumbs.push({
      name: page.geography.countryName,
      path: countryPagePath,
    });
  }

  breadcrumbs.push({
    name: page.displayName,
    path: page.canonicalPath,
  });

  return breadcrumbs;
}
