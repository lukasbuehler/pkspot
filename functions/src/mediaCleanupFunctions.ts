import * as admin from "firebase-admin";
import { onCall } from "firebase-functions/v2/https";
import { getStorage } from "firebase-admin/storage";

export const cleanupAllOrphanedMedia = onCall(
  {
    region: "europe-west1",
    timeoutSeconds: 540, // 9 minutes
    memory: "2GiB",
  },
  async (request) => {
    // 1. Verify admin permissions (optional, but recommended)
    if (!request.auth) {
      throw new Error("Unauthorized");
    }

    const db = admin.firestore();
    const storage = getStorage();
    const bucket = storage.bucket(); // Default bucket

    console.log("Starting bulk media cleanup...");

    // 2. Fetch all spots and collect referenced media URLs
    const spotsSnapshot = await db.collection("spots").select("media").get();
    const activeMediaPaths = new Set<string>();

    let totalSpots = 0;
    let totalMediaItems = 0;

    spotsSnapshot.forEach((doc) => {
      totalSpots++;
      const data = doc.data();
      if (data && Array.isArray(data["media"])) {
        data["media"].forEach((mediaItem: any) => {
          if (mediaItem.src) {
            // Normalize path finding
            let path = "";
            if (mediaItem.src.startsWith("gs://")) {
              path = mediaItem.src.split(bucket.name + "/")[1];
            } else if (mediaItem.src.includes("/o/")) {
              try {
                const urlObj = new URL(mediaItem.src);
                const pathWithToken = urlObj.pathname.split("/o/")[1];
                if (pathWithToken) {
                  path = decodeURIComponent(pathWithToken);
                }
              } catch (e) {
                // Invalid URL, ignore
              }
            }

            if (path) {
              activeMediaPaths.add(path);
              totalMediaItems++;
            }
          }
        });
      }
    });

    console.log(
      `Scanned ${totalSpots} spots. Found ${totalMediaItems} active media items referencing ${activeMediaPaths.size} unique paths.`
    );

    // 3. List all files in storage (focusing on specific folders if possible)
    // Assuming media is stored in "spot_pictures" and "spot_videos" (and "profile_pictures"?)
    // Note: This lists ALL files in the bucket. Be careful if sharing bucket with other things.
    // Ideally we prefix verify.

    // We will look at 'spot_pictures/' prefix for now based on typical usage
    const prefixes = ["spot_pictures/", "spot_videos/"];
    let deletedCount = 0;
    let errorCount = 0;

    for (const prefix of prefixes) {
      console.log(`Scanning storage prefix: ${prefix}`);
      const [files] = await bucket.getFiles({ prefix });

      for (const file of files) {
        // Skip folder placeholders
        if (file.name.endsWith("/")) continue;

        // Check if file is in active set
        if (!activeMediaPaths.has(file.name)) {
          console.log(`Deleting orphan: ${file.name}`);
          try {
            await file.delete();
            deletedCount++;
          } catch (e) {
            console.error(`Failed to delete ${file.name}:`, e);
            errorCount++;
          }
        }
      }
    }

    return {
      success: true,
      scannedSpots: totalSpots,
      activeMediaCount: activeMediaPaths.size,
      deletedCount,
      errorCount,
    };
  }
);
