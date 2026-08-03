import { ChangeDetectionStrategy, Component, inject } from "@angular/core";
import { MAT_DIALOG_DATA, MatDialogRef } from "@angular/material/dialog";
import { CropImageComponent } from "./crop-image.component";
import type { ImageCropPolicy } from "./image-crop-policy";

export interface ImageCropDialogData {
  file: File;
  policy: ImageCropPolicy;
  title?: string;
}

@Component({
  selector: "app-image-crop-dialog",
  imports: [CropImageComponent],
  templateUrl: "./image-crop-dialog.component.html",
  styleUrl: "./image-crop-dialog.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ImageCropDialogComponent {
  readonly data = inject<ImageCropDialogData>(MAT_DIALOG_DATA);
  readonly defaultTitle = $localize`Crop image`;
  private readonly dialogRef =
    inject<MatDialogRef<ImageCropDialogComponent, File | undefined>>(
      MatDialogRef,
    );

  apply(file: File): void {
    this.dialogRef.close(file);
  }

  cancel(): void {
    this.dialogRef.close();
  }
}
