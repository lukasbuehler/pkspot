import { Timestamp } from "firebase/firestore";
import { UserReferenceSchema } from "./UserSchema";

export type OrganizationRole = "owner" | "admin" | "reviewer";

export interface OrganizationReferenceSchema {
  id: string;
  name: string;
  slug: string;
  logo_url?: string;
  logo_background_color?: string;
}

export interface OrganizationSchema {
  name: string;
  slug: string;
  logo_url?: string;
  logo_background_color?: string;
  website_url?: string;
  description?: string;
  active: boolean;
  time_created?: Timestamp;
  time_updated?: Timestamp;
}

export interface OrganizationMemberSchema {
  role: OrganizationRole;
  user: UserReferenceSchema;
  joined_at?: Timestamp;
  updated_at?: Timestamp;
}

export interface OrganizationVerifiedSpotSchema {
  spot_id: string;
  spot_slug?: string;
  spot_name?: Record<string, string> | string;
  status: "active";
  organization_id: string;
  organization: OrganizationReferenceSchema;
  stewarded_by_user_id: string;
  stewarded_at?: Timestamp;
  time_updated?: Timestamp;
}

export interface OrganizationManagedSpotSchema {
  spot_id: string;
  spot_slug?: string;
  spot_name?: Record<string, string> | string;
  status: "managed";
  organization_id: string;
  organization: OrganizationReferenceSchema;
  managed_by_user_id: string;
  managed_at?: Timestamp;
  lock_edits: true;
  time_updated?: Timestamp;
}


export interface OrganizationUsedSpotSchema {
  spot_id: string;
  spot_slug?: string;
  spot_name?: Record<string, string> | string;
  status: "active";
  organization_id: string;
  organization: OrganizationReferenceSchema;
  added_by_user_id: string;
  added_at?: Timestamp;
  note?: string;
  time_updated?: Timestamp;
}
