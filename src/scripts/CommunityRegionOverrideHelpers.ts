import type { CommunityGeographySchema } from "../db/schemas/CommunityPageSchema";
import type { CommunityRegionOverrideSchema } from "../db/schemas/CommunityRegionOverrideSchema";
import { getDistanceMeters } from "./CommunityBoundsHelpers";
import { normalizeCommunitySlug } from "./CommunityHelpers";

export const COMMUNITY_REGION_OVERRIDE_MIN_RADIUS_KM = 1;
export const COMMUNITY_REGION_OVERRIDE_MAX_RADIUS_KM = 200;

type RegionOverrideScope = Pick<
  CommunityRegionOverrideSchema,
  "country_code" | "region_code" | "region_name" | "region_slug"
>;

const sameNonEmptySlug = (
  left: string | null | undefined,
  right: string | null | undefined,
): boolean => {
  const normalizedLeft = normalizeCommunitySlug(left);
  return !!normalizedLeft && normalizedLeft === normalizeCommunitySlug(right);
};

/**
 * Whether a locality's geography lies in the override's country and region.
 *
 * Geocoded regions are not always consistent: the same state can arrive as
 * code `VIC` with name `Victoria`, or with the name only. Any matching code,
 * name, or slug therefore counts, but the country must always match so an
 * override can never reach across a national border.
 */
export function communityGeographyMatchesRegionOverride(
  geography: CommunityGeographySchema,
  override: RegionOverrideScope,
): boolean {
  if (
    !geography.countryCode ||
    geography.countryCode.toUpperCase() !== override.country_code.toUpperCase()
  ) {
    return false;
  }

  return (
    sameNonEmptySlug(geography.regionCode, override.region_code) ||
    sameNonEmptySlug(geography.regionName, override.region_name) ||
    sameNonEmptySlug(geography.regionSlug, override.region_slug) ||
    sameNonEmptySlug(geography.regionCode, override.region_slug) ||
    sameNonEmptySlug(geography.regionName, override.region_slug) ||
    sameNonEmptySlug(geography.regionSlug, override.region_code) ||
    sameNonEmptySlug(geography.regionSlug, override.region_name)
  );
}

export function isValidRegionOverrideRadiusKm(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= COMMUNITY_REGION_OVERRIDE_MIN_RADIUS_KM &&
    value <= COMMUNITY_REGION_OVERRIDE_MAX_RADIUS_KM
  );
}

export function getRegionOverrideDistanceKm(
  override: Pick<CommunityRegionOverrideSchema, "center">,
  point: { lat: number; lng: number },
): number {
  return getDistanceMeters(override.center, point) / 1000;
}

/**
 * Pick the override that should absorb a locality, or `null` to keep the
 * default address-based grouping.
 *
 * A locality qualifies when it is in the override's region and its centre is
 * within the radius. Localities that are themselves an override target are
 * never absorbed. When several overrides qualify, the nearest centre wins so
 * two cities in one region can each claim their own suburbs.
 */
export function pickRegionOverrideForLocality<
  T extends CommunityRegionOverrideSchema,
>(
  locality: {
    communityKey: string;
    geography: CommunityGeographySchema;
    center: { lat: number; lng: number } | null;
  },
  overrides: Iterable<T>,
): T | null {
  if (!locality.center) {
    return null;
  }

  const candidates = [...overrides];
  if (
    candidates.some(
      (override) => override.target_community_key === locality.communityKey,
    )
  ) {
    return null;
  }

  let best: { override: T; distanceKm: number } | null = null;
  for (const override of candidates) {
    if (!communityGeographyMatchesRegionOverride(locality.geography, override)) {
      continue;
    }
    const distanceKm = getRegionOverrideDistanceKm(override, locality.center);
    if (distanceKm > override.radius_km) {
      continue;
    }
    if (
      !best ||
      distanceKm < best.distanceKm ||
      (distanceKm === best.distanceKm &&
        override.target_community_key < best.override.target_community_key)
    ) {
      best = { override, distanceKm };
    }
  }

  return best?.override ?? null;
}
