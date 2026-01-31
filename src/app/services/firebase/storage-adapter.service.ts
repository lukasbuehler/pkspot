import {
  Injectable,
  inject,
  Injector,
  runInInjectionContext,
} from "@angular/core";
import { PlatformService } from "../platform.service";

// Web imports (AngularFire)
import {
  Storage,
  ref,
  uploadBytesResumable,
  getDownloadURL,
  deleteObject,
} from "@angular/fire/storage";

// Native imports (Capacitor Firebase)
import { FirebaseStorage } from "@capacitor-firebase/storage";
import { Filesystem, Directory } from "@capacitor/filesystem";

/**
 * Options for uploading a file to Firebase Storage.
 */
export interface UploadFileOptions {
  /**
   * The file data to upload.
   * - For web: Blob or File object
   * - For native: Can also be a file URI string (file:///...)
   */
  data: Blob | string;

  /**
   * The full path in storage (e.g., "spot-pictures/uuid.jpg")
   */
  path: string;

  /**
   * Optional metadata for the uploaded file.
   */
  metadata?: {
    uid?: string;
    contentType?: string;
    cacheControl?: string;
    customMetadata?: Record<string, string>;
  };

  /**
   * Callback for upload progress updates (0-100).
   */
  onProgress?: (percent: number) => void;
}

/**
 * StorageAdapterService provides a unified API for Firebase Storage operations
 * that works on both web (via @angular/fire) and native platforms
 * (via @capacitor-firebase/storage).
 *
 * This abstraction allows the rest of the application to use the same
 * code regardless of the platform, while ensuring native performance
 * on iOS/Android.
 */
@Injectable({
  providedIn: "root",
})
export class StorageAdapterService {
  private platformService = inject(PlatformService);
  private storage = inject(Storage);
  private injector = inject(Injector);

  constructor() {
    console.log(
      `[StorageAdapter] Initialized for platform: ${this.platformService.getPlatform()}`
    );
  }

  // ============================================================================
  // UPLOAD OPERATIONS
  // ============================================================================

  /**
   * Upload a file to Firebase Storage.
   * @param options Upload options including data, path, metadata, and progress callback
   * @returns Promise resolving to the public download URL
   */
  async uploadFile(options: UploadFileOptions): Promise<string> {
    if (this.platformService.isNative()) {
      return this.uploadFileNative(options);
    }
    return this.uploadFileWeb(options);
  }

  private async uploadFileWeb(options: UploadFileOptions): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      runInInjectionContext(this.injector, () => {
        // Ensure we have a Blob (web should always receive Blob)
        if (typeof options.data === "string") {
          reject(new Error("Web upload requires Blob data, not a file URI"));
          return;
        }

        const blob = options.data;
        const uploadRef = ref(this.storage, options.path);

        const metadata: any = {};
        if (options.metadata?.contentType) {
          metadata.contentType = options.metadata.contentType;
        }
        if (options.metadata?.cacheControl) {
          metadata.cacheControl = options.metadata.cacheControl;
        }
        if (options.metadata?.uid || options.metadata?.customMetadata) {
          const customMetadata: Record<string, string> =
            options.metadata.customMetadata || {};
          if (options.metadata.uid) {
            customMetadata["uid"] = options.metadata.uid;
          }
          metadata.customMetadata = customMetadata;
        }

        const uploadTask = uploadBytesResumable(
          uploadRef,
          blob,
          Object.keys(metadata).length > 0 ? metadata : undefined
        );
        console.log("[StorageAdapter] Uploading with metadata:", metadata);

        uploadTask.on(
          "state_changed",
          (snapshot) => {
            const progress =
              (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
            console.debug(`[StorageAdapter] Upload is ${progress}% done`);
            if (options.onProgress) {
              options.onProgress(progress);
            }
          },
          (error) => {
            console.error("[StorageAdapter] Web upload error:", error);
            reject(error);
          },
          () => {
            // Generate public URL without token
            const bucket = this.storage.app.options.storageBucket;
            const encodedPath = encodeURIComponent(options.path);
            const publicUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodedPath}?alt=media`;

            // Normalize extensions
            const normalizedUrl = publicUrl
              .replace(/\.MP4\?/, ".mp4?")
              .replace(/\.mov\?/i, ".mp4?");

            resolve(normalizedUrl);
          }
        );
      });
    });
  }

  private async uploadFileNative(options: UploadFileOptions): Promise<string> {
    let fileUri: string;

    // If data is already a file URI string, use it directly
    if (typeof options.data === "string") {
      fileUri = options.data;
    } else {
      // Convert Blob to temporary file and get URI
      fileUri = await this.blobToFileUri(options.data, options.path);
    }

    // Prepare metadata
    const metadata: any = {
      contentType: options.metadata?.contentType,
      cacheControl: options.metadata?.cacheControl,
    };

    if (options.metadata?.uid || options.metadata?.customMetadata) {
      const customMetadata: Record<string, string> =
        options.metadata.customMetadata || {};
      if (options.metadata.uid) {
        customMetadata["uid"] = options.metadata.uid;
      }
      metadata.customMetadata = customMetadata;
    }

    return new Promise<string>((resolve, reject) => {
      FirebaseStorage.uploadFile(
        {
          path: options.path,
          uri: fileUri,
          metadata: metadata,
        },
        (event, error) => {
          if (error) {
            console.error("[StorageAdapter] Native upload error:", error);
            reject(error);
            return;
          }

          if (event) {
            // Report progress
            if (event.progress !== undefined && options.onProgress) {
              options.onProgress(event.progress * 100);
            }

            // Upload complete
            if (event.completed) {
              // Generate public URL without token (same format as web)
              // This matches the token-less URL format used in uploadFileWeb
              const bucket = this.storage.app.options.storageBucket;
              const encodedPath = encodeURIComponent(options.path);
              const publicUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodedPath}?alt=media`;

              // Clean up temporary file if we created one
              if (typeof options.data !== "string") {
                this.cleanupTempFile(options.path).catch(console.warn);
              }
              resolve(publicUrl);
            }
          }
        }
      );
    });
  }

  /**
   * Convert a Blob to a temporary file and return its URI.
   * Used on native platforms where the Capacitor plugin requires a file URI.
   */
  private async blobToFileUri(
    blob: Blob,
    storagePath: string
  ): Promise<string> {
    // Generate a temporary filename from the storage path
    const filename = `temp_upload_${storagePath.replace(/\//g, "_")}`;

    // Read blob as base64
    const base64Data = await this.blobToBase64(blob);

    // Write to temporary file
    const result = await Filesystem.writeFile({
      path: filename,
      data: base64Data,
      directory: Directory.Cache,
    });

    return result.uri;
  }

  /**
   * Convert a Blob to base64 string.
   */
  private blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const dataUrl = reader.result as string;
        // Remove the data URL prefix (e.g., "data:image/png;base64,")
        const base64 = dataUrl.split(",")[1];
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  /**
   * Clean up a temporary file after upload.
   */
  private async cleanupTempFile(storagePath: string): Promise<void> {
    const filename = `temp_upload_${storagePath.replace(/\//g, "_")}`;
    try {
      await Filesystem.deleteFile({
        path: filename,
        directory: Directory.Cache,
      });
    } catch (e) {
      // Ignore cleanup errors
    }
  }

  // ============================================================================
  // DELETE OPERATIONS
  // ============================================================================

  /**
   * Delete a file from Firebase Storage.
   * @param path Full path to the file in storage
   */
  async deleteFile(path: string): Promise<void> {
    if (this.platformService.isNative()) {
      return this.deleteFileNative(path);
    }
    return this.deleteFileWeb(path);
  }

  private async deleteFileWeb(path: string): Promise<void> {
    return runInInjectionContext(this.injector, async () => {
      const fileRef = ref(this.storage, path);
      await deleteObject(fileRef);
    });
  }

  private async deleteFileNative(path: string): Promise<void> {
    await FirebaseStorage.deleteFile({ path });
  }

  // ============================================================================
  // URL OPERATIONS
  // ============================================================================

  /**
   * Get the download URL for a file in Firebase Storage.
   * @param path Full path to the file in storage
   * @returns Promise resolving to the download URL
   */
  async getDownloadUrl(path: string): Promise<string> {
    if (this.platformService.isNative()) {
      return this.getDownloadUrlNative(path);
    }
    return this.getDownloadUrlWeb(path);
  }

  private async getDownloadUrlWeb(path: string): Promise<string> {
    return runInInjectionContext(this.injector, async () => {
      const fileRef = ref(this.storage, path);
      return getDownloadURL(fileRef);
    });
  }

  private async getDownloadUrlNative(path: string): Promise<string> {
    const { downloadUrl } = await FirebaseStorage.getDownloadUrl({ path });
    return downloadUrl;
  }

  // ============================================================================
  // UTILITY METHODS
  // ============================================================================

  /**
   * Check if running on native platform (iOS/Android).
   */
  isNative(): boolean {
    return this.platformService.isNative();
  }

  /**
   * Get the current platform.
   */
  getPlatform(): "ios" | "android" | "web" {
    return this.platformService.getPlatform();
  }
}
