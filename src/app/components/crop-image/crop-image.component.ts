import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
  signal,
  viewChild,
} from "@angular/core";
import {
  ImageCropperComponent,
  type ImageTransform,
} from "ngx-image-cropper";
import { MatButton } from "@angular/material/button";
import { MatIcon } from "@angular/material/icon";
import { MatSlider, MatSliderThumb } from "@angular/material/slider";
import {
  cropOutputFormat,
  cropOutputMimeType,
  croppedFileName,
  PROFILE_IMAGE_CROP_POLICY,
  type ImageCropPolicy,
} from "./image-crop-policy";

/**
 * Focused crop editor. Uploading is deliberately owned by the parent so
 * cancelling this component can never publish a file.
 */
@Component({
  selector: "app-crop-image",
  templateUrl: "./crop-image.component.html",
  styleUrls: ["./crop-image.component.scss"],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ImageCropperComponent,
    MatButton,
    MatIcon,
    MatSlider,
    MatSliderThumb,
  ],
})
export class CropImageComponent {
  readonly imageFile = input.required<File>();
  readonly policy = input<ImageCropPolicy>(PROFILE_IMAGE_CROP_POLICY);
  readonly imageCropped = output<File>();
  readonly cancelled = output<void>();

  private readonly cropper = viewChild.required(ImageCropperComponent);

  readonly outputFormat = computed(() => cropOutputFormat(this.imageFile()));
  readonly maintainAspectRatio = computed(
    () => this.policy().shape !== "free",
  );
  readonly roundCropper = computed(() => this.policy().shape === "circle");
  readonly aspectRatio = computed(() => this.policy().aspectRatio ?? 1);
  readonly canvasRotation = signal(0);
  readonly transform = signal<ImageTransform>({ scale: 1 });
  readonly zoom = computed(() => this.transform().scale ?? 1);
  readonly isReady = signal(false);
  readonly hasLoadError = signal(false);
  readonly isProcessing = signal(false);

  setZoom(value: number): void {
    this.transform.update((transform) => ({ ...transform, scale: value }));
  }

  updateTransform(transform: ImageTransform): void {
    this.transform.set(transform);
  }

  rotate(delta: number): void {
    this.canvasRotation.update((rotation) => rotation + delta);
  }

  reset(): void {
    this.canvasRotation.set(0);
    this.transform.set({ scale: 1 });
    this.cropper().resetCropperPosition();
  }

  async saveCroppedImage(): Promise<void> {
    if (!this.isReady() || this.isProcessing()) return;
    this.isProcessing.set(true);
    try {
      const result = await this.cropper().crop("blob");
      if (!result?.blob) {
        throw new Error("The cropped image could not be created.");
      }
      const format = this.outputFormat();
      this.imageCropped.emit(
        new File([result.blob], croppedFileName(this.imageFile(), format), {
          type: cropOutputMimeType(format),
          lastModified: Date.now(),
        }),
      );
    } catch (error) {
      console.error("Error creating cropped image:", error);
      this.hasLoadError.set(true);
    } finally {
      this.isProcessing.set(false);
    }
  }

  cancelCrop(): void {
    this.cancelled.emit();
  }
}
