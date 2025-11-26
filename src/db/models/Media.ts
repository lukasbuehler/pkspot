import { signal, WritableSignal } from "@angular/core";
import { MediaSchema, StorageBucket } from "../schemas/Media";
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
    origin?: MediaSchema["origin"]
  ) {
    this._src = src;
    this.type = type;
    this.userId = userId;
    this.origin = origin;
  }

  protected readonly _src: string;
  readonly userId?: string;
  readonly origin?: MediaSchema["origin"];
  readonly type: MediaType;

  abstract getPreviewImageSrc(): string;

  getData(): MediaSchema {
    const data = {
      src: this._src,
      type: this.type,
      uid: this.userId,
      origin: this.origin,
      isInStorage: false,
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
  constructor(src: string, userId?: string, origin?: MediaSchema["origin"]) {
    super(src, MediaType.Image, userId, origin);
  }

  get src(): string {
    return this._src;
  }

  getPreviewImageSrc(): string {
    return this._src;
  }
}

export class ExternalVideo extends Media {
  constructor(src: string, userId?: string, origin?: MediaSchema["origin"]) {
    super(src, MediaType.Video, userId, origin);
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
  constructor(
    src: string,
    type: MediaType,
    userId?: string,
    origin?: "user" | "other"
  ) {
    super(src, type, userId, origin);
    const regexp = new RegExp(
      /(https?:\/\/[\w.-]+\/v0\/b\/[\w-.]+\/o\/)([\w\_]+)(?:\%2F|\/)([\w_-]+).?(\w+)?\?([\w-=&]+)/
    );
    const match = regexp.exec(src);
    if (match === null) {
      throw new Error("Invalid src format for StorageMedia: " + src);
    }

    // Regex match groups:
    this.uriBeforeBucket = match[1] ?? "";
    this.bucket = (match[2] as StorageBucket) ?? "";
    this.filename = match[3] ?? "";
    this.extension = match[4] ?? "";
    this.options = match[5] ?? "";
  }

  readonly uriBeforeBucket: string;
  readonly bucket: StorageBucket;
  readonly filename: string;
  readonly extension: string;
  readonly options: string;

  protected _makeSrc(
    filename: string = this.filename,
    extension: string = this.extension
  ): string {
    return `${this.uriBeforeBucket}${this.bucket}%2F${filename}${
      extension ? "." + extension : ""
    }?${this.options}
`;
  }

  override getData(): MediaSchema {
    const data = {
      src: this._src,
      type: this.type,
      uid: this.userId,
      origin: this.origin,
      isInStorage: true,
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
  get baseSrc(): string {
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

  constructor(src: string, userId?: string, origin?: "user" | "other") {
    super(
      src.replace(/comp_/, "").replace(/thumb_/, ""),
      MediaType.Video,
      userId,
      origin
    );
    this.thumbnail = new StorageImage(
      this._makeSrc(this.thumbnailPrefix + this.filename, "png"),
      this.userId,
      this.origin as "user" | "other"
    );
  }

  getVideoSrc(): string {
    return this._makeSrc(this.compressedPrefix + this.filename);
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
  readonly sizes = [200, 400, 800];

  /**
   * Tracks whether the resized versions of this image are still being processed.
   * When true, the image should show a loading placeholder.
   */
  readonly isProcessing: WritableSignal<boolean> = signal(false);

  constructor(
    src: string,
    userId?: string,
    origin?: "user" | "other",
    isProcessing: boolean = false
  ) {
    super(src, MediaType.Image, userId, origin);
    this.isProcessing.set(isProcessing);
  }

  getSrc(size: number): string {
    if (!this.sizes.includes(size)) {
      throw new Error(
        `Size ${size} not supported. Supported sizes are: ${this.sizes}`
      );
    }
    return this._makeSrc(this.filename + `_${size}x${size}`, this.extension);
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
