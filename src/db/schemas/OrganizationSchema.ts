import { Timestamp } from "firebase/firestore";
import { UserReferenceSchema } from "./UserSchema";

export type OrganizationRole = "owner" | "admin" | "reviewer";

export interface OrganizationReferenceSchema {
  id: string;
  name: string;
  slug: string;
  logo_url?: string;
}

export interface OrganizationSchema {
  name: string;
  slug: string;
  logo_url?: string;
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
