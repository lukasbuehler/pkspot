import { inject, Injectable } from "@angular/core";
import { Observable } from "rxjs";

import { getDownloadURL, Storage } from "@angular/fire/storage";
import { deleteObject, ref } from "@firebase/storage";
import { uploadBytesResumable } from "@firebase/storage";
import { AuthenticationService } from "./authentication.service";
import { StorageMedia } from "../../../db/models/Media";
import { StorageBucket } from "../../../db/schemas/Media";

@Injectable({
  providedIn: "root",
})
export class StorageService {
  storage = inject(Storage);
  authService = inject(AuthenticationService);

  constructor() {}

  uploadObs: Observable<string> | null = null;

  getStoredContent() {}

  /**
   * Uploads a file or blob to a specified locatin in cloud storage
   * @param blob
   * @param location
   * @param filename
   * @param fileEnding
   * @returns Observable which sends the download URL as soon as the upload is completed
   */
  setUploadToStorage(
    blob: Blob,
    location: StorageBucket,
    progressCallback?: (progressPercent: number) => void,
    filename?: string,
    fileEnding?: string // e.g "jpg", "png", "mp4"
  ): Promise<string> {
    let uploadRef = ref(
      this.storage,
      `${location}/${filename}${fileEnding ? "." + fileEnding : ""}`
    );
    // return uploadBytes(uploadRef, blob).then((snapshot) => {
    //   return getDownloadURL(snapshot.ref);
    // });

    let uid: string | null = null;
    if (this.authService.isSignedIn) {
      uid = this.authService.user?.uid ?? null;
    } else {
      return Promise.reject("User is not signed in");
    }

    return new Promise<string>((resolve, reject) => {
      if (uid === null) {
        reject("User is not signed in");
        return;
      }

      const uploadTask = uploadBytesResumable(uploadRef, blob, {
        customMetadata: {
          uid: uid,
        },
      });

      uploadTask.on(
        "state_changed",
        (snapshot) => {
          // Observe state change events such as progress, pause, and resume
          // Get task progress, including the number of bytes uploaded and the total number of bytes to be uploaded
          const progress =
            (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
          console.debug("Upload is " + progress + "% done");
          if (progressCallback) {
            progressCallback(progress);
          }
        },
        (error) => {
          // Handle unsuccessful uploads
          reject(error);
        },
        () => {
          // Handle successful uploads on complete
          // For instance, get the download URL: https://firebasestorage.googleapis.com/...

          const downloadUrl = getDownloadURL(uploadTask.snapshot.ref).then(
            (url) => url.replace(/\.mov\?/i, ".mp4?")
          );

          resolve(downloadUrl);
        }
      );
    });
  }

  deleteFromStorage(bucket: StorageBucket, filename: string): Promise<void>;
  deleteFromStorage(src: string): Promise<void>;
  deleteFromStorage(
    bucketOrSrc: StorageBucket | string,
    filename?: string
  ): Promise<void> {
    if (filename === undefined) {
      return deleteObject(ref(this.storage, bucketOrSrc as string));
    }
    return deleteObject(ref(this.storage, `${bucketOrSrc}/${filename}`));
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
