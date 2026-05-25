import { FieldValue } from "firebase-admin/firestore";

export interface OrganizationReferenceData {
  id: string;
  name: string;
  slug: string;
  logo_url?: string;
  logo_background_color?: string;
}

export interface SpotVerificationData {
  status: "verified";
  organization_id: string;
  organization: OrganizationReferenceData;
  verified_by_user_id: string;
  verified_at: unknown;
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

export function makeSpotVerificationData(
  organizationId: string,
  organization: Record<string, unknown>,
  verifiedByUserId: string,
  verifiedAt: unknown = FieldValue.serverTimestamp()
): SpotVerificationData {
  return {
    status: "verified",
    organization_id: organizationId,
    organization: makeOrganizationReference(organizationId, organization),
    verified_by_user_id: verifiedByUserId,
    verified_at: verifiedAt,
    lock_edits: true,
  };
}

export function makeVerifiedSpotIndexData(
  spotId: string,
  spot: Record<string, unknown>,
  verification: SpotVerificationData,
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
    status: verification.status,
    organization_id: verification.organization_id,
    organization: verification.organization,
    verified_by_user_id: verification.verified_by_user_id,
    verified_at: verification.verified_at,
    lock_edits: verification.lock_edits,
    time_updated: updatedAt,
  };
}
