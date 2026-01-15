import { Injectable, inject } from "@angular/core";
import { Observable } from "rxjs";
import { AuthenticationService } from "./authentication.service";
import { StorageMedia } from "../../../db/models/Media";
import { StorageBucket } from "../../../db/schemas/Media";
import { StorageAdapterService } from "./storage-adapter.service";

@Injectable({
  providedIn: "root",
})
export class StorageService {
  private storageAdapter = inject(StorageAdapterService);
  private authService = inject(AuthenticationService);

  private readonly isBrowser = typeof window !== "undefined";

  uploadObs: Observable<string> | null = null;

  getStoredContent() {}

  /**
   * Uploads a file or blob to a specified location in cloud storage.
   * Works on both web and native platforms via the StorageAdapterService.
   * @param blob The file/blob to upload
   * @param location The storage bucket/folder
   * @param progressCallback Optional callback for upload progress (0-100)
   * @param filename Optional filename (auto-generated if not provided)
   * @param fileEnding Optional file extension (e.g., "jpg", "png", "mp4")
   * @returns Promise which resolves to the download URL when upload is completed
   */
  setUploadToStorage(
    blob: Blob,
    location: StorageBucket,
    progressCallback?: (progressPercent: number) => void,
    filename?: string,
    fileEnding?: string
  ): Promise<string> {
    if (!this.isBrowser) {
      return Promise.reject(
        "Firebase Storage is not available on the server (SSR)"
      );
    }

    let uid: string | null = null;
    if (this.authService.isSignedIn) {
      uid = this.authService.user?.uid ?? null;
    } else {
      return Promise.reject("User is not signed in");
    }

    if (uid === null) {
      return Promise.reject("User is not signed in");
    }

    // Build the full storage path
    const storagePath = `${location}/${filename}${
      fileEnding ? "." + fileEnding : ""
    }`;

    // Determine content type from blob or file extension
    let contentType = blob.type;
    if (!contentType && fileEnding) {
      const mimeTypes: Record<string, string> = {
        jpg: "image/jpeg",
        jpeg: "image/jpeg",
        png: "image/png",
        gif: "image/gif",
        webp: "image/webp",
        mp4: "video/mp4",
        mov: "video/quicktime",
        webm: "video/webm",
      };
      contentType = mimeTypes[fileEnding.toLowerCase()] || "";
    }

    return this.storageAdapter.uploadFile({
      data: blob,
      path: storagePath,
      metadata: {
        uid: uid,
        contentType: contentType || undefined,
      },
      onProgress: progressCallback,
    });
  }

  deleteFromStorage(bucket: StorageBucket, filename: string): Promise<void>;
  deleteFromStorage(src: string): Promise<void>;
  deleteFromStorage(
    bucketOrSrc: StorageBucket | string,
    filename?: string
  ): Promise<void> {
    if (!this.isBrowser) {
      return Promise.reject(
        "Firebase Storage delete is not available on the server (SSR)"
      );
    }

    // Determine the path
    let path: string;
    if (filename === undefined) {
      // src is a full URL or path - extract the path
      const src = bucketOrSrc as string;
      // If it's a full URL, extract the path
      if (src.includes("firebasestorage.googleapis.com")) {
        // Extract path from URL like: .../o/{encoded-path}?alt=media
        const match = src.match(/\/o\/([^?]+)/);
        if (match) {
          path = decodeURIComponent(match[1]);
        } else {
          path = src;
        }
      } else {
        path = src;
      }
    } else {
      path = `${bucketOrSrc}/${filename}`;
    }

    return this.storageAdapter.deleteFile(path);
  }

  delete(file: StorageMedia) {
    file.getAllFileSrcs().map((src) => {
      this.deleteFromStorage(src);
    });
  }

  upload(): Observable<string> | null {
    return this.uploadObs;
  }
}
