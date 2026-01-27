import { GeoPoint, Timestamp } from "firebase/firestore";
import { LocaleMap } from "../models/Interfaces";
import { SpotReviewSchema } from "./SpotReviewSchema";
import { AmenitiesMap } from "./Amenities";
import { MediaSchema } from "../schemas/Media";
import { ChallengePreviewSchema } from "./SpotChallengeSchema";
import { SpotReportReason } from "./SpotReportSchema";

export type SpotId = string & { __brand: "SpotId" };
export type SpotSlug = string & { __brand: "SpotSlug" };

export interface SpotAddressSchema {
  sublocality?: string;
  locality?: string;
  country?: {
    code: string; // alpha 2
    name: string;
  };
  formatted?: string;
}

export interface SpotSchema {
  name: LocaleMap | Record<string, string>;

  location?: GeoPoint;
  location_raw?: { lat: number; lng: number };

  tile_coordinates?: {
    z2: { x: number; y: number };
    z4: { x: number; y: number };
    z6: { x: number; y: number };
    z8: { x: number; y: number };
    z10: { x: number; y: number };
    z12: { x: number; y: number };
    z14: { x: number; y: number };
    z16: { x: number; y: number };
  };

  isMiniSpot?: boolean;
  description?: LocaleMap | Record<string, string>;
  media?: MediaSchema[];

  top_challenges?: ChallengePreviewSchema[]; // 0-3 challenges
  num_challenges?: number; // integer

  is_iconic?: boolean;
  rating?: number; // from 0-5, where 0 means no rating. Default is 0, 1-5 set by cloud function.
  num_reviews?: number; // integer
  rating_histogram?: {
    1: number;
    2: number;
    3: number;
    4: number;
    5: number;
  };
  highlighted_reviews?: SpotReviewSchema[]; // max 3 reviews

  address: SpotAddressSchema | null;

  external_references?: {
    google_maps_place_id?: string;
    website_url?: string;
  };

  type?: string;
  access?: string;
  amenities?: AmenitiesMap;

  bounds?: GeoPoint[];

  time_created?: Timestamp;
  time_updated?: { seconds: number; nanoseconds: number };

  isReported?: boolean;
  reportReason?: SpotReportReason;

  // Preffered slug
  slug?: string;

  hide_streetview?: boolean;

  source?: string;

  // Typesense helper fields
  amenities_true?: string[];
  amenities_false?: string[];
  thumbnail_small_url?: string;
  thumbnail_medium_url?: string;
  name_search?: string[];
  description_search?: string[];
}
