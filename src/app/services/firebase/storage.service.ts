import { inject, Injectable } from "@angular/core";
import { Observable } from "rxjs";
import { generateUUID } from "../../../scripts/Helpers";

import { getDownloadURL, Storage } from "@angular/fire/storage";
import { deleteObject, ref, uploadBytes } from "@firebase/storage";
import { uploadBytesResumable } from "@firebase/storage";
import { SizedStorageSrc } from "../../../db/models/Interfaces";

export enum StorageFolder {
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
    location: StorageFolder,
    progressCallback?: (progressPercent: number) => void,
    filename?: string
  ): Promise<string> {
    let uploadFileName = filename || generateUUID();
    let uploadRef = ref(this.storage, `${location}/${uploadFileName}`);

    // return uploadBytes(uploadRef, blob).then((snapshot) => {
    //   return getDownloadURL(snapshot.ref);
    // });

    return new Promise<string>((resolve, reject) => {
      const uploadTask = uploadBytesResumable(uploadRef, blob);

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

  deleteFromStorage(location: StorageFolder, filename: string): Promise<void> {
    return deleteObject(ref(this.storage, `${location}/${filename}`));
  }

  deleteSpotImageFromStorage(filename: string): Promise<void> {
    return Promise.all([
      this.deleteFromStorage(StorageFolder.SpotPictures, filename + "_200x200"),
      this.deleteFromStorage(StorageFolder.SpotPictures, filename + "_400x400"),
      this.deleteFromStorage(StorageFolder.SpotPictures, filename + "_800x800"),
    ]).then(() => {
      return;
    });
  }

  upload(): Observable<string> | null {
    return this.uploadObs;
  }

  static getSrc(src: SizedStorageSrc, size: 200 | 400 | 800): string {
    return src.replace(/\?/, `_${size}x${size}?`);
  }

  static getStorageSrcFromSrc(url: string): SizedStorageSrc {
    return url.replace(/_\d+x\d+\?/, "?") as SizedStorageSrc;
  }
}
