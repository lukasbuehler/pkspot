import { describe, expect, it } from "vitest";
import {
  extractGoogleMyMapsId,
  isHighVolumeImport,
  validateImportPolicy,
} from "./kml-import-policy";

const validGoodFaithReview = {
  permissionStatus: "no" as const,
  spotCount: 100,
  publicSourceConfirmed: true,
  contactAttempted: true,
  contactTarget: "@community_map",
  noObjectionReceived: true,
  removalOnRequestConfirmed: true,
  highVolumeReviewConfirmed: false,
  viewerMapId: "1P2CoVVISRCOmArO21gbXoRYoxXHVZXMC",
};

describe("KML import policy", () => {
  it("treats 100 as an internal review boundary, not an inclusive block", () => {
    expect(isHighVolumeImport(100)).toBe(false);
    expect(isHighVolumeImport(101)).toBe(true);
  });

  it("allows a reviewed public-map import without explicit permission", () => {
    expect(validateImportPolicy(validGoodFaithReview)).toBeNull();
  });

  it("requires heightened review above 100 spots", () => {
    expect(
      validateImportPolicy({ ...validGoodFaithReview, spotCount: 101 })
    ).toContain("heightened review");
    expect(
      validateImportPolicy({
        ...validGoodFaithReview,
        spotCount: 101,
        highVolumeReviewConfirmed: true,
      })
    ).toBeNull();
  });

  it("requires a source link for a no-permission import", () => {
    expect(
      validateImportPolicy({
        ...validGoodFaithReview,
        viewerMapId: undefined,
      })
    ).toContain("viewer ID");
  });
});

describe("Google My Maps ID extraction", () => {
  it("extracts an ID from viewer and KML URLs", () => {
    expect(
      extractGoogleMyMapsId(
        "https://www.google.com/maps/d/viewer?mid=1Z171LJyTS3I2r5AQDh-rx7rH3LVVgS5D"
      )
    ).toBe("1Z171LJyTS3I2r5AQDh-rx7rH3LVVgS5D");
    expect(
      extractGoogleMyMapsId(
        "<href>https://www.google.com/maps/d/kml?forcekml=1&amp;mid=1P2CoVVISRCOmArO21gbXoRYoxXHVZXMC</href>"
      )
    ).toBe("1P2CoVVISRCOmArO21gbXoRYoxXHVZXMC");
  });
});
