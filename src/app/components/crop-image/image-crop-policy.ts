import type { OutputFormat } from "ngx-image-cropper";

export type ImageCropRequirement = "disabled" | "optional" | "required";
export type ImageCropShape = "free" | "square" | "circle";

export interface ImageCropPolicy {
  requirement: ImageCropRequirement;
  shape: ImageCropShape;
  aspectRatio?: number;
  maxOutputWidth: number;
  maxOutputHeight: number;
}

export const PROFILE_IMAGE_CROP_POLICY: ImageCropPolicy = {
  requirement: "required",
  shape: "circle",
  aspectRatio: 1,
  maxOutputWidth: 800,
  maxOutputHeight: 800,
};

export const SQUARE_ICON_CROP_POLICY: ImageCropPolicy = {
  requirement: "required",
  shape: "square",
  aspectRatio: 1,
  maxOutputWidth: 800,
  maxOutputHeight: 800,
};

export const OPTIONAL_MEDIA_CROP_POLICY: ImageCropPolicy = {
  requirement: "optional",
  shape: "free",
  maxOutputWidth: 1600,
  maxOutputHeight: 1600,
};

export const DISABLED_IMAGE_CROP_POLICY: ImageCropPolicy = {
  requirement: "disabled",
  shape: "free",
  maxOutputWidth: 1600,
  maxOutputHeight: 1600,
};

const CROPPABLE_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
]);

export function canCropImage(file: File): boolean {
  return CROPPABLE_IMAGE_TYPES.has(file.type.toLowerCase());
}

export function cropOutputFormat(file: File): OutputFormat {
  switch (file.type.toLowerCase()) {
    case "image/jpeg":
    case "image/jpg":
      return "jpeg";
    case "image/webp":
      return "webp";
    default:
      return "png";
  }
}

export function cropOutputMimeType(format: OutputFormat): string {
  return format === "jpeg" ? "image/jpeg" : `image/${format}`;
}

export function cropOutputExtension(format: OutputFormat): string {
  return format === "jpeg" ? "jpg" : format;
}

export function croppedFileName(file: File, format: OutputFormat): string {
  const baseName = file.name.replace(/\.[^.]+$/, "") || "image";
  return `${baseName}-cropped.${cropOutputExtension(format)}`;
}
