import { describe, expect, it } from "vitest";
import { environment as defaults } from "./environment.default";
import { environment as production } from "./environment.production";
import { environment as staging } from "./environment.staging";
import { environment as ci } from "./environment.ci";

describe("release feature availability", () => {
  it.each([defaults, production, staging, ci])("keeps OneID off in $name", (environment) => {
    expect(environment.features.ageVerification).toEqual({
      google_play: true,
      apple: true,
      oneid: false,
    });
  });

  it.each([production, staging])("ships enhanced share cards in $name", (environment) => {
    expect(environment.features.shareCards).toBe(true);
    expect(environment.features.plannedSessions).toBe(false);
  });
});
