import type { CommunityGeographySchema } from "./CommunityPageSchema";

export interface CommunityMergeLocalityOptionSchema {
  communityKey: string;
  displayName: string;
  geography: CommunityGeographySchema;
  spotCount: number;
  distanceKm?: number;
}

export interface CommunityMergeAdminStateSchema {
  candidates: CommunityMergeLocalityOptionSchema[];
  mergedLocalities: CommunityMergeLocalityOptionSchema[];
}

export interface GetCommunityMergeAdminStateRequest {
  targetCommunityKey: string;
}

export interface MergeUnpublishedLocalityRequest {
  sourceCommunityKey: string;
  targetCommunityKey: string;
}

export type UnmergeUnpublishedLocalityRequest =
  MergeUnpublishedLocalityRequest;

export interface CommunityMergeActionResponse {
  ok: true;
}
