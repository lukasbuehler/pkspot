import * as admin from "firebase-admin";
import { setGlobalOptions } from "firebase-functions/v2/options";

import {
  countFollowersOnWrite,
  countFollowingOnWrite,
  countPostLikesOnWrite,
} from "./postFunctions";
import { computeRatingOnWrite, updateAllSpotAddresses } from "./spotFunctions";
import {
  clusterAllSpotsOnRun,
  clusterAllSpotsOnSchedule,
} from "./spotClusteringFunctions";
import { fixSpotLocations, fixLocaleMaps } from "./fixFunctions";

setGlobalOptions({ maxInstances: 10 });
admin.initializeApp();

// post functions
export { countFollowersOnWrite, countFollowingOnWrite, countPostLikesOnWrite };

// spot functions
export { updateAllSpotAddresses, computeRatingOnWrite };

// spot clustering functions
export { clusterAllSpotsOnRun, clusterAllSpotsOnSchedule };

// fixes
export { fixSpotLocations, fixLocaleMaps };

// storage triggers
export { processVideoUpload } from "./storageFunctions";
