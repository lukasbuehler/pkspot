import type { CommunityGeographySchema } from "./CommunityPageSchema";

export interface CommunityMergeLocalityOptionSchema {
  communityKey: string;
  displayName: string;
  geography: CommunityGeographySchema;
  spotCount: number;
  distanceKm?: number;
}

/**
 * How a locality in the target's region relates to a region override:
 * - `available`: joins the target when it is inside the radius.
 * - `already_merged`: already belongs to the target through an explicit merge.
 * - `has_page`: keeps its own published page; merge it explicitly if needed.
 * - `other_community`: belongs to a different community through a merge.
 */
export type CommunityRegionOverrideLocalityStatus =
  | "available"
  | "already_merged"
  | "has_page"
  | "other_community";

export interface CommunityRegionOverrideLocalitySchema
  extends CommunityMergeLocalityOptionSchema {
  /** Distance from the override centre, so the client can preview any radius. */
  distanceKm: number;
  status: CommunityRegionOverrideLocalityStatus;
}

export interface CommunityRegionOverrideAdminSchema {
  regionName: string;
  center: { lat: number; lng: number };
  /** The saved radius, or null when no override is active. */
  radiusKm: number | null;
  minRadiusKm: number;
  maxRadiusKm: number;
  localities: CommunityRegionOverrideLocalitySchema[];
}

export interface CommunityMergeAdminStateSchema {
  candidates: CommunityMergeLocalityOptionSchema[];
  mergedLocalities: CommunityMergeLocalityOptionSchema[];
  /** Missing from older function deployments and for targets without a region. */
  regionOverride?: CommunityRegionOverrideAdminSchema | null;
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

export interface SetCommunityRegionOverrideRequest {
  targetCommunityKey: string;
  radiusKm: number;
}

export interface RemoveCommunityRegionOverrideRequest {
  targetCommunityKey: string;
}

export interface CommunityRegionOverrideActionResponse {
  ok: true;
  addedLocalityCount: number;
  removedLocalityCount: number;
}
