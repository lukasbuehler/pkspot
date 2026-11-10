// @vitest-environment node
import { describe, expect, it } from "vitest";
import { cloudflareSsrAllowedHosts } from "./cloudflare-hosts";

describe("Cloudflare SSR host separation", () => {
  it("allows production only on the production build", () => {
    const production = cloudflareSsrAllowedHosts("Production");
    expect(production).toContain("pkspot.app");
    expect(production).not.toContain("test.pkspot.app");
    expect(cloudflareSsrAllowedHosts("Staging")).not.toContain("pkspot.app");
  });

  it("keeps staging previews and local runtime checks available", () => {
    expect(cloudflareSsrAllowedHosts("Staging")).toEqual([
      "test.pkspot.app", "*.test.pkspot.app", "*.workers.dev", "localhost", "127.0.0.1", "[::1]",
    ]);
  });
});
