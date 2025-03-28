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
