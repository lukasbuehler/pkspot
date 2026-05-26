import { FieldValue } from "firebase-admin/firestore";

export interface OrganizationReferenceData {
  id: string;
  name: string;
  slug: string;
  logo_url?: string;
  logo_background_color?: string;
}

export interface SpotStewardshipData {
  status: "active";
  organization_id: string;
  organization: OrganizationReferenceData;
  stewarded_by_user_id: string;
  stewarded_at: unknown;
}

export interface SpotStewardshipStateData {
  organization_ids: string[];
  organizations: Record<string, SpotStewardshipData>;
}

export interface SpotManagementData {
  status: "managed";
  organization_id: string;
  organization: OrganizationReferenceData;
  managed_by_user_id: string;
  managed_at: unknown;
  lock_edits: true;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

export function makeOrganizationReference(
  organizationId: string,
  organization: Record<string, unknown>
): OrganizationReferenceData {
  const logoUrl = optionalString(organization["logo_url"]);
  const logoBackgroundColor = optionalString(
    organization["logo_background_color"]
  );

  return {
    id: organizationId,
    name: optionalString(organization["name"]) ?? organizationId,
    slug: optionalString(organization["slug"]) ?? organizationId,
    ...(logoUrl ? { logo_url: logoUrl } : {}),
    ...(logoBackgroundColor
      ? { logo_background_color: logoBackgroundColor }
      : {}),
  };
}

export function makeSpotStewardshipData(
  organizationId: string,
  organization: Record<string, unknown>,
  stewardedByUserId: string,
  stewardedAt: unknown = FieldValue.serverTimestamp()
): SpotStewardshipData {
  return {
    status: "active",
    organization_id: organizationId,
    organization: makeOrganizationReference(organizationId, organization),
    stewarded_by_user_id: stewardedByUserId,
    stewarded_at: stewardedAt,
  };
}

export function makeSpotManagementData(
  organizationId: string,
  organization: Record<string, unknown>,
  managedByUserId: string,
  managedAt: unknown = FieldValue.serverTimestamp()
): SpotManagementData {
  return {
    status: "managed",
    organization_id: organizationId,
    organization: makeOrganizationReference(organizationId, organization),
    managed_by_user_id: managedByUserId,
    managed_at: managedAt,
    lock_edits: true,
  };
}

export function getStewardshipState(
  spot: Record<string, unknown>
): SpotStewardshipStateData {
  const state = spot["stewardship"] as Partial<SpotStewardshipStateData> | undefined;
  const organizations =
    state?.organizations && typeof state.organizations === "object"
      ? { ...state.organizations }
      : {};
  const organizationIds = Array.isArray(state?.organization_ids)
    ? state.organization_ids.filter((id): id is string => typeof id === "string")
    : Object.keys(organizations);

  return {
    organization_ids: Array.from(new Set(organizationIds)),
    organizations,
  };
}

export function makeVerifiedSpotIndexData(
  spotId: string,
  spot: Record<string, unknown>,
  stewardship: SpotStewardshipData,
  updatedAt: unknown = FieldValue.serverTimestamp()
): Record<string, unknown> {
  const spotSlug = optionalString(spot["slug"]);
  const spotName = spot["name"];

  return {
    spot_id: spotId,
    ...(spotSlug ? { spot_slug: spotSlug } : {}),
    ...(typeof spotName === "string" ||
    (spotName !== null && typeof spotName === "object")
      ? { spot_name: spotName }
      : {}),
    status: stewardship.status,
    organization_id: stewardship.organization_id,
    organization: stewardship.organization,
    stewarded_by_user_id: stewardship.stewarded_by_user_id,
    stewarded_at: stewardship.stewarded_at,
    time_updated: updatedAt,
  };
}

export function makeManagedSpotIndexData(
  spotId: string,
  spot: Record<string, unknown>,
  management: SpotManagementData,
  updatedAt: unknown = FieldValue.serverTimestamp()
): Record<string, unknown> {
  const spotSlug = optionalString(spot["slug"]);
  const spotName = spot["name"];

  return {
    spot_id: spotId,
    ...(spotSlug ? { spot_slug: spotSlug } : {}),
    ...(typeof spotName === "string" ||
    (spotName !== null && typeof spotName === "object")
      ? { spot_name: spotName }
      : {}),
    status: management.status,
    organization_id: management.organization_id,
    organization: management.organization,
    managed_by_user_id: management.managed_by_user_id,
    managed_at: management.managed_at,
    lock_edits: management.lock_edits,
    time_updated: updatedAt,
  };
}


export function makeUsedSpotIndexData(
  spotId: string,
  spot: Record<string, unknown>,
  organizationId: string,
  organization: Record<string, unknown>,
  addedByUserId: string,
  addedAt: unknown = FieldValue.serverTimestamp(),
  updatedAt: unknown = FieldValue.serverTimestamp()
): Record<string, unknown> {
  const spotSlug = optionalString(spot["slug"]);
  const spotName = spot["name"];

  return {
    spot_id: spotId,
    ...(spotSlug ? { spot_slug: spotSlug } : {}),
    ...(typeof spotName === "string" ||
    (spotName !== null && typeof spotName === "object")
      ? { spot_name: spotName }
      : {}),
    status: "active",
    organization_id: organizationId,
    organization: makeOrganizationReference(organizationId, organization),
    added_by_user_id: addedByUserId,
    added_at: addedAt,
    time_updated: updatedAt,
  };
}
