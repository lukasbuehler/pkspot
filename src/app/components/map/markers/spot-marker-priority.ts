import {
  getSpotPriority,
  SpotPriorityInput,
} from "../../../../db/schemas/SpotPriority";
import { SpotPreviewData } from "../../../../db/schemas/SpotPreviewData";

export function getSpotMarkerPriority(spot: SpotPriorityInput): number {
  return getSpotPriority(spot);
}

function previewPriority(spot: SpotPreviewData): number {
  return getSpotMarkerPriority({
    recent_activity_min_30d: spot.recent_activity_min_30d,
    rating: spot.rating,
    access: spot.access,
    isIconic: spot.isIconic,
    isReported: spot.isReported,
    hasMedia: !!spot.imageSrc,
  });
}

/**
 * Orders Spot previews for lists and markers: higher priority first, so
 * private, off-limits and reported Spots fall behind comparable public ones
 * whatever order the search returned. Ties go to Spots with a photo.
 */
export function compareSpotPreviewsByPriority(
  a: SpotPreviewData,
  b: SpotPreviewData,
): number {
  const priorityDifference = previewPriority(b) - previewPriority(a);
  if (priorityDifference !== 0) return priorityDifference;
  const aHasImage = !!a.imageSrc;
  if (aHasImage === !!b.imageSrc) return 0;
  return aHasImage ? -1 : 1;
}
