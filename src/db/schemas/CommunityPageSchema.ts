import { Timestamp } from "firebase/firestore";
import { SpotPreviewData } from "./SpotPreviewData";

export type CommunityScope = "country" | "region" | "locality";

export interface CommunityGeographySchema {
  countryCode?: string;
  countryName?: string;
  countryLocalName?: string;
  countrySlug?: string;
  regionCode?: string;
  regionName?: string;
  regionLocalName?: string;
  regionSlug?: string;
  localityName?: string;
  localityLocalName?: string;
  localitySlug?: string;
}

export interface CommunityBreadcrumbSchema {
  name: string;
  path: string;
}

export interface CommunityRelationshipsSchema {
  parentKeys: string[];
  childKeys: string[];
  relatedKeys: string[];
}

export interface CommunityLinksSchema {
  whatsapp?: string | null;
  telegram?: string | null;
  instagram?: string | null;
  discord?: string | null;
}

export interface CommunityListItemSchema {
  name: string;
  url?: string | null;
}

export interface CommunityImageSchema {
  type: "custom" | "default";
  url: string;
}

export interface CommunityPageSchema {
  communityKey: string;
  scope: CommunityScope;
  displayName: string;
  preferredSlug: string;
  allSlugs: string[];
  canonicalPath: string;
  title: string;
  description: string;
  geography: CommunityGeographySchema;
  breadcrumbs: CommunityBreadcrumbSchema[];
  relationships: CommunityRelationshipsSchema;
  counts: {
    totalSpots: number;
    topRated: number;
    dry: number;
  };
  topRatedSpots: SpotPreviewData[];
  drySpots: SpotPreviewData[];
  links: CommunityLinksSchema;
  resources: CommunityListItemSchema[];
  organisations: CommunityListItemSchema[];
  athletes: CommunityListItemSchema[];
  events: CommunityListItemSchema[];
  image: CommunityImageSchema;
  published: boolean;
  generatedAt?: Timestamp | { seconds: number; nanoseconds: number };
  sourceMaxUpdatedAt?: Timestamp | { seconds: number; nanoseconds: number };

  /**
   * Geographic center of the community (lat/lng). Used by the map-island to
   * surface the community when the visible viewport intersects its area.
   * Set together with `bounds_radius_m`. Optional — communities without
   * these fields don't auto-surface in the island (only on their explicit
   * `/map/communities/<slug>` route).
   *
   * Stored as `[lat, lng]` to match the spot Typesense convention so a
   * future communities Typesense collection can reuse the same geo-search
   * shape.
   */
  bounds_center?: [number, number];
  /** Radius in meters from `bounds_center` covering the community area. */
  bounds_radius_m?: number;
}
