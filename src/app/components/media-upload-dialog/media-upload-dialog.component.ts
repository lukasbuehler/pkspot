import { Component, Inject, inject, signal, ViewChild } from "@angular/core";
import {
  MAT_DIALOG_DATA,
  MatDialogRef,
  MatDialogModule,
} from "@angular/material/dialog";
import { CommonModule } from "@angular/common";
import { MediaUpload } from "../media-upload/media-upload.component";
import { StorageBucket, MediaSchema } from "../../../db/schemas/Media";
import { MediaType } from "../../../db/models/Interfaces";
import { SpotsService } from "../../services/firebase/firestore/spots.service";
import { SpotEditsService } from "../../services/firebase/firestore/spot-edits.service";
import { SpotId } from "../../../db/schemas/SpotSchema";
import { AuthenticationService } from "../../services/firebase/authentication.service";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { MatSnackBar, MatSnackBarModule } from "@angular/material/snack-bar";
import { UserReferenceSchema } from "../../../db/schemas/UserSchema";
import { createUserReference } from "../../../scripts/Helpers";

export interface MediaUploadDialogData {
  spotId: SpotId;
  storageFolder?: StorageBucket;
  allowedMimeTypes?: string[];
  multipleAllowed?: boolean;
  currentMedia?: MediaSchema[];
}

@Component({
  selector: "app-media-upload-dialog",
  standalone: true,
  imports: [
    CommonModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MediaUpload,
    MatSnackBarModule,
  ],
  templateUrl: "./media-upload-dialog.component.html",
})
export class MediaUploadDialogComponent {
  private _spotEditsService = inject(SpotEditsService);
  private _auth = inject(AuthenticationService);
  private _snackBar = inject(MatSnackBar);

  storageFolder: StorageBucket;
  allowedMimeTypes: string[];
  multipleAllowed: boolean;

  constructor(
    @Inject(MAT_DIALOG_DATA) public data: MediaUploadDialogData,
    public dialogRef: MatDialogRef<MediaUploadDialogComponent>
  ) {
    this.storageFolder = data.storageFolder ?? StorageBucket.SpotPictures;
    this.allowedMimeTypes = data.allowedMimeTypes ?? [
      "image/jpg",
      "image/jpeg",
      "image/png",
    ];
    this.multipleAllowed = data.multipleAllowed ?? true;
  }

  protected uploading = signal(false);

  @ViewChild(MediaUpload) mediaUpload!: MediaUpload;

  onUploadingChange(isUploading: boolean) {
    this.uploading.set(isUploading);
    this.dialogRef.disableClose = isUploading; // Prevent closing via backdrop/escape
  }

  abort() {
    if (this.mediaUpload) {
      this.mediaUpload.cancelBatch();
    }
    this.uploading.set(false);
    this.dialogRef.disableClose = false;
    this.close();
  }

  async onMediaBatchUploaded(
    events: { src: string; is_sized: boolean; type: MediaType }[]
  ) {
    const uid = this._auth.user?.uid;
    if (!uid) {
      console.error("Cannot append media: user not signed in");
      return;
    }

    const userReference = createUserReference(this._auth.user!.data!);
    const currentMedia = this.data.currentMedia || [];

    const newMediaItems: MediaSchema[] = events.map((event) => ({
      src: event.src,
      type: event.type,
      uid,
      origin: "user",
      isInStorage: true,
    }));

    const newMediaList = [...currentMedia, ...newMediaItems];

    try {
      await this._spotEditsService.createSpotUpdateEdit(
        this.data.spotId,
        { media: newMediaList },
        userReference
      );

      this.data.currentMedia = newMediaList;

      this._snackBar.open(
        `${newMediaItems.length} media item(s) added successfully!`,
        "Dismiss",
        {
          duration: 3000,
          horizontalPosition: "center",
          verticalPosition: "bottom",
        }
      );
    } catch (e) {
      console.error("Failed to append media to spot:", e);
      this._snackBar.open("Failed to add media. Please try again.", "Dismiss", {
        duration: 3000,
      });
    }
  }

  close() {
    this.dialogRef.close();
  }
}
