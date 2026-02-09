import { Timestamp } from "firebase/firestore";
import { SpotAccess, SpotTypes } from "./SpotTypeAndAccess";
import { AmenitiesMap } from "./Amenities";
import { UserReferenceSchema } from "./UserSchema";

export type ImportStatus =
  | "PENDING"
  | "PROCESSING"
  | "COMPLETED"
  | "PARTIAL"
  | "FAILED";

export interface ImportFolderTemplateSchema {
  name: string;
  type?: SpotTypes;
  access?: SpotAccess;
  amenities?: Partial<AmenitiesMap>;
}

export interface ImportCreditSchema {
  source_name: string;
  attribution_text?: string;
  website_url?: string;
  instagram_url?: string;
  license: string;
}

export interface ImportLegalSchema {
  confirmed_rights: boolean;
  confirmed_external_image_rights: boolean;
}

export interface ImportSchema {
  created_at: Timestamp;
  updated_at?: Timestamp;
  status: ImportStatus;

  user: UserReferenceSchema;

  file_name: string;
  file_type: "kml" | "kmz" | "unknown";
  file_size_bytes?: number;
  storage_url?: string;

  credits: ImportCreditSchema;
  legal: ImportLegalSchema;

  source_url?: string;
  allow_future_auto_update?: boolean;

  language?: string;
  spot_count_total: number;
  spot_count_imported: number;
  spot_count_skipped: number;
  skipped_indices?: number[];

  folder_templates?: ImportFolderTemplateSchema[];

  chunk_count_total?: number;
  chunk_count_processed?: number;

  error_message?: string;
}

export interface ImportChunkSpotSchema {
  name: string;
  language: string;
  description?: string;
  media_urls?: string[];
  location: { lat: number; lng: number };
  bounds?: { lat: number; lng: number }[];
  type?: string;
  access?: string;
  amenities?: Partial<AmenitiesMap>;
}

export interface ImportChunkSchema {
  created_at: Timestamp;
  status: "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED";
  spots: ImportChunkSpotSchema[];
  chunk_index: number;
  spot_count: number;
  imported_count?: number;
  error_message?: string;
}
