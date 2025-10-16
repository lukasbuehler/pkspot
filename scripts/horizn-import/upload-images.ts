/**
 * Upload images for spots based on mapping file.
 */

import * as admin from "firebase-admin";
import * as fs from "fs";
import { createBaseConfig } from "./config";
import { ImportConfig, SpotIdMappingFile, SpotIdMappingEntry } from "./types";
import { uploadSpotImages } from "./storageUploader";

async function run(): Promise<void> {
  const config: ImportConfig = createBaseConfig();

  // Load mapping file
  if (!config.spotIdMapPath || !fs.existsSync(config.spotIdMapPath)) {
    throw new Error(
      `Mapping file not found at ${config.spotIdMapPath}. Run spot import first.`
    );
  }

  const mappingData: SpotIdMappingFile = JSON.parse(
    fs.readFileSync(config.spotIdMapPath, "utf8")
  );

  const entries = mappingData.entries.filter((entry) => {
    if (!entry.spotId) {
      console.warn(
        `Skipping entry ${entry.horiznIndex} (${entry.spotName}) because it has no spotId`
      );
      return false;
    }
    return true;
  });

  if (
    !config.serviceAccountKeyPath ||
    !fs.existsSync(config.serviceAccountKeyPath)
  ) {
    throw new Error(
      `Service account key not found: ${config.serviceAccountKeyPath}`
    );
  }

  const serviceAccount = JSON.parse(
    fs.readFileSync(config.serviceAccountKeyPath, "utf8")
  );

  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      storageBucket: config.storageBucket,
    });
  }

  const bucket = admin.storage().bucket();
  const db = admin.firestore();

  const updatedEntries: SpotIdMappingEntry[] = [];

  for (const entry of entries) {
    console.log(`\nUploading images for ${entry.spotName} (${entry.spotId})`);

    const mediaSchemas = await uploadSpotImages(
      entry.imageFiles,
      config.imagesFolderPath,
      bucket as any,
      config.storageBucketFolder,
      config.importerUserId
    );

    if (mediaSchemas.length === 0) {
      console.warn("  ⚠️  No images uploaded.");
      updatedEntries.push(entry);
      continue;
    }

    await db
      .collection(config.collectionName)
      .doc(entry.spotId!)
      .update({ media: mediaSchemas });

    console.log(`  ✓ Uploaded ${mediaSchemas.length} images.`);
    updatedEntries.push({
      ...entry,
      imagesUploaded: mediaSchemas.length,
    });
  }

  const updatedMapping: SpotIdMappingFile = {
    ...mappingData,
    lastUploadRunAt: new Date().toISOString(),
    entries: mappingData.entries.map((entry) => {
      const updated = updatedEntries.find(
        (e) => e.horiznIndex === entry.horiznIndex
      );
      return updated ? updated : entry;
    }),
  };

  fs.writeFileSync(
    config.spotIdMapPath,
    JSON.stringify(updatedMapping, null, 2),
    "utf8"
  );

  console.log("\n✨ Image upload run complete!");
}

run().catch((error) => {
  console.error("\n❌ Fatal error:", error.message);
  process.exit(1);
});
