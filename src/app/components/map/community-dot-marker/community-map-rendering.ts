import type { CommunityMapMarker } from "./community-dot-marker.component";

export const COMMUNITY_DOT_SIZE_PX = 8;

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
