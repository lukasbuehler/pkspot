import { Timestamp } from "firebase/firestore";
import { MediaType } from "../models/Interfaces";
import { UserReferenceSchema } from "./UserSchema";

export interface MediaSchema {
  type: MediaType;
  src: string;
  attribution?: {
    title?: string;
    author?: string;
    source_url?: string;
    license?: string;
  };
  uid?: string; // old
  user?: UserReferenceSchema;
  isInStorage: boolean;
  origin?: "user" | "streetview" | "other";
  timestamp?: Timestamp;
  isReported?: boolean;
}

export enum StorageBucket {
  PostMedia = "post_media",
  ProfilePictures = "profile_pictures",
  SpotPictures = "spot_pictures",
  Challenges = "challenges",
  Imports = "imports",
}

/**
 * Parsed components of a Firebase Storage media URL.
 * Used internally to build resized image/video URLs.
 */
export interface ParsedStorageMediaUrl {
  uriBeforeBucket: string;
  bucket: StorageBucket;
  filename: string;
  extension: string;
  options: string;
}

/**
 * The regex pattern for parsing Firebase Storage media URLs.
 * Extracts: [full prefix], [bucket], [filename], [extension], [options]
 */
const STORAGE_MEDIA_URL_REGEX = new RegExp(
  /(https?:\/\/[\w.-]+\/v0\/b\/[\w-.]+\/o\/)?([\w\_]+)(?:%2F|\/)([\w_-]+)\.?(\w+)?\?([\w-=&]+)/
);

/**
 * Parses a Firebase Storage media URL and extracts its components.
 * This is the source of truth for the Firebase Storage URL format.
 *
 * @param src - The full Firebase Storage URL
 * @returns Parsed URL components
 * @throws Error if the URL format is invalid
 */
export function parseStorageMediaUrl(src: string): ParsedStorageMediaUrl {
  const match = STORAGE_MEDIA_URL_REGEX.exec(src);
  if (match === null) {
    throw new Error("Invalid src format for StorageMedia: " + src);
  }

  return {
    uriBeforeBucket: match[1] ?? "",
    bucket: (match[2] as StorageBucket) ?? "",
    filename: match[3] ?? "",
    extension: match[4] ?? "",
    options: match[5] ?? "",
  };
}

/**
 * Builds a Firebase Storage media URL with optional filename prefix or custom size suffix.
 * Used to construct URLs for resized images or compressed videos.
 *
 * @param parsed - Parsed URL components from parseStorageMediaUrl()
 * @param filenamePrefix - Optional prefix to add before the filename (e.g., "comp_", "thumb_")
 * @param sizeSuffix - Optional suffix to add before the extension (e.g., "_400x400")
 * @returns The constructed Firebase Storage URL
 */
export function buildStorageMediaUrl(
  parsed: ParsedStorageMediaUrl,
  filenamePrefix?: string,
  sizeSuffix?: string
): string {
  const filename = `${filenamePrefix ?? ""}${parsed.filename}${
    sizeSuffix ?? ""
  }`;
  const extension = parsed.extension ? "." + parsed.extension : "";
  return `${parsed.uriBeforeBucket}${parsed.bucket}%2F${filename}${extension}?${parsed.options}`;
}

/**
 * Gets the preview image URL for a media schema.
 * For storage videos, returns the thumbnail URL.
 * For storage images, returns the 400x400 resized image URL.
 * For external media, returns the src as-is.
 * This function works without instantiating Media classes, making it safe for cloud functions.
 *
 * @param mediaSchema - The media schema to get the preview image from
 * @returns The preview image URL
 */
export function getMediaPreviewImageUrl(mediaSchema: MediaSchema): string {
  if (!mediaSchema) {
    return "";
  }

  // External media: return src as-is
  if (!mediaSchema.isInStorage) {
    return mediaSchema.src;
  }

  // Storage media: parse and build the appropriate URL
  try {
    const parsed = parseStorageMediaUrl(mediaSchema.src);

    if (mediaSchema.type === MediaType.Image) {
      // For images, return the 400x400 resized version
      return buildStorageMediaUrl(parsed, undefined, "_400x400");
    } else if (mediaSchema.type === MediaType.Video) {
      // For videos, return the thumbnail (400x400 PNG)
      return buildStorageMediaUrl(parsed, "thumb_", "_400x400");
    }
  } catch (error) {
    console.error("Error generating preview URL for media:", error);
  }

  return "";
}
