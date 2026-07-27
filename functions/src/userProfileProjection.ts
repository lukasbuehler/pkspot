export type UserProfileAudience =
  | "owner"
  | "followers"
  | "mutuals"
  | "public";

export type UserProfileProjection = Record<string, unknown> & {
  profile_access: "full";
  public_profile_enabled: boolean;
  public_search: boolean;
};

const PROFILE_FIELDS = [
  "display_name",
  "biography",
  "profile_picture",
  "follower_count",
  "following_count",
  "visited_spots_count",
  "spot_creates_count",
  "spot_edits_count",
  "media_added_count",
  "signup_number",
  "is_admin",
  "special_badges",
  "pinned_badges",
  "start_date",
  "start_date_raw_ms",
  "nationality_code",
  "home_city",
  "socials",
] as const;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const numberField = (
  value: unknown,
  key: string
): number | undefined => {
  if (!isRecord(value)) return undefined;
  const field = value[key];
  return typeof field === "number" && Number.isFinite(field)
    ? field
    : undefined;
};

export const hasVerifiedAdultEligibility = (
  user: Record<string, unknown>
): boolean => {
  const policy = user["age_policy"];
  if (
    !isRecord(policy) ||
    policy["adult_eligibility"] !== "verified"
  ) {
    return false;
  }
  const range = isRecord(policy) ? policy["age_range"] : undefined;
  const lower = numberField(range, "lower");
  return lower !== undefined && lower >= 18;
};

export const hasConfirmedMinorAge = (
  user: Record<string, unknown>
): boolean => {
  const policy = user["age_policy"];
  const range = isRecord(policy) ? policy["age_range"] : undefined;
  const upper = numberField(range, "upper");
  return upper !== undefined && upper < 18;
};

const normalizedAccountPrivacy = (
  user: Record<string, unknown>
): "public" | "private" =>
  user["account_privacy"] === "private" ? "private" : "public";

const normalizedProfileVisibility = (
  user: Record<string, unknown>
): "public" | "followers" | "mutuals" => {
  const accountPrivacy = normalizedAccountPrivacy(user);
  const requested = user["profile_visibility"];
  if (requested === "mutuals" || requested === "followers") {
    return requested;
  }
  return accountPrivacy === "private" ? "followers" : "public";
};

export const effectivePublicProfileEnabled = (
  user: Record<string, unknown>
): boolean =>
  user["public_profile_enabled"] === true &&
  hasVerifiedAdultEligibility(user) &&
  normalizedAccountPrivacy(user) === "public" &&
  normalizedProfileVisibility(user) === "public";

export const profileAudienceForUser = (
  user: Record<string, unknown>
): UserProfileAudience => {
  if (hasConfirmedMinorAge(user)) return "owner";
  if (effectivePublicProfileEnabled(user)) return "public";

  const visibility = normalizedProfileVisibility(user);
  return visibility === "mutuals" ? "mutuals" : "followers";
};

export const buildFullUserProfile = (
  user: Record<string, unknown>
): UserProfileProjection => {
  const profile = Object.fromEntries(
    PROFILE_FIELDS.flatMap((field) => {
      const value = user[field];
      return value === undefined ? [] : [[field, value]];
    })
  );
  const publicProfileEnabled = effectivePublicProfileEnabled(user);

  return {
    ...profile,
    account_privacy: normalizedAccountPrivacy(user),
    profile_visibility: normalizedProfileVisibility(user),
    public_profile_enabled: publicProfileEnabled,
    public_search: publicProfileEnabled && user["public_search"] === true,
    profile_access: "full",
  };
};

export const buildLimitedUserProfile = (
  user: Record<string, unknown>
): Record<string, unknown> => ({
  ...(typeof user["display_name"] === "string"
    ? { display_name: user["display_name"] }
    : {}),
  account_privacy: normalizedAccountPrivacy(user),
  profile_visibility: normalizedProfileVisibility(user),
  public_profile_enabled: false,
  public_search: false,
  profile_access: "limited",
});

export const buildPublicUserProfile = (
  user: Record<string, unknown>
): UserProfileProjection | null => {
  if (!effectivePublicProfileEnabled(user)) return null;
  return {
    ...buildFullUserProfile(user),
    profile_projection_version: 1,
  };
};
