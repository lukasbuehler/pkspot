import type { SpotPreviewData } from "../../db/schemas/SpotPreviewData";
import type { CommunityLandingPageData } from "../services/firebase/firestore/landing-pages.service";

export function collectCommunitySpotDirectory(
  pageData: CommunityLandingPageData,
  limit: number = 50,
): SpotPreviewData[] {
  const seen = new Set<string>();
  const spots = [
    ...pageData.communityPicks.flatMap((section) => section.spots),
    ...pageData.spots,
    ...pageData.topRatedSpots,
    ...pageData.drySpots,
  ];

  return spots
    .filter((spot) => {
      const key = spot.slug ?? spot.id;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    })
    .slice(0, limit);
}
