import type { CommunitySearchPreview } from "../../services/search.service";
import type { VisibleViewport } from "../maps/map-base";

/** Broad discovery bounds are not country borders. Prefer local evidence,
 * retaining both countries at borders, rather than treating overlap as membership. */
export function relevantMapCommunities(
  communities: CommunitySearchPreview[],
  viewport: VisibleViewport,
  spotCountries: readonly string[] = [],
): CommunitySearchPreview[] {
  if (viewport.zoom < 7) return communities;
  const local = communities.filter((community) => community.scope !== "country");
  const countries = communities.filter((community) => community.scope === "country");
  const codes = new Set(
    [...spotCountries, ...local.map((community) => community.countryCode ?? "")]
      .filter(Boolean).map((code) => code.toUpperCase()),
  );
  const matches = countries.filter((community) =>
    codes.has(community.countryCode?.toUpperCase() ?? ""),
  );
  if (matches.length) return [...local, ...matches];

  // Sparse areas still get a country suggestion. This is a distance fallback,
  // not a claim about political borders; no reverse-geocoding is needed.
  const { north, south, east, west } = viewport.bbox;
  const lat = (north + south) / 2;
  const lng = west + ((east - west + 360) % 360) / 2;
  const distance = (community: CommunitySearchPreview) => {
    if (!community.boundsCenter) return Infinity;
    const [latitude, longitude] = community.boundsCenter;
    const deltaLng = ((longitude - lng + 540) % 360) - 180;
    return (latitude - lat) ** 2 +
      (deltaLng * Math.cos(lat * Math.PI / 180)) ** 2;
  };
  const nearest = [...countries].sort((a, b) => distance(a) - distance(b))[0];
  return nearest ? [...local, nearest] : local;
}
