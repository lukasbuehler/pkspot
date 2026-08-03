import { describe, expect, it } from "vitest";
import {
  profileAccessFieldsForPrivacy,
  profileAccessNeedsUnification,
  unifiedProfilePrivacy,
} from "./profile-access";

describe("unified profile privacy", () => {
  it("treats a profile as public only when all legacy access fields agree", () => {
    expect(unifiedProfilePrivacy("public", "public", true)).toBe("public");
    expect(unifiedProfilePrivacy("public", "followers", true)).toBe("private");
    expect(unifiedProfilePrivacy("public", "public", false)).toBe("private");
    expect(unifiedProfilePrivacy("private", "followers", false)).toBe(
      "private",
    );
  });

  it("writes the legacy fields as one public or private decision", () => {
    expect(profileAccessFieldsForPrivacy("public", true)).toEqual({
      account_privacy: "public",
      profile_visibility: "public",
      public_profile_enabled: true,
      public_search: true,
    });
    expect(profileAccessFieldsForPrivacy("private", true)).toEqual({
      account_privacy: "private",
      profile_visibility: "followers",
      public_profile_enabled: false,
      public_search: false,
    });
  });

  it("detects contradictory legacy settings that need normalization", () => {
    expect(
      profileAccessNeedsUnification({
        account_privacy: "public",
        profile_visibility: "public",
        public_profile_enabled: false,
        public_search: false,
      }),
    ).toBe(true);
    expect(
      profileAccessNeedsUnification({
        account_privacy: "private",
        profile_visibility: "followers",
        public_profile_enabled: false,
        public_search: false,
      }),
    ).toBe(false);
  });
});
