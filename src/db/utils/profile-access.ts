import type {
  UserAccountPrivacy,
  UserProfileVisibility,
} from "../schemas/UserSchema";

export interface UnifiedProfileAccessFields {
  account_privacy: UserAccountPrivacy;
  profile_visibility: UserProfileVisibility;
  public_profile_enabled: boolean;
  public_search: boolean;
}

export function normalizeProfileVisibility(
  accountPrivacy: UserAccountPrivacy,
  profileVisibility?: UserProfileVisibility,
): UserProfileVisibility {
  if (accountPrivacy === "private" && profileVisibility === "public") {
    return "followers";
  }
  return profileVisibility ??
    (accountPrivacy === "private" ? "followers" : "public");
}

export function unifiedProfilePrivacy(
  accountPrivacy: UserAccountPrivacy,
  profileVisibility: UserProfileVisibility | undefined,
  publicProfileEnabled: boolean,
): UserAccountPrivacy {
  return accountPrivacy === "public" &&
    normalizeProfileVisibility(accountPrivacy, profileVisibility) === "public" &&
    publicProfileEnabled
    ? "public"
    : "private";
}

export function profileAccessFieldsForPrivacy(
  privacy: UserAccountPrivacy,
  publicSearch: boolean,
): UnifiedProfileAccessFields {
  const isPublic = privacy === "public";
  return {
    account_privacy: privacy,
    profile_visibility: isPublic ? "public" : "followers",
    public_profile_enabled: isPublic,
    public_search: isPublic && publicSearch,
  };
}

export function profileAccessNeedsUnification(
  fields: UnifiedProfileAccessFields,
): boolean {
  const privacy = unifiedProfilePrivacy(
    fields.account_privacy,
    fields.profile_visibility,
    fields.public_profile_enabled,
  );
  const normalized = profileAccessFieldsForPrivacy(
    privacy,
    fields.public_search,
  );
  return (
    normalized.account_privacy !== fields.account_privacy ||
    normalized.profile_visibility !== fields.profile_visibility ||
    normalized.public_profile_enabled !== fields.public_profile_enabled ||
    normalized.public_search !== fields.public_search
  );
}
