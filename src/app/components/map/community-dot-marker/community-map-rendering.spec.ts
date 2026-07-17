import { describe, expect, it } from "vitest";
import type { CommunityMapMarker } from "./community-dot-marker.component";
import {
  COMMUNITY_DOTS_PER_TILE,
  COMMUNITY_DOT_SIZE_PX,
  communityCircleDiameterPx,
  limitCommunityDotsPerTile,
  shouldShowCommunityAreaPresence,
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

  it("limits community dots in each map tile while preserving input priority", () => {
    const communities = Array.from(
      { length: COMMUNITY_DOTS_PER_TILE + 2 },
      (_, index) => ({
        ...locality,
        communityKey: `community-${index}`,
      }),
    );

    expect(
      limitCommunityDotsPerTile(communities, 8).map(
        (community) => community.communityKey,
      ),
    ).toEqual(
      communities
        .slice(0, COMMUNITY_DOTS_PER_TILE)
        .map((community) => community.communityKey),
    );
  });

  it("applies the community dot limit independently to separate tiles", () => {
    const communities = [
      { ...locality, communityKey: "west", center: { lat: 47, lng: 8 } },
      { ...locality, communityKey: "east", center: { lat: 47, lng: 10 } },
    ];

    expect(limitCommunityDotsPerTile(communities, 8)).toHaveLength(2);
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

  it("keeps area presence alongside an opted-in full community pin", () => {
    expect(
      shouldShowCommunityAreaPresence({ ...locality, pinVisible: true }),
    ).toBe(false);
    expect(
      shouldShowCommunityAreaPresence({
        ...locality,
        pinVisible: true,
        showAreaPresence: true,
      }),
    ).toBe(true);
  });
});
