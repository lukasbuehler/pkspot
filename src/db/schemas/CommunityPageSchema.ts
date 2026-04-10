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
}
