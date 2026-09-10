import type { CommunityMapMarker } from "./community-dot-marker.component";
import {
  getTileCoordinatesForLocationAndZoom,
} from "../../../../scripts/TileCoordinateHelpers";

export const COMMUNITY_DOT_SIZE_PX = 8;
export const COMMUNITY_DOTS_PER_TILE = 10;

export function limitCommunityDotsPerTile(
  communities: readonly CommunityMapMarker[],
  zoom: number,
): CommunityMapMarker[] {
  const tileZoom = Math.max(2, Math.min(16, Math.floor(zoom))) & ~1;
  const tileCounts = new Map<string, number>();

  return communities.filter((community) => {
    const tile = getTileCoordinatesForLocationAndZoom(
      community.center.lat,
      community.center.lng,
      tileZoom,
    );
    const tileKey = `${tile.x}:${tile.y}`;
    const count = tileCounts.get(tileKey) ?? 0;
    if (count >= COMMUNITY_DOTS_PER_TILE) return false;

    tileCounts.set(tileKey, count + 1);
    return true;
  });
}

export function shouldShowCommunityAreaPresence(
  community: CommunityMapMarker,
): boolean {
  return !community.pinVisible || community.showAreaPresence === true;
}

/** Full locality pins yield once their geographic circle is larger than the pin. */
export function shouldShowCommunityPin(
  community: CommunityMapMarker,
  zoom: number,
): boolean {
  if (!community.pinVisible) return false;
  if (community.scope !== "locality" || !shouldShowCommunityAreaPresence(community)) {
    return true;
  }

  // The icon pin is approximately 48 CSS pixels before its marker scale.
  return communityCircleDiameterPx(community, zoom) <= 48 * (community.pinSize ?? 0.86);
}

export function shouldShowCommunityDot(
  community: CommunityMapMarker,
  zoom: number,
): boolean {
  if (community.scope !== "locality") return false;

  return communityCircleDiameterPx(community, zoom) <= COMMUNITY_DOT_SIZE_PX;
}

export function communityCircleDiameterPx(
  community: CommunityMapMarker,
  zoom: number,
): number {
  return (
    (community.radiusM * 2) /
    metersPerPixelAtLatitude(community.center.lat, zoom)
  );
}

function metersPerPixelAtLatitude(latitude: number, zoom: number): number {
  const latitudeRadians = (latitude * Math.PI) / 180;
  return (156_543.033_92 * Math.cos(latitudeRadians)) / Math.pow(2, zoom);
}
