import { describe, expect, it } from "vitest";
import { getResizedProfilePictureUrl } from "./ProfilePictureHelper";

describe("ProfilePictureHelper", () => {
  it("does not create an image URL without a stored profile picture", () => {
    expect(getResizedProfilePictureUrl(undefined)).toBeUndefined();
    expect(getResizedProfilePictureUrl("")).toBeUndefined();
  });

  it("derives a resized URL from a stored profile picture", () => {
    const profilePicture =
      "https://firebasestorage.googleapis.com/v0/b/example.appspot.com/o/profile_pictures%2Fuser-1?alt=media";

    expect(getResizedProfilePictureUrl(profilePicture)).toBe(
      "https://firebasestorage.googleapis.com/v0/b/example.appspot.com/o/profile_pictures%2Fuser-1_200x200?alt=media",
    );
  });
});
