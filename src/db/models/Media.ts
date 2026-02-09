import { signal, WritableSignal } from "@angular/core";
import {
  MediaSchema,
  StorageBucket,
  parseStorageMediaUrl,
  buildStorageMediaUrl,
  type ParsedStorageMediaUrl,
} from "../schemas/Media";
import { MediaType } from "./Interfaces";

/**
 * A media object that keeps track of a source string and the type.
 * This is used so that the UI knows if it's deailing with a video or image
 * or something else.
 */
export abstract class Media {
  constructor(
    src: string,
    type: MediaType,
    userId?: string,
    attribution?: MediaSchema["attribution"],
    origin?: MediaSchema["origin"],
    isReported: boolean = false
  ) {
    this._src = src;
    this.type = type;
    this.userId = userId;
    this.attribution = attribution;
    this.origin = origin;
    this.isReported = isReported;
  }

  protected readonly _src: string;
  readonly userId?: string;
  readonly attribution?: MediaSchema["attribution"];
  readonly origin?: MediaSchema["origin"];
  readonly type: MediaType;
  readonly isReported: boolean;

  abstract getPreviewImageSrc(): string;

  get baseSrc(): string {
    return this._src;
  }

  getData(): MediaSchema {
    const data = {
      src: this._src,
      type: this.type,
      uid: this.userId,
      attribution: this.attribution,
      origin: this.origin,
      isInStorage: false,
      isReported: this.isReported,
    };

    (Object.keys(data) as (keyof typeof data)[]).forEach((key) => {
      if (data[key] === undefined) {
        delete data[key];
      }
    });

    return data;
  }
}

export class ExternalImage extends Media {
  constructor(
    src: string,
    userId?: string,
    origin?: MediaSchema["origin"],
    isReported?: boolean
  );
  constructor(
    src: string,
    userId?: string,
    attribution?: MediaSchema["attribution"],
    origin?: MediaSchema["origin"],
    isReported?: boolean
  );
  constructor(
    src: string,
    userId?: string,
    attributionOrOrigin?: MediaSchema["attribution"] | MediaSchema["origin"],
    originOrIsReported?: MediaSchema["origin"] | boolean,
    isReportedMaybe: boolean = false
  ) {
    let attribution: MediaSchema["attribution"] | undefined;
    let origin: MediaSchema["origin"] | undefined;
    let isReported = isReportedMaybe;

    if (typeof attributionOrOrigin === "string") {
      origin = attributionOrOrigin;
      isReported =
        typeof originOrIsReported === "boolean" ? originOrIsReported : false;
    } else {
      attribution = attributionOrOrigin;
      if (typeof originOrIsReported === "string") {
        origin = originOrIsReported;
      } else if (typeof originOrIsReported === "boolean") {
        isReported = originOrIsReported;
      }
    }

    super(src, MediaType.Image, userId, attribution, origin, isReported);
  }

  get src(): string {
    return this._src;
  }

  getPreviewImageSrc(): string {
    return this._src;
  }

  getSrc(size?: number): string {
    return this._src;
  }
}

export class ExternalVideo extends Media {
  constructor(
    src: string,
    userId?: string,
    origin?: MediaSchema["origin"],
    isReported?: boolean
  );
  constructor(
    src: string,
    userId?: string,
    attribution?: MediaSchema["attribution"],
    origin?: MediaSchema["origin"],
    isReported?: boolean
  );
  constructor(
    src: string,
    userId?: string,
    attributionOrOrigin?: MediaSchema["attribution"] | MediaSchema["origin"],
    originOrIsReported?: MediaSchema["origin"] | boolean,
    isReportedMaybe: boolean = false
  ) {
    let attribution: MediaSchema["attribution"] | undefined;
    let origin: MediaSchema["origin"] | undefined;
    let isReported = isReportedMaybe;

    if (typeof attributionOrOrigin === "string") {
      origin = attributionOrOrigin;
      isReported =
        typeof originOrIsReported === "boolean" ? originOrIsReported : false;
    } else {
      attribution = attributionOrOrigin;
      if (typeof originOrIsReported === "string") {
        origin = originOrIsReported;
      } else if (typeof originOrIsReported === "boolean") {
        isReported = originOrIsReported;
      }
    }

    super(src, MediaType.Video, userId, attribution, origin, isReported);
  }

  get src(): string {
    return this._src;
  }

  getVideoSrc(): string {
    return this._src;
  }

  getPreviewImageSrc(): string {
    return this._src;
  }
}

/**
 * A file that is stored in Firebase Storage.
 */
export abstract class StorageMedia extends Media {
  readonly uriBeforeBucket: string;
  readonly bucket: StorageBucket;
  readonly filename: string;
  readonly extension: string;
  readonly options: string;
  protected readonly parsed: ParsedStorageMediaUrl;

  constructor(
    src: string,
    type: MediaType,
    userId?: string,
    attribution?: MediaSchema["attribution"],
    origin?: "user" | "other",
    isReported: boolean = false
  ) {
    super(src, type, userId, attribution, origin, isReported);
    this.parsed = parseStorageMediaUrl(src);

    this.uriBeforeBucket = this.parsed.uriBeforeBucket;
    this.bucket = this.parsed.bucket;
    this.filename = this.parsed.filename;
    this.extension = this.parsed.extension;
    this.options = this.parsed.options;
  }

  protected _makeSrc(
    filename: string = this.filename,
    extension: string = this.extension
  ): string {
    return buildStorageMediaUrl(
      this.parsed,
      undefined,
      filename === this.filename && extension === this.extension
        ? undefined
        : `_${filename.replace(this.filename, "")}`
    );
  }

  /**
   * Internal method to build a src with a custom filename prefix and/or size suffix.
   * This is used to create URLs for resized images or compressed videos.
   */
  protected _makeSrcWithPrefixAndSuffix(
    filenamePrefix?: string,
    sizeSuffix?: string
  ): string {
    return buildStorageMediaUrl(this.parsed, filenamePrefix, sizeSuffix);
  }

  override getData(): MediaSchema {
    const data = {
      src: this._src,
      type: this.type,
      uid: this.userId,
      attribution: this.attribution,
      origin: this.origin,
      isInStorage: true,
      isReported: this.isReported,
    };

    (Object.keys(data) as (keyof typeof data)[]).forEach((key) => {
      if (data[key] === undefined) {
        delete data[key];
      }
    });

    return data;
  }

  /**
   * Returns the base source of the media stored in Firebase Storage.
   * This source is not usable by itself, but is used to create the src for the
   * resized image or compressed video and the thumbnail. It is also what's stored in the database.
   */
  override get baseSrc(): string {
    return this._src;
  }

  abstract getAllFileSrcs(): string[];
}

/**
 * A video that is stored in Firebase Storage.
 * On upload the original is deleted and replaced by a compressed version
 * and a thumbnail is created.
 */
export class StorageVideo extends StorageMedia {
  readonly thumbnailPrefix = "thumb_";
  readonly compressedPrefix = "comp_";
  readonly thumbnail: StorageImage;

  constructor(
    src: string,
    userId?: string,
    origin?: "user" | "other",
    isReported?: boolean
  );
  constructor(
    src: string,
    userId?: string,
    attribution?: MediaSchema["attribution"],
    origin?: "user" | "other",
    isReported?: boolean
  );
  constructor(
    src: string,
    userId?: string,
    attributionOrOrigin?: MediaSchema["attribution"] | "user" | "other",
    originOrIsReported?: "user" | "other" | boolean,
    isReportedMaybe: boolean = false
  ) {
    let attribution: MediaSchema["attribution"] | undefined;
    let origin: "user" | "other" | undefined;
    let isReported = isReportedMaybe;

    if (
      attributionOrOrigin === "user" ||
      attributionOrOrigin === "other"
    ) {
      origin = attributionOrOrigin;
      isReported =
        typeof originOrIsReported === "boolean" ? originOrIsReported : false;
    } else {
      attribution = attributionOrOrigin;
      if (originOrIsReported === "user" || originOrIsReported === "other") {
        origin = originOrIsReported;
      } else if (typeof originOrIsReported === "boolean") {
        isReported = originOrIsReported;
      }
    }

    super(
      src.replace(/comp_/, "").replace(/thumb_/, ""),
      MediaType.Video,
      userId,
      attribution,
      origin,
      isReported
    );
    // Build thumbnail URL with correct prefix format: thumb_{filename}.png
    // This creates a base URL that StorageImage can then add size suffixes to
    const thumbnailSrc = `${this.uriBeforeBucket}${this.bucket}%2F${this.thumbnailPrefix}${this.filename}.png?${this.options}`;
    this.thumbnail = new StorageImage(
      thumbnailSrc,
      this.userId,
      this.attribution,
      this.origin as "user" | "other"
    );
  }

  /**
   * Creates a StorageVideo instance from a MediaSchema.
   * Useful when working with data from the database that needs to be hydrated into the Media class.
   */
  static fromSchema(schema: MediaSchema): StorageVideo {
    if (schema.type !== MediaType.Video || !schema.isInStorage) {
      throw new Error(
        "Schema must be a video type and stored in Firebase Storage"
      );
    }
    return new StorageVideo(
      schema.src,
      schema.uid,
      schema.attribution,
      schema.origin as "user" | "other",
      schema.isReported ?? false
    );
  }

  getVideoSrc(): string {
    return this._makeSrcWithPrefixAndSuffix(this.compressedPrefix);
  }

  override getPreviewImageSrc(): string {
    return this.thumbnail.getSrc(400);
  }

  override getAllFileSrcs(): string[] {
    return [this.getVideoSrc(), ...this.thumbnail.getAllFileSrcs()];
  }
}

/**
 * An image that is stored in Firebase Storage.
 * On upload the original is deleted and replaced by three resized images.
 * To retrieve the correct sources for this, use this class/instance.
 */
export class StorageImage extends StorageMedia {
  static readonly SIZES = [200, 400, 800];

  get sizes() {
    return StorageImage.SIZES;
  }

  /**
   * Tracks whether the resized versions of this image are still being processed.
   * When true, the image should show a loading placeholder.
   */
  readonly isProcessing: WritableSignal<boolean> = signal(false);

  constructor(
    src: string,
    userId?: string,
    origin?: "user" | "other",
    isProcessing?: boolean,
    isReported?: boolean
  );
  constructor(
    src: string,
    userId?: string,
    attribution?: MediaSchema["attribution"],
    origin?: "user" | "other",
    isProcessing?: boolean,
    isReported?: boolean
  );
  constructor(
    src: string,
    userId?: string,
    attributionOrOrigin?: MediaSchema["attribution"] | "user" | "other",
    originOrIsProcessing?: "user" | "other" | boolean,
    isProcessingOrReported: boolean = false,
    isReportedMaybe: boolean = false
  ) {
    let attribution: MediaSchema["attribution"] | undefined;
    let origin: "user" | "other" | undefined;
    let isProcessing = false;
    let isReported = false;

    if (
      attributionOrOrigin === "user" ||
      attributionOrOrigin === "other"
    ) {
      origin = attributionOrOrigin;
      isProcessing =
        typeof originOrIsProcessing === "boolean" ? originOrIsProcessing : false;
      isReported = isProcessingOrReported;
    } else {
      attribution = attributionOrOrigin;
      if (
        originOrIsProcessing === "user" ||
        originOrIsProcessing === "other"
      ) {
        origin = originOrIsProcessing;
        isProcessing = isProcessingOrReported;
        isReported = isReportedMaybe;
      } else {
        isProcessing =
          typeof originOrIsProcessing === "boolean"
            ? originOrIsProcessing
            : false;
        isReported = isProcessingOrReported;
      }
    }

    super(src, MediaType.Image, userId, attribution, origin, isReported);
    this.isProcessing.set(isProcessing);
  }

  /**
   * Creates a StorageImage instance from a MediaSchema.
   * Useful when working with data from the database that needs to be hydrated into the Media class.
   */
  static fromSchema(schema: MediaSchema): StorageImage {
    if (schema.type !== MediaType.Image || !schema.isInStorage) {
      throw new Error(
        "Schema must be an image type and stored in Firebase Storage"
      );
    }
    return new StorageImage(
      schema.src,
      schema.uid,
      schema.attribution,
      schema.origin as "user" | "other",
      false, // isProcessing
      schema.isReported ?? false
    );
  }

  getSrc(size: number): string {
    if (!this.sizes.includes(size)) {
      throw new Error(
        `Size ${size} not supported. Supported sizes are: ${this.sizes}`
      );
    }
    return this._makeSrcWithPrefixAndSuffix(undefined, `_${size}x${size}`);
  }

  /**
   * Returns the original unprocessed source URL.
   * This can be used as a fallback while resized versions are being processed.
   */
  getOriginalSrc(): string {
    return this._makeSrc(this.filename, this.extension);
  }

  /**
   * Checks if the resized image at the specified size is available.
   * Uses a HEAD request to avoid downloading the full image.
   * Updates the isProcessing signal accordingly.
   */
  async checkAvailability(size: number = 400): Promise<boolean> {
    const src = this.getSrc(size);
    try {
      const response = await fetch(src, { method: "HEAD" });
      const isAvailable = response.ok;
      this.isProcessing.set(!isAvailable);
      return isAvailable;
    } catch {
      this.isProcessing.set(true);
      return false;
    }
  }

  override getPreviewImageSrc(): string {
    return this.getSrc(400);
  }

  override getAllFileSrcs(): string[] {
    return this.sizes.map((size) => this.getSrc(size));
  }
}

export type AnyMedia =
  | StorageImage
  | StorageVideo
  | ExternalImage
  | ExternalVideo;

export type VideoMedia = StorageVideo | ExternalVideo;

export type ImageMedia = StorageImage | ExternalImage;
