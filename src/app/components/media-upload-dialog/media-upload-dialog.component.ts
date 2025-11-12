import { Component, Inject, inject } from "@angular/core";
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
import { UserReferenceSchema } from "../../../db/schemas/UserSchema";
import { createUserReference } from "../../../scripts/Helpers";

export interface MediaUploadDialogData {
  spotId: SpotId;
  storageFolder?: StorageBucket;
  allowedMimeTypes?: string[];
  multipleAllowed?: boolean;
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
  ],
  templateUrl: "./media-upload-dialog.component.html",
})
export class MediaUploadDialogComponent {
  private _spotEditsService = inject(SpotEditsService);
  private _auth = inject(AuthenticationService);

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

  async onNewMedia(event: { src: string; is_sized: boolean; type: MediaType }) {
    const uid = this._auth.user?.uid;
    if (!uid) {
      console.error("Cannot append media: user not signed in");
      return;
    }

    const mediaItem: MediaSchema = {
      src: event.src,
      type: event.type,
      uid,
      origin: "user",
      isInStorage: true,
    };

    const userReference = createUserReference(this._auth.user.data!);

    try {
      await this._spotEditsService.appendSpotMediaEdit(
        this.data.spotId,
        mediaItem,
        userReference
      );
    } catch (e) {
      console.error("Failed to append media to spot:", e);
    }
  }

  close() {
    this.dialogRef.close();
  }
}
