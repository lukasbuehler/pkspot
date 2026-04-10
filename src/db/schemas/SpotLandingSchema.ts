export interface SpotLandingSchema {
  countryCode: string;
  countryNameEn: string;
  countrySlug: string;
  regionCode?: string;
  regionName?: string;
  regionSlug?: string;
  localityName?: string;
  localitySlug?: string;
  isDry: boolean;
  organizationVerified: boolean;
}
