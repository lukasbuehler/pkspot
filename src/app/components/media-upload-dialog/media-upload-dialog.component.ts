import { Component, Inject, inject, signal, ViewChild, ChangeDetectionStrategy } from "@angular/core";
import {
  MAT_DIALOG_DATA,
  MatDialogRef,
  MatDialogModule,
} from "@angular/material/dialog";
import { CommonModule } from "@angular/common";
import { MediaUpload } from "../media-upload/media-upload.component";
import { StorageBucket, MediaSchema } from "../../../db/schemas/Media";
import { MediaType } from "../../../db/models/Interfaces";
import { SpotId } from "../../../db/schemas/SpotSchema";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { MatSnackBar, MatSnackBarModule } from "@angular/material/snack-bar";

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
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: "./media-upload-dialog.component.html",
})
export class MediaUploadDialogComponent {
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
    console.log("MediaUploadDialog: onMediaBatchUploaded called", events);
    this._snackBar.open(
      $localize`Media uploaded. It will appear after the safety check finishes.`,
      $localize`Dismiss`,
      {
        duration: 4000,
        horizontalPosition: "center",
        verticalPosition: "bottom",
      }
    );
  }

  close() {
    this.dialogRef.close();
  }
}
