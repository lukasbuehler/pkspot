import { describe, expect, it } from "vitest";
import {
  buildFullUserProfile,
  buildLimitedUserProfile,
  buildPublicUserProfile,
  effectivePublicProfileEnabled,
  profileAudienceForUser,
  publicProfileSyncAction,
} from "../functions/src/userProfileProjection";

const adultPolicy = {
  age_policy: {
    age_range: { lower: 18, upper: 24 },
    adult_eligibility: "verified",
    assurance: {
      status: "active",
      client_integrity: "play_integrity_request_bound",
    },
  },
};

describe("user profile projections", () => {
  it("reconciles the current source with the persisted public projection", () => {
    expect(publicProfileSyncAction(
      {display_name: "Private", contributions_count: 1},
      null,
    )).toEqual({type: "none"});

    const publicProfile = {
      ...adultPolicy,
      display_name: "Public",
      account_privacy: "public",
      profile_visibility: "public",
      public_profile_enabled: true,
    };
    const projectedProfile = buildPublicUserProfile(publicProfile)!;
    expect(publicProfileSyncAction(publicProfile, projectedProfile))
      .toEqual({type: "none"});
    expect(publicProfileSyncAction({
      ...publicProfile,
      display_name: "Updated",
    }, projectedProfile)).toMatchObject({
      type: "set",
      profile: {display_name: "Updated"},
    });
    expect(publicProfileSyncAction(null, projectedProfile))
      .toEqual({type: "delete"});
    expect(publicProfileSyncAction(null, null)).toEqual({type: "none"});
  });

  it("repairs reversed and duplicate event delivery from current state", () => {
    const currentPrivateUser = {
      display_name: "Private now",
      account_privacy: "private",
      profile_visibility: "followers",
    };
    const stalePublicProjection = buildPublicUserProfile({
      ...adultPolicy,
      display_name: "Previously public",
      account_privacy: "public",
      profile_visibility: "public",
      public_profile_enabled: true,
    })!;

    expect(publicProfileSyncAction(
      currentPrivateUser,
      stalePublicProjection,
    )).toEqual({type: "delete"});
    expect(publicProfileSyncAction(currentPrivateUser, null))
      .toEqual({type: "none"});
  });

  it("publishes only a confirmed adult who explicitly opted in", () => {
    const profile = buildPublicUserProfile({
      ...adultPolicy,
      display_name: "Adult Traceur",
      biography: "Public bio",
      home_city: "London",
      account_privacy: "public",
      profile_visibility: "public",
      public_profile_enabled: true,
      public_search: true,
    });

    expect(profile).toMatchObject({
      display_name: "Adult Traceur",
      biography: "Public bio",
      home_city: "London",
      public_profile_enabled: true,
      public_search: true,
      profile_access: "full",
      profile_projection_version: 1,
    });
  });

  it("does not treat a default public account as publication consent", () => {
    const user = {
      display_name: "Unknown age",
      biography: "Should not be projected",
      account_privacy: "public",
      profile_visibility: "public",
    };

    expect(effectivePublicProfileEnabled(user)).toBe(false);
    expect(profileAudienceForUser(user)).toBe("followers");
    expect(buildPublicUserProfile(user)).toBeNull();
  });

  it("does not publish a self-declared adult range", () => {
    expect(
      buildPublicUserProfile({
        age_policy: {
          age_range: { lower: 18 },
          adult_eligibility: "not_verified",
          assurance: { evidence_strength: "self_declared" },
        },
        account_privacy: "public",
        profile_visibility: "public",
        public_profile_enabled: true,
      }),
    ).toBeNull();
  });

  it("does not expire an active approval because of a legacy date", () => {
    expect(
      buildPublicUserProfile({
        ...adultPolicy,
        age_policy: {
          ...adultPolicy.age_policy,
          assurance: {
            ...adultPolicy.age_policy.assurance,
            valid_until: new Date(0),
          },
        },
        account_privacy: "public",
        profile_visibility: "public",
        public_profile_enabled: true,
      }),
    ).not.toBeNull();
  });

  it("keeps confirmed minors owner-only even with stale public flags", () => {
    const user = {
      age_policy: { age_range: { lower: 13, upper: 17 } },
      account_privacy: "public",
      profile_visibility: "public",
      public_profile_enabled: true,
      public_search: true,
    };

    expect(profileAudienceForUser(user)).toBe("owner");
    expect(buildPublicUserProfile(user)).toBeNull();
  });

  it("redacts expanded fields from a limited profile", () => {
    const limited = buildLimitedUserProfile({
      display_name: "Private Traceur",
      biography: "Private bio",
      profile_picture: "private.jpg",
      home_city: "London",
      socials: { instagram_handle: "private" },
      account_privacy: "private",
      profile_visibility: "mutuals",
    });

    expect(limited).toEqual({
      display_name: "Private Traceur",
      account_privacy: "private",
      profile_visibility: "mutuals",
      public_profile_enabled: false,
      public_search: false,
      profile_access: "limited",
    });
  });

  it("never copies private account or age-policy fields into full profiles", () => {
    const full = buildFullUserProfile({
      ...adultPolicy,
      display_name: "Visible",
      verified_email: true,
      invite_code: "secret",
      blocked_users: ["blocked"],
      home_spots: ["home"],
      account_privacy: "private",
      profile_visibility: "followers",
    });

    expect(full).not.toHaveProperty("verified_email");
    expect(full).not.toHaveProperty("invite_code");
    expect(full).not.toHaveProperty("blocked_users");
    expect(full).not.toHaveProperty("home_spots");
    expect(full).not.toHaveProperty("age_policy");
  });
});
