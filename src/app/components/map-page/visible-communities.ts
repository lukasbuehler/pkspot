import type { CommunitySearchPreview } from "../../services/search.service";
import type { VisibleViewport } from "../maps/map-base";

/** A Spot reduced to what country selection needs. */
export interface CountryEvidence {
  countryCode: string;
  lat: number;
  lng: number;
}

/** Below this zoom the viewport spans several countries, so only the country
 * at the map centre is suggested; above it a border view may keep both sides. */
const BORDER_ZOOM = 10;

/**
 * Picks the communities to suggest for the current map view.
 *
 * Country discovery bounds come from the spread of a country's Spots, not from
 * its borders (Russia's radius reaches the UK), so they never decide membership.
 * Instead the country of the Spot or local community nearest to the map centre
 * wins; callers pass the Spot nearest to the centre (from search) along with the
 * visible ones, so a town without its own community still finds its country.
 * Only a close border view keeps every country with evidence inside it. Without
 * any evidence, the country whose centre is nearest is a distance fallback, not a
 * claim about borders; no reverse geocoding is needed.
 */
/** The visual centre of a Mercator map: the midpoint in projected space, since
 * averaging latitudes drifts south by degrees when zoomed out. */
export function mapCentre({ bbox: { north, south, east, west } }: VisibleViewport): { lat: number; lng: number } {
  const mercator = (latitude: number) => Math.log(Math.tan(Math.PI / 4 + latitude * Math.PI / 360));
  const lat = (2 * Math.atan(Math.exp((mercator(north) + mercator(south)) / 2)) - Math.PI / 2) * 180 / Math.PI;
  const lng = ((west + ((east - west + 360) % 360) / 2 + 540) % 360) - 180;
  return { lat, lng };
}

export function relevantMapCommunities(
  communities: CommunitySearchPreview[],
  viewport: VisibleViewport,
  spots: readonly CountryEvidence[] = [],
): CommunitySearchPreview[] {
  const local = communities.filter((community) => community.scope !== "country");
  const countries = communities.filter((community) => community.scope === "country");
  if (!countries.length) return local;

  const { north, south, east, west } = viewport.bbox;
  const { lat, lng } = mapCentre(viewport);
  const inView = (item: CountryEvidence) => item.lat >= south && item.lat <= north &&
    (west <= east ? item.lng >= west && item.lng <= east : item.lng >= west || item.lng <= east);
  const distance = (latitude: number, longitude: number) => {
    const deltaLng = ((longitude - lng + 540) % 360) - 180;
    return (latitude - lat) ** 2 + (deltaLng * Math.cos(lat * Math.PI / 180)) ** 2;
  };
  const byCode = (code: string | undefined) =>
    countries.filter((community) => community.countryCode?.toUpperCase() === code?.toUpperCase());

  const evidence: CountryEvidence[] = [
    ...spots.filter((spot) => spot.countryCode),
    ...local.flatMap((community) => community.countryCode && community.boundsCenter
      ? [{ countryCode: community.countryCode, lat: community.boundsCenter[0], lng: community.boundsCenter[1] }]
      : []),
  ];
  const nearestEvidence = [...evidence]
    .sort((a, b) => distance(a.lat, a.lng) - distance(b.lat, b.lng))
    .find((item) => byCode(item.countryCode).length);

  if (nearestEvidence) {
    if (viewport.zoom >= BORDER_ZOOM) {
      // Nearby local communities may reach into view from across a border
      // (Lille seen from Ghent), so only evidence inside the view counts here.
      const codes = new Set([nearestEvidence, ...evidence.filter(inView)]
        .map((item) => item.countryCode.toUpperCase()));
      return [...local, ...countries.filter((community) =>
        codes.has(community.countryCode?.toUpperCase() ?? ""))];
    }
    return [...local, ...byCode(nearestEvidence.countryCode)];
  }

  const nearest = [...countries].sort((a, b) =>
    (a.boundsCenter ? distance(...a.boundsCenter) : Infinity) -
    (b.boundsCenter ? distance(...b.boundsCenter) : Infinity))[0];
  return [...local, nearest];
}
