import type {
  UserAccountPrivacy,
  UserProfileVisibility,
} from "../schemas/UserSchema";

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
