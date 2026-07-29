import { TestBed } from "@angular/core/testing";
import { By } from "@angular/platform-browser";
import { ImageCropperComponent } from "ngx-image-cropper";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CropImageComponent } from "./crop-image.component";
import {
  OPTIONAL_MEDIA_CROP_POLICY,
  PROFILE_IMAGE_CROP_POLICY,
} from "./image-crop-policy";

describe("CropImageComponent", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    TestBed.configureTestingModule({
      imports: [CropImageComponent],
    });
  });

  function create(file: File, profile = true) {
    const fixture = TestBed.createComponent(CropImageComponent);
    fixture.componentRef.setInput("imageFile", file);
    fixture.componentRef.setInput(
      "policy",
      profile ? PROFILE_IMAGE_CROP_POLICY : OPTIONAL_MEDIA_CROP_POLICY,
    );
    fixture.detectChanges();
    return fixture;
  }

  it("configures a circular fixed crop for profile pictures", () => {
    const fixture = create(
      new File(["photo"], "profile.png", { type: "image/png" }),
    );
    const cropper = fixture.debugElement.query(
      By.directive(ImageCropperComponent),
    ).componentInstance as ImageCropperComponent;

    expect(cropper.maintainAspectRatio).toBe(true);
    expect(cropper.roundCropper).toBe(true);
    expect(cropper.aspectRatio).toBe(1);
    expect(cropper.resizeToWidth).toBe(800);
    expect(cropper.resizeToHeight).toBe(800);
    expect(cropper.onlyScaleDown).toBe(true);
  });

  it("supports free-form media crops and resettable adjustments", () => {
    const fixture = create(
      new File(["photo"], "spot.jpg", { type: "image/jpeg" }),
      false,
    );
    const component = fixture.componentInstance;
    const cropper = fixture.debugElement.query(
      By.directive(ImageCropperComponent),
    ).componentInstance as ImageCropperComponent;
    vi.spyOn(cropper, "resetCropperPosition");

    component.rotate(1);
    component.setZoom(2);
    expect(component.canvasRotation()).toBe(1);
    expect(component.zoom()).toBe(2);

    component.reset();
    expect(component.canvasRotation()).toBe(0);
    expect(component.zoom()).toBe(1);
    expect(cropper.resetCropperPosition).toHaveBeenCalled();
    expect(cropper.maintainAspectRatio).toBe(false);
  });

  it("emits a matching File only when Apply crops successfully", async () => {
    const fixture = create(
      new File(["photo"], "camera.jpeg", { type: "image/jpeg" }),
    );
    const component = fixture.componentInstance;
    const cropper = fixture.debugElement.query(
      By.directive(ImageCropperComponent),
    ).componentInstance as ImageCropperComponent;
    vi.spyOn(cropper, "crop").mockResolvedValue({
      blob: new Blob(["cropped"], { type: "image/jpeg" }),
      width: 800,
      height: 800,
      cropperPosition: { x1: 0, x2: 1, y1: 0, y2: 1 },
      imagePosition: { x1: 0, x2: 1, y1: 0, y2: 1 },
    });
    component.isReady.set(true);
    const emitted: File[] = [];
    component.imageCropped.subscribe((file) => emitted.push(file));

    await component.saveCroppedImage();

    expect(emitted).toHaveLength(1);
    expect(emitted[0]?.name).toBe("camera-cropped.jpg");
    expect(emitted[0]?.type).toBe("image/jpeg");
  });

  it("preserves WebP output and reports crop failures", async () => {
    const fixture = create(
      new File(["photo"], "camera.webp", { type: "image/webp" }),
    );
    const component = fixture.componentInstance;
    const cropper = fixture.debugElement.query(
      By.directive(ImageCropperComponent),
    ).componentInstance as ImageCropperComponent;
    const cropSpy = vi.spyOn(cropper, "crop").mockResolvedValueOnce({
      blob: new Blob(["cropped"], { type: "image/webp" }),
      width: 640,
      height: 640,
      cropperPosition: { x1: 0, x2: 1, y1: 0, y2: 1 },
      imagePosition: { x1: 0, x2: 1, y1: 0, y2: 1 },
    });
    const emitted: File[] = [];
    component.imageCropped.subscribe((file) => emitted.push(file));
    component.isReady.set(true);

    await component.saveCroppedImage();
    expect(emitted[0]).toMatchObject({
      name: "camera-cropped.webp",
      type: "image/webp",
    });

    cropSpy.mockRejectedValueOnce(new Error("canvas failed"));
    await component.saveCroppedImage();
    expect(component.hasLoadError()).toBe(true);
  });

  it("emits cancellation without attempting a crop", () => {
    const fixture = create(
      new File(["photo"], "profile.png", { type: "image/png" }),
    );
    const component = fixture.componentInstance;
    const cancelled = vi.fn();
    component.cancelled.subscribe(cancelled);

    component.cancelCrop();

    expect(cancelled).toHaveBeenCalledOnce();
  });
});
