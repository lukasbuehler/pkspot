import { inject, Injectable } from "@angular/core";
import { Observable } from "rxjs";
import { generateUUID } from "../../../scripts/Helpers";

import { getDownloadURL, Storage } from "@angular/fire/storage";
import { deleteObject, ref } from "@firebase/storage";
import { uploadBytesResumable } from "@firebase/storage";
import { AuthenticationService } from "./authentication.service";
import { StorageMedia } from "../../../db/models/Media";

export enum StorageBucket {
  PostMedia = "post_media",
  ProfilePictures = "profile_pictures",
  SpotPictures = "spot_pictures",
  Challenges = "challenges",
}

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
   * @returns Observable which sends the download URL as soon as the upload is completed
   */
  setUploadToStorage(
    blob: Blob,
    location: StorageBucket,
    progressCallback?: (progressPercent: number) => void,
    filename?: string
  ): Promise<string> {
    let uploadFileName = filename || generateUUID();
    let uploadRef = ref(this.storage, `${location}/${uploadFileName}`);

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
          resolve(getDownloadURL(uploadTask.snapshot.ref));
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
