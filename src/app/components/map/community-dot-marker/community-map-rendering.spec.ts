import { describe, expect, it } from "vitest";
import type { CommunityMapMarker } from "./community-dot-marker.component";
import {
  COMMUNITY_DOT_SIZE_PX,
  communityCircleDiameterPx,
  shouldShowCommunityDot,
} from "./community-map-rendering";

const locality: CommunityMapMarker = {
  communityKey: "test-community",
  displayName: "Test community",
  scope: "locality",
  center: { lat: 47, lng: 8 },
  radiusM: 1_000,
};

describe("community map rendering", () => {
  it("uses a fixed tiny community marker", () => {
    expect(COMMUNITY_DOT_SIZE_PX).toBe(8);
  });

  it("hands a locality from its dot to its real circle as it grows", () => {
    expect(shouldShowCommunityDot(locality, 8)).toBe(true);
    expect(communityCircleDiameterPx(locality, 8)).toBeLessThanOrEqual(
      COMMUNITY_DOT_SIZE_PX,
    );

    expect(shouldShowCommunityDot(locality, 12)).toBe(false);
    expect(communityCircleDiameterPx(locality, 12)).toBeGreaterThan(
      COMMUNITY_DOT_SIZE_PX,
    );
  });

  it("does not render country or region communities as dots", () => {
    expect(
      shouldShowCommunityDot({ ...locality, scope: "region" }, 18),
    ).toBe(false);
    expect(
      shouldShowCommunityDot({ ...locality, scope: "country" }, 4),
    ).toBe(false);
  });
});
