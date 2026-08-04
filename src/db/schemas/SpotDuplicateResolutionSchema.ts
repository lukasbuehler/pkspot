import type { MediaSchema } from "./Media";

export type SpotDuplicateBlockerCode =
  | "different_creator"
  | "different_create_payload"
  | "outside_rapid_window"
  | "too_many_edits"
  | "unique_content"
  | "reviews"
  | "challenges"
  | "events"
  | "check_ins"
  | "private_lists"
  | "home_spot"
  | "organization_reference"
  | "unrelated_reports";

export interface SpotDuplicateDependencyCounts {
  edits: number;
  reviews: number;
  reports: number;
  challenges: number;
  events: number;
  checkIns: number;
  privateLists: number;
  homeSpots: number;
  organizationReferences: number;
  slugAliases: number;
}

export interface SpotDuplicateCandidatePreview {
  id: string;
  name: string;
  description?: string;
  media: MediaSchema[];
  creatorUid?: string;
  createdAtMillis?: number;
  editCount: number;
  dependencies: SpotDuplicateDependencyCounts;
  uniqueFields: string[];
}

export interface PreviewSpotDuplicateResolutionRequest {
  reportPath: string;
  candidateSpotId: string;
}

export interface PreviewSpotDuplicateResolutionResponse {
  reported: SpotDuplicateCandidatePreview;
  candidate: SpotDuplicateCandidatePreview;
  eligibleCanonicalSpotIds: string[];
  blockers: SpotDuplicateBlockerCode[];
  previewToken: string;
}

export interface ResolveSpotDuplicateRequest {
  reportPath: string;
  canonicalSpotId: string;
  redundantSpotId: string;
  previewToken: string;
}

export interface ResolveSpotDuplicateResponse {
  ok: true;
  canonicalSpotId: string;
  redundantSpotId: string;
  replayed: boolean;
}
