import type { GeoPoint, Timestamp } from "firebase/firestore";
import { LocaleMap } from "../models/Interfaces";
import { SpotReviewSchema } from "./SpotReviewSchema";
import { AmenitiesMap } from "./Amenities";
import { MediaSchema } from "../schemas/Media";
import { ChallengePreviewSchema } from "./SpotChallengeSchema";
import { SpotReportReason } from "./SpotReportSchema";
import { SpotLandingSchema } from "./SpotLandingSchema";
import { OrganizationReferenceSchema } from "./OrganizationSchema";
import type { EventCardPreviewSchema } from "./EventSchema";

export type SpotId = string & { __brand: "SpotId" };
export type SpotSlug = string & { __brand: "SpotSlug" };

export interface SpotStewardshipSchema {
  status: "active";
  organization_id: string;
  organization: OrganizationReferenceSchema;
  stewarded_by_user_id: string;
  stewarded_at: Timestamp;
}

export interface SpotStewardshipStateSchema {
  organization_ids: string[];
  organizations: Record<string, SpotStewardshipSchema>;
}

export interface SpotManagementSchema {
  status: "managed";
  organization_id: string;
  organization: OrganizationReferenceSchema;
  managed_by_user_id: string;
  managed_at: Timestamp;
  lock_edits: true;
}

/** @deprecated Use stewardship for public verification or management for exclusive control. */
export interface SpotVerificationSchema {
  status: "verified";
  organization_id: string;
  organization: OrganizationReferenceSchema;
  verified_by_user_id: string;
  verified_at: Timestamp;
  lock_edits: true;
}

export interface SpotAddressSchema {
  sublocality?: string;
  sublocalityLocal?: string;
  locality?: string;
  localityLocal?: string;
  region?: {
    code?: string;
    name: string;
    localName?: string;
  };
  country?: {
    code: string; // alpha 2
    name: string;
    localName?: string;
  };
  formatted?: string;
  formattedLocal?: string;
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
  /** Server-owned preview of the next public live/upcoming events at this spot. */
  upcoming_events?: EventCardPreviewSchema[];

  is_iconic?: boolean;
  stewardship?: SpotStewardshipStateSchema;
  management?: SpotManagementSchema;
  /** @deprecated Use stewardship or management. Kept for old clients during migration. */
  verification?: SpotVerificationSchema;
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
  bounds_raw?: { lat: number; lng: number }[]; // Raw coords for mobile (Capacitor can't handle GeoPoints)

  time_created?: Timestamp;
  time_updated?: { seconds: number; nanoseconds: number };

  isReported?: boolean;
  reportReason?: SpotReportReason;
  duplicate_check?: {
    status: "clear" | "possible_duplicate";
    radius_m: number;
    checked_at?: Timestamp | { seconds: number; nanoseconds: number };
    candidates?: {
      spot_id: string;
      distance_m: number;
      name?: string;
    }[];
  };

  // Preffered slug
  slug?: string;

  landing?: SpotLandingSchema | null;

  hide_streetview?: boolean;

  source?: string;

  // Typesense helper fields
  amenities_true?: string[];
  amenities_false?: string[];
  thumbnail_small_url?: string;
  thumbnail_medium_url?: string;
  name_search?: string[];
  description_search?: string[];
  // Bounds helper fields for geo-radius proximity queries
  bounds_center?: [number, number]; // [lat, lng] centroid of bounds polygon
  bounds_radius_m?: number; // max distance from center to any vertex + buffer
}
