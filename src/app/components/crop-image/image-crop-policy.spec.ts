import { describe, expect, it } from "vitest";
import {
  OPTIONAL_MEDIA_CROP_POLICY,
  PROFILE_IMAGE_CROP_POLICY,
  SQUARE_ICON_CROP_POLICY,
  canCropImage,
  cropOutputFormat,
  croppedFileName,
} from "./image-crop-policy";

describe("image crop policies", () => {
  it("keeps identity crops constrained and general media free-form", () => {
    expect(PROFILE_IMAGE_CROP_POLICY).toMatchObject({
      requirement: "required",
      shape: "circle",
      aspectRatio: 1,
      maxOutputWidth: 800,
      maxOutputHeight: 800,
    });
    expect(SQUARE_ICON_CROP_POLICY).toMatchObject({
      requirement: "required",
      shape: "square",
      aspectRatio: 1,
    });
    expect(OPTIONAL_MEDIA_CROP_POLICY).toMatchObject({
      requirement: "optional",
      shape: "free",
      maxOutputWidth: 1600,
      maxOutputHeight: 1600,
    });
  });

  it("crops static browser images but leaves animated and vector media alone", () => {
    expect(
      canCropImage(new File([""], "photo.jpg", { type: "image/jpeg" })),
    ).toBe(true);
    expect(
      canCropImage(new File([""], "photo.webp", { type: "image/webp" })),
    ).toBe(true);
    expect(
      canCropImage(new File([""], "animated.gif", { type: "image/gif" })),
    ).toBe(false);
    expect(
      canCropImage(new File([""], "logo.svg", { type: "image/svg+xml" })),
    ).toBe(false);
  });

  it("preserves supported output formats and creates matching file names", () => {
    const jpeg = new File([""], "camera.jpeg", { type: "image/jpeg" });
    const webp = new File([""], "camera.webp", { type: "image/webp" });

    expect(cropOutputFormat(jpeg)).toBe("jpeg");
    expect(croppedFileName(jpeg, cropOutputFormat(jpeg))).toBe(
      "camera-cropped.jpg",
    );
    expect(cropOutputFormat(webp)).toBe("webp");
    expect(croppedFileName(webp, cropOutputFormat(webp))).toBe(
      "camera-cropped.webp",
    );
  });
});
