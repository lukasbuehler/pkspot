import { Injectable, inject } from "@angular/core";
import { Observable } from "rxjs";
import { AuthenticationService } from "./authentication.service";
import { StorageMedia } from "../../../db/models/Media";
import { StorageBucket } from "../../../db/schemas/Media";
import type { MediaUploadTargetKind } from "../../../db/schemas/MediaModerationSchema";
import { generateUUID } from "../../../scripts/Helpers";
import { StorageAdapterService } from "./storage-adapter.service";

export interface StorageUploadResult {
  url: string;
  uploadId?: string;
  path: string;
  targetKind?: MediaUploadTargetKind;
  targetId?: string;
}

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
    fileEnding?: string,
    cacheControl?: string,
    targetKind?: MediaUploadTargetKind,
    targetId?: string
  ): Promise<string> {
    return this.setUploadToStorageWithResult(
      blob,
      location,
      progressCallback,
      filename,
      fileEnding,
      cacheControl,
      targetKind,
      targetId
    ).then((result) => result.url);
  }

  setUploadToStorageWithResult(
    blob: Blob,
    location: StorageBucket,
    progressCallback?: (progressPercent: number) => void,
    filename?: string,
    fileEnding?: string,
    cacheControl?: string,
    targetKind?: MediaUploadTargetKind,
    targetId?: string
  ): Promise<StorageUploadResult> {
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

    const normalizedFileEnding =
      fileEnding?.toLowerCase() ?? this.getExtensionFromContentType(blob.type);

    // Build the full storage path
    const storageFilename = filename ?? generateUUID();
    const extension = normalizedFileEnding ? "." + normalizedFileEnding : "";
    const storagePath = `${location}/${storageFilename}${extension}`;
    const resolvedTargetKind = targetKind ?? this.defaultTargetKind(location);

    // Determine content type from blob or file extension
    let contentType = blob.type;
    if (!contentType && normalizedFileEnding) {
      const mimeTypes: Record<string, string> = {
        jpg: "image/jpeg",
        jpeg: "image/jpeg",
        png: "image/png",
        gif: "image/gif",
        webp: "image/webp",
        mp4: "video/mp4",
        mov: "video/quicktime",
        webm: "video/webm",
        kml: "application/vnd.google-earth.kml+xml",
        kmz: "application/vnd.google-earth.kmz",
      };
      contentType = mimeTypes[normalizedFileEnding] || "";
    }

    if (this.requiresModeration(location)) {
      const uploadId = generateUUID();
      const intakeExtension =
        normalizedFileEnding ?? this.getExtensionFromContentType(contentType);
      const intakeFilename = `${uploadId}${intakeExtension ? "." + intakeExtension : ""}`;
      const intakePath = `${StorageBucket.MediaIntake}/${uid}/${uploadId}/${intakeFilename}`;
      const approvedPath = `${location}/${storageFilename}${
        location === StorageBucket.ProfilePictures ? "" : extension
      }`;

      return this.storageAdapter
        .uploadFile({
          data: blob,
          path: intakePath,
          metadata: {
            uid: uid,
            contentType: contentType || undefined,
            cacheControl: cacheControl,
            customMetadata: {
              upload_id: uploadId,
              destination_folder: location,
              destination_filename: storageFilename,
              target_kind: resolvedTargetKind,
              ...(targetId ? { target_id: targetId } : {}),
              ...(cacheControl ? { cache_control: cacheControl } : {}),
            },
          },
          onProgress: progressCallback,
        })
        .then(() => ({
          url: this.storageAdapter.buildPublicUrl(approvedPath),
          uploadId,
          path: approvedPath,
          targetKind: resolvedTargetKind,
          ...(targetId ? { targetId } : {}),
        }));
    }

    return this.storageAdapter
      .uploadFile({
        data: blob,
        path: storagePath,
        metadata: {
          uid: uid,
          contentType: contentType || undefined,
          cacheControl: cacheControl,
        },
        onProgress: progressCallback,
      })
      .then((url) => ({
        url,
        path: storagePath,
      }));
  }

  private requiresModeration(location: StorageBucket): boolean {
    return [
      StorageBucket.ProfilePictures,
      StorageBucket.SpotPictures,
      StorageBucket.PostMedia,
      StorageBucket.Challenges,
      StorageBucket.EventMedia,
    ].includes(location);
  }

  private defaultTargetKind(location: StorageBucket): MediaUploadTargetKind {
    switch (location) {
      case StorageBucket.ProfilePictures:
        return "profile";
      case StorageBucket.SpotPictures:
        return "spot";
      case StorageBucket.PostMedia:
        return "post";
      case StorageBucket.Challenges:
        return "challenge";
      case StorageBucket.EventMedia:
        return "event_media";
      default:
        return "post";
    }
  }

  private getExtensionFromContentType(contentType: string | undefined): string | undefined {
    const mimeTypes: Record<string, string> = {
      "image/jpeg": "jpg",
      "image/jpg": "jpg",
      "image/png": "png",
      "image/gif": "gif",
      "image/webp": "webp",
      "video/mp4": "mp4",
      "video/quicktime": "mov",
      "video/webm": "webm",
      "application/vnd.google-earth.kml+xml": "kml",
      "application/vnd.google-earth.kmz": "kmz",
    };
    return contentType ? mimeTypes[contentType] : undefined;
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
