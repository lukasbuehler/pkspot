/**
 * Base configuration factory shared across commands.
 */

import * as path from "path";
import { ImportConfig } from "./types";

export function createBaseConfig(): ImportConfig {
  return {
    serviceAccountKeyPath: path.join(__dirname, "../serviceAccountKey.json"),
    storageBucket: "parkour-base-project.appspot.com",
    jsonFilePath: path.join(__dirname, "../data/horizn-spots-output.json"),
    imagesFolderPath: path.join(__dirname, "../data/spots_pics"),
    storageBucketFolder: "spot_pictures",
    collectionName: "spots",
    defaultLocale: "en",
    importerUserId: "horizn-import-script",
    batchSize: 3,
    uploadImages: true,
    spotIdMapPath: path.join(__dirname, "../output/spot-id-map.json"),
  };
}
