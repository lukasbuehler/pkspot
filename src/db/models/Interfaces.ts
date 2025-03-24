import { languageCodes } from "../../scripts/Languages";

export type LocaleCode = string;

export type LocaleMap = {
  [langCode in LocaleCode]?: {
    text: string;
    provider: string;
    timestamp?: Date;
  };
};

export type SpotSlug = {
  spotId: string;
};

export enum MediaType {
  Video = "video",
  Image = "image",
  YouTube = "youtube",
  //Instagram = "instagram",
  Vimeo = "vimeo",
}

/**
 * SizedStorageSrc is a string that represents a URL to a file in Firebase Storage.
 * It has a brand to distinguish it from other strings.
 *
 * To convert it to a string, call StorageService.getSrc(sizedStorageSrc).
 */
export type SizedStorageSrc = string & { __brand: "SizedStorageSrc" };

export interface OtherMedia {
  type: MediaType;
  src: string;
  origin?: "user" | "streetview" | "other";
}

export interface SizedUserMedia extends OtherMedia {
  uid: string;
  src: SizedStorageSrc;
  isSized?: boolean;
}

export type Media = OtherMedia | SizedUserMedia;

export function mediaIsUserMedia(media: Media): media is SizedUserMedia {
  return (media as SizedUserMedia).uid !== undefined;
}

// export interface StreetViewMedia {

// }
