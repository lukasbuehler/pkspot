/**
 * Storage Uploader
 *
 * Handles uploading images to Firebase Storage with proper metadata
 * and retrieves download URLs for use in Firestore.
 */

import * as fs from "fs";
import * as path from "path";
import { MediaSchema } from "../../src/db/schemas/Media";
import { MediaType } from "../../src/db/models/Interfaces";

/**
 * Gets MIME type based on file extension
 */
function getContentType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const types: Record<string, string> = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".mp4": "video/mp4",
    ".mov": "video/quicktime",
  };
  return types[ext] || "application/octet-stream";
}

/**
 * Uploads a single image to Firebase Storage
 *
 * This function:
 * 1. Uploads the file to Storage with proper metadata (uid)
 * 2. Waits for the upload to complete
 * 3. Retrieves the full download URL with access token
 * 4. Returns the URL for storage in Firestore
 *
 * IMPORTANT: The download URL includes the access token and is immediately usable.
 * Cloud functions will process the image and create thumbnails automatically.
 *
 * @param bucket - Firebase Storage bucket
 * @param localPath - Local file path to upload
 * @param destinationPath - Storage path (e.g., "spot_pictures/image123.jpg")
 * @param userId - User ID to set in metadata (for attribution)
 * @returns Full download URL with token, or null on error
 */
export async function uploadImage(
  bucket: any, // Firebase Storage Bucket type
  localPath: string,
  destinationPath: string,
  userId: string
): Promise<string | null> {
  try {
    // Upload with custom metadata (uid field)
    // This metadata persists through cloud function processing
    const [file] = await bucket.upload(localPath, {
      destination: destinationPath,
      metadata: {
        contentType: getContentType(localPath),
        metadata: {
          uid: userId, // Critical: tracks who uploaded this
        },
      },
    });

    // Get the download URL with access token
    // This is what StorageImage/StorageMedia expects
    const [downloadUrl] = await file.getSignedUrl({
      action: "read",
      expires: "03-01-2500", // Far future expiry
    });

    return downloadUrl;
  } catch (error: any) {
    console.error(
      `  ✗ Error uploading ${path.basename(localPath)}:`,
      error.message
    );
    return null;
  }
}

/**
 * Uploads all images for a spot and creates MediaSchema array
 *
 * Process:
 * 1. Iterate through image filenames
 * 2. Check if file exists locally
 * 3. Upload to Storage with metadata
 * 4. Get download URL
 * 5. Create MediaSchema entry with proper fields
 *
 * @param imageFiles - Array of image filenames
 * @param imagesFolderPath - Local folder containing images
 * @param bucket - Firebase Storage bucket
 * @param storageBucketFolder - Storage destination folder
 * @param userId - User ID for metadata
 * @returns Array of MediaSchema objects ready for Firestore
 */
export async function uploadSpotImages(
  imageFiles: string[],
  imagesFolderPath: string,
  bucket: any, // Firebase Storage Bucket type
  storageBucketFolder: string,
  userId: string
): Promise<MediaSchema[]> {
  const mediaSchemas: MediaSchema[] = [];

  for (const fileName of imageFiles) {
    const localImagePath = path.join(imagesFolderPath, fileName);

    // Verify file exists
    if (!fs.existsSync(localImagePath)) {
      console.warn(`  ⚠️  Image not found: ${fileName}`);
      continue;
    }

    // Upload to Storage
    const storageDestination = `${storageBucketFolder}/${fileName}`;
    const downloadUrl = await uploadImage(
      bucket,
      localImagePath,
      storageDestination,
      userId
    );

    if (downloadUrl) {
      // Create MediaSchema with all required fields
      // This matches what the app expects from user uploads
      const mediaSchema: MediaSchema = {
        src: downloadUrl, // Full URL with token
        type: MediaType.Image, // Horizn only has images
        uid: userId, // Who uploaded it
        isInStorage: true, // Critical: tells app this is in Firebase Storage
        origin: "user", // Origin of the media
      };

      mediaSchemas.push(mediaSchema);
      console.log(`  ✓ Uploaded: ${fileName}`);
    }
  }

  return mediaSchemas;
}
