/**
 * Base configuration factory shared across commands.
 */

import * as path from "path";
import { ImportConfig } from "./types";

export function createBaseConfig(): ImportConfig {
  // After compilation, __dirname is dist/scripts/horizn-import/
  // We need to go up 3 levels to get to the horizn-import root
  const projectRoot = path.join(__dirname, "../../..");

  return {
    serviceAccountKeyPath: path.join(projectRoot, "serviceAccountKey.json"),
    storageBucket: "parkour-base-project.appspot.com",
    jsonFilePath: path.join(projectRoot, "data/horizn-spots-output.json"),
    collectionName: "spots",
    defaultLocale: "en",
    importerUserId: "horizn-import-script",
    batchSize: 3,
    spotIdMapPath: path.join(projectRoot, "output/spot-id-map.json"),
  };
}
