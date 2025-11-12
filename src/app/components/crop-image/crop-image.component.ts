import { Component, EventEmitter, Input, Output, OnInit } from "@angular/core";
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
  standalone: true,
  imports: [ImageCropperComponent, MatButton, MatCard, MatCardContent, MatIcon],
})
export class CropImageComponent implements OnInit {
  /** The image source (base64 data URL) */
  @Input() imageSource: string = "";

  /** Emits the cropped image blob when user confirms */
  @Output() imageCropped = new EventEmitter<Blob>();

  /** Emits when the user cancels */
  @Output() cancelled = new EventEmitter<void>();

  croppedImage: string = "";
  isProcessing: boolean = false;

  ngOnInit() {
    // Reset states
    this.croppedImage = "";
    this.isProcessing = false;
  }

  /**
   * Handle image cropped event from the cropper
   */
  imageCroppedEventHandler(event: ImageCroppedEvent) {
    this.croppedImage = event.objectUrl || "";
  }

  /**
   * Convert the cropped image to a blob and emit it
   */
  saveCroppedImage() {
    this.isProcessing = true;

    if (this.croppedImage) {
      // Convert the cropped image URL to a blob
      fetch(this.croppedImage)
        .then((response) => response.blob())
        .then((blob) => {
          this.imageCropped.emit(blob);
          this.isProcessing = false;
        })
        .catch((error) => {
          console.error("Error converting cropped image to blob:", error);
          this.isProcessing = false;
        });
    }
  }

  /**
   * Cancel cropping
   */
  cancelCrop() {
    this.cancelled.emit();
  }
}
