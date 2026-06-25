import { describe, expect, it } from "vitest";
import { User } from "./User";

describe("User", () => {
  it("defaults future profile access fields to today's public behavior", () => {
    const user = new User("user-1", {
      display_name: "Avery",
    });

    expect(user.accountPrivacy).toBe("public");
    expect(user.profileVisibility).toBe("public");
  });

  it("hydrates account privacy and profile visibility scaffold fields", () => {
    const user = new User("user-1", {
      display_name: "Avery",
      account_privacy: "private",
      profile_visibility: "mutuals",
    });

    expect(user.accountPrivacy).toBe("private");
    expect(user.profileVisibility).toBe("mutuals");
  });
});
