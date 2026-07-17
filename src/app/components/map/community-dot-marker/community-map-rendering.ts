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
