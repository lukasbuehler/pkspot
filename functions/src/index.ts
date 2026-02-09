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
} from "./spotFunctions";

export {
  updateAllSpotAddresses,
  // updateAllEmptyAddressesOnSchedule,
} from "./spotAddressFunctions";

export { computeRatingOnWrite } from "./spotRatingFunctions";

// spot edit functions
export { applySpotEditOnCreate } from "./spotEditFunctions";
export { processImportChunkOnCreate } from "./importFunctions";

// spot clustering functions
export {
  clusterAllSpotsOnRun,
  clusterAllSpotsOnSchedule,
} from "./spotClusteringFunctions";

// fixes and migrations
export {
  fixSpotLocations,
  fixLocaleMaps,
  backfillSignupNumbers,
  recalculateUserEditStats,
} from "./fixFunctions";

// storage triggers
export { processVideoUpload } from "./storageFunctions";

// spot challenge functions
export { setTopChallengesForSpotOnWrite } from "./spotChallengeFunctions";

// media report functions
export { onMediaReportCreate } from "./mediaReportFunctions";

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

export {
  cleanupOnUserDelete,
  assignSignupNumberOnCreate,
} from "./authFunctions";

export { onCheckInCreate } from "./userFunctions";

export { cleanupAllOrphanedMedia } from "./mediaCleanupFunctions";
