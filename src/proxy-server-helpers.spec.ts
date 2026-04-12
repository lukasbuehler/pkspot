import { describe, expect, it } from "vitest";
import {
  applyTrustedClientRegionHeader,
  getTrustedClientRegionFromHeaders,
  normalizeClientRegionHeader,
} from "./proxy-server-helpers.mjs";

describe("proxy-server client region helpers", () => {
  it("should normalize a trusted client region header", () => {
    expect(normalizeClientRegionHeader(" us ")).toBe("US");
    expect(normalizeClientRegionHeader(["ch"])).toBe("CH");
  });

  it("should ignore malformed or missing client region headers", () => {
    expect(normalizeClientRegionHeader("USA")).toBeNull();
    expect(normalizeClientRegionHeader("12")).toBeNull();
    expect(normalizeClientRegionHeader(undefined)).toBeNull();
  });

  it("should only read the trusted region header and never derive from forwarded ips", () => {
    const headers = {
      "x-forwarded-for": "203.0.113.10",
      "x-pkspot-client-region": undefined,
    };

    expect(getTrustedClientRegionFromHeaders(headers)).toBeNull();
    expect(applyTrustedClientRegionHeader(headers)).toBeNull();
    expect(headers).not.toHaveProperty("x-pkspot-client-region");
  });

  it("should pass through a normalized trusted client region header", () => {
    const headers = {
      "x-pkspot-client-region": "au",
    };

    expect(applyTrustedClientRegionHeader(headers)).toBe("AU");
    expect(headers["x-pkspot-client-region"]).toBe("AU");
  });
});
