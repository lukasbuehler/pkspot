import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
  signal,
} from "@angular/core";
import { ImageCroppedEvent, ImageCropperComponent } from "ngx-image-cropper";
import { MatButton } from "@angular/material/button";
import { MatCard, MatCardContent } from "@angular/material/card";
import { MatIcon } from "@angular/material/icon";

/**
 * Component for cropping images with a circular mask (for profile pictures)
 * Emits the cropped image as a blob when the user confirms
 */
@Component({
  selector: "app-crop-image",
  templateUrl: "./crop-image.component.html",
  styleUrls: ["./crop-image.component.scss"],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ImageCropperComponent, MatButton, MatCard, MatCardContent, MatIcon],
})
export class CropImageComponent {
  /** The image source (base64 data URL) */
  readonly imageSource = input("");

  /** Emits the cropped image blob when user confirms */
  readonly imageCropped = output<Blob>();

  /** Emits when the user cancels */
  readonly cancelled = output<void>();

  readonly croppedImage = signal("");
  readonly isProcessing = signal(false);

  /**
   * Handle image cropped event from the cropper
   */
  imageCroppedEventHandler(event: ImageCroppedEvent) {
    this.croppedImage.set(event.objectUrl || "");
  }

  /**
   * Convert the cropped image to a blob and emit it
   */
  saveCroppedImage() {
    const croppedImage = this.croppedImage();

    if (!croppedImage) {
      return;
    }

    this.isProcessing.set(true);

    fetch(croppedImage)
      .then((response) => response.blob())
      .then((blob) => {
        this.imageCropped.emit(blob);
      })
      .catch((error) => {
        console.error("Error converting cropped image to blob:", error);
      })
      .finally(() => {
        this.isProcessing.set(false);
      });
  }

  /**
   * Cancel cropping
   */
  cancelCrop() {
    this.cancelled.emit();
  }
}
