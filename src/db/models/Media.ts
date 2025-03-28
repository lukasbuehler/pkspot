import { StorageBucket } from "../../app/services/firebase/storage.service";
import { MediaSchema } from "../schemas/Media";
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
  constructor(src: string, origin?: MediaSchema["origin"]) {
    super(src, MediaType.Image, origin);
  }

  get src(): string {
    return this._src;
  }
}

export class ExternalVideo extends Media {
  constructor(src: string, origin?: MediaSchema["origin"]) {
    super(src, MediaType.Video, origin);
  }

  get src(): string {
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
    this.bucket = src.split("/")[0] as StorageBucket;
    this.filename = src.split("/")[1];
  }

  readonly bucket: StorageBucket;
  readonly filename: string;

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

  constructor(src: string, userId?: string, origin?: "user" | "other") {
    super(
      src.replace(/comp_/, "").replace(/thumb_/, ""),
      MediaType.Video,
      userId,
      origin
    );
  }

  getVideoSrc(): string {
    return this.compressedPrefix + this._src;
  }
  getThumbnailSrc(): string {
    return this.thumbnailPrefix + this._src;
  }

  override getAllFileSrcs(): string[] {
    return [this.getVideoSrc(), this.getThumbnailSrc()];
  }
}

/**
 * An image that is stored in Firebase Storage.
 * On upload the original is deleted and replaced by three resized images.
 * To retrieve the correct sources for this, use this class/instance.
 */
export class StorageImage extends StorageMedia {
  readonly sizes = [200, 400, 800];

  constructor(src: string, userId?: string, origin?: "user" | "other") {
    super(src.replace(/_\d+x\d+\?/, "?"), MediaType.Image, userId, origin);
  }

  getSrc(size: number): string {
    if (!this.sizes.includes(size)) {
      throw new Error(
        `Size ${size} not supported. Supported sizes are: ${this.sizes}`
      );
    }
    return this._src.replace(/\?/, `_${size}x${size}?`);
  }

  override getAllFileSrcs(): string[] {
    return this.sizes.map((size) => this.getSrc(size));
  }

  delete(): Promise<void> {
    throw new Error("Method not implemented.");
  }
}

export type AnyMedia =
  | StorageImage
  | StorageVideo
  | ExternalImage
  | ExternalVideo;
