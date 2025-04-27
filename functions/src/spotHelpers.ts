// import { GeoPoint } from "@firebase/firestore";
import { LocaleCode } from "../../src/db/models/Interfaces";
import { AnyMedia } from "../../src/db/models/Media";
import { SpotSchema as DbSpotSchema } from "../../src/db/schemas/SpotSchema";
import { makeAnyMediaFromMediaSchema } from "../../src/scripts/Helpers";

export type SpotSchema = DbSpotSchema;
export type PartialSpotSchema = Partial<SpotSchema>;
// {
//   name: { [langCode: string]: string };
//   address?: {
//     country: {
//       code: string;
//       name: string;
//     };
//     formatted: string;
//     locality: string;
//     sublocality?: string;
//   };
//   media: {
//     src: string;
//     type: string;
//     uid?: string;
//   }[];
//   location: GeoPoint;
//   tile_coordinates: {
//     z2: { x: number; y: number };
//     z4: { x: number; y: number };
//     z6: { x: number; y: number };
//     z8: { x: number; y: number };
//     z10: { x: number; y: number };
//     z12: { x: number; y: number };
//     z14: { x: number; y: number };
//     z16: { x: number; y: number };
//   };
//   is_iconic?: boolean;
//   rating?: number;
// }

export const defaultSpotNames: Partial<Record<LocaleCode, string>> = {
  en: "Unnamed Spot",
  "en-US": "Unnamed Spot",
  "en-GB": "Unnamed Spot",
  de: "Unbenannter Spot",
  "de-CH": "Unbenännte Spot",
};

export function getSpotName(
  spotSchema: PartialSpotSchema,
  locale: LocaleCode
): string {
  if (spotSchema.name) {
    const nameLocales: LocaleCode[] = Object.keys(
      spotSchema.name
    ) as LocaleCode[];
    if (nameLocales.length > 0) {
      if (nameLocales.includes(locale)) {
        const map = spotSchema.name[locale as LocaleCode]!;
        if (typeof map === "string") {
          return map;
        } else if ("text" in map) {
          return map.text;
        } else {
          return defaultSpotNames[locale] ?? defaultSpotNames["en"]!;
        }
      } else if (nameLocales.includes(locale.split("-")[0] as LocaleCode)) {
        const map = spotSchema.name[locale.split("-")[0] as LocaleCode]!;
        if (typeof map === "string") {
          return map;
        } else if ("text" in map) {
          return map.text;
        } else {
          return defaultSpotNames[locale] ?? defaultSpotNames["en"]!;
        }
      } else if (nameLocales.includes("en")) {
        const map = spotSchema.name["en"]!;
        if (typeof map === "string") {
          return map;
        } else if ("text" in map) {
          return map.text;
        } else {
          return defaultSpotNames[locale] ?? defaultSpotNames["en"]!;
        }
      } else {
        const map = spotSchema.name[nameLocales[0]]!;
        if (typeof map === "string") {
          return map;
        } else if ("text" in map) {
          return map.text;
        } else {
          return defaultSpotNames[locale] ?? defaultSpotNames["en"]!;
        }
      }
    }
  }
  return defaultSpotNames[locale] ?? defaultSpotNames["en"]!;
}

export function getSpotPreviewImage(spotSchema: PartialSpotSchema): string {
  const media: AnyMedia[] | undefined = spotSchema.media?.map((mediaSchema) =>
    makeAnyMediaFromMediaSchema(mediaSchema)
  );

  if (media && media.length > 0) {
    return media[0].getPreviewImageSrc();
  }

  return "";
}

export function getSpotLocalityString(spotSchema: PartialSpotSchema): string {
  let str = "";
  const { address } = spotSchema;

  if (address) {
    if (address.sublocality) {
      str += `${address.sublocality}, `;
    }
    if (address.locality) {
      str += `${address.locality}, `;
    }
    if (address.country) {
      str += address.country.code.toUpperCase();
    }
  }
  return str;
}
