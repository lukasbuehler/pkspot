import {
  normalizePublicSpotNoticeType,
  PublicSpotNotice,
} from "../../../db/schemas/SpotPublicNotice";

export const localizedPublicSpotWarning = (
  notice: PublicSpotNotice | undefined,
  legacyReason: string | undefined,
): string => {
  switch (normalizePublicSpotNoticeType(notice, legacyReason)) {
    case "destroyed":
      return $localize`:@@spot.public-warning.destroyed:This Spot may have been removed or destroyed.`;
    case "inaccessible":
      return $localize`:@@spot.public-warning.inaccessible:This Spot may be inaccessible.`;
    case "temporarily_closed":
      return $localize`:@@spot.public-warning.temporarily-closed:This Spot may currently be closed.`;
    case "access_concern":
      return $localize`:@@spot.public-warning.access-concern:Access to this Spot may be restricted or unavailable.`;
    case "duplicate":
      return $localize`:@@spot.public-warning.duplicate:This Spot may be a duplicate.`;
    case "other":
      return $localize`:@@spot.public-warning.other:Information about this Spot may be outdated. Please use caution.`;
  }
};
