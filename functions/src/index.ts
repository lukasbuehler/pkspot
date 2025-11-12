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
  updateAllSpotAddresses,
  computeRatingOnWrite,
  updateAllEmptyAddressesOnSchedule,
} from "./spotFunctions";

// spot edit functions
export { applySpotEditOnCreate } from "./spotEditFunctions";

// spot clustering functions
export {
  clusterAllSpotsOnRun,
  clusterAllSpotsOnSchedule,
} from "./spotClusteringFunctions";

// fixes
export { fixSpotLocations, fixLocaleMaps } from "./fixFunctions";

// storage triggers
export { processVideoUpload } from "./storageFunctions";

// spot challenge functions
export { setTopChallengesForSpotOnWrite } from "./spotChallengeFunctions";

// social card functions
// export {
//   generateSocialCards,
//   onUserProfileUpdate,
// } from "./socialCardFunctions";
