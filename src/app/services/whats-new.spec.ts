import { describe, expect, it } from "vitest";
import { WHATS_NEW_RELEASE, welcomeScreenFor } from "./whats-new";

describe("welcomeScreenFor", () => {
  it("welcomes new devices with the full agreement", () => {
    expect(welcomeScreenFor(null, "7", null)).toBe("welcome");
  });

  it("shows returning users the highlights together with the new agreement", () => {
    expect(welcomeScreenFor("6", "7", null)).toBe("whats-new-consent");
    expect(welcomeScreenFor("5", "7", "1.1")).toBe("whats-new-consent");
  });

  it("shows only the highlights when the terms are current but the release is new", () => {
    expect(welcomeScreenFor("7", "7", "1.1")).toBe("whats-new");
  });

  it("stays quiet once the current release was seen", () => {
    expect(welcomeScreenFor("7", "7", WHATS_NEW_RELEASE)).toBeNull();
    expect(welcomeScreenFor("7", "7", null)).toBeNull();
  });
});
