import * as admin from "firebase-admin";
import { setGlobalOptions } from "firebase-functions/v2/options";

setGlobalOptions({ maxInstances: 10, region: "europe-west1" });
admin.initializeApp();

// post functions
export {
  countFollowersOnWrite,
  countFollowingOnWrite,
  countPostLikesOnWrite,
} from "./postFunctions";

// spot functions
export {
  updateSpotFieldsOnWrite,
  updateAllSpotsWithTypesenseFields,
  backfillAllSpotsWithLandingFields,
  auditReservedSpotSlugs,
  detectDuplicateSpots,
} from "./spotFunctions";

export {
  updateAllSpotAddresses,
  // updateAllEmptyAddressesOnSchedule,
} from "./spotAddressFunctions";

export {
  rebuildCommunityPagesOnSpotWrite,
  rebuildAllCommunityPages,
  rebuildCommunityEventPreviewsOnEventWrite,
} from "./communityFunctions";

// event functions
export {
  backfillSpotUpcomingEvents,
  countEventRsvpsOnWrite,
  syncSpotUpcomingEventsOnEventWrite,
  updateEventFieldsOnWrite,
  updateAllEventsWithTypesenseFields,
} from "./eventFunctions";

export { computeRatingOnWrite } from "./spotRatingFunctions";

// spot edit functions
export {
  applySpotEditOnCreate,
  evaluateSpotEditVotesOnVoteWrite,
  evaluatePendingSpotEditVotesOnSchedule,
  reviewVerifiedSpotEdit,
  setSpotVerification,
  setSpotOrganizationRelationship,
} from "./spotEditFunctions";
export { syncVerifiedSpotOrganizationSnapshots } from "./organizationFunctions";
export {
  processImportChunkOnCreate,
  retryFailedImportChunksOnCreate,
} from "./importFunctions";

// fixes and migrations
export {
  fixSpotLocations,
  fixLocaleMaps,
  backfillSignupNumbers,
  recalculateUserEditStats,
} from "./fixFunctions";

// storage triggers
export { processVideoUpload } from "./storageFunctions";
export {
  backfillStorageImageSizes,
  processImageUpload,
} from "./imageProcessingFunctions";

// spot challenge functions
export { setTopChallengesForSpotOnWrite } from "./spotChallengeFunctions";

// media report functions
export { onMediaReportCreate } from "./mediaReportFunctions";

// contact message functions
export { onContactMessageCreate } from "./contactMessageFunctions";

// spot report functions
export { onSpotReportCreate, resolveSpotReport } from "./spotReportFunctions";

// user report functions
export { onUserReportCreate } from "./userReportFunctions";

// sitemap functions
export {
  generateSitemapOnSchedule,
  generateSitemapManual,
} from "./sitemapFunctions";

// social card functions
// export {
//   generateSocialCards,
//   onUserProfileUpdate,
// } from "./socialCardFunctions";

export { cleanupOnUserDelete } from "./authFunctions";
export { assignSignupNumberOnCreate } from "./userSignupFunctions";

export {
  onCheckInCreate,
  syncVisitedSpotsCountOnPrivateDataWrite,
} from "./userFunctions";

export { cleanupAllOrphanedMedia } from "./mediaCleanupFunctions";
