import { describe, expect, it, vi } from "vitest";
import {
  applyTrustedClientRegionHeader,
  getQrStickerRedirectTarget,
  getTrustedClientRegionFromHeaders,
  handleQrStickerRequest,
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

  it("should build the QR sticker redirect with explicit UTM parameters", () => {
    expect(
      getQrStickerRedirectTarget(
        "/qr/nice?foo=bar&utm_source=old&utm_medium=old&utm_campaign=old",
        "nice"
      )
    ).toBe(
      "/map?foo=bar&utm_source=sticker&utm_medium=qr&utm_campaign=nice-spot-v1"
    );
  });

  it("should not build QR redirect targets for unknown sticker slugs", () => {
    expect(getQrStickerRedirectTarget("/qr/unknown", "unknown")).toBeNull();
  });

  it("should handle known QR sticker requests as 302 redirects", () => {
    const headers: Record<string, string> = {};
    const res = {
      redirect: vi.fn(),
      setHeader: vi.fn((key: string, value: string) => {
        headers[key] = value;
      }),
    };
    const next = vi.fn();

    handleQrStickerRequest(
      { originalUrl: "/qr/nice?batch=42", params: { slug: "nice" } },
      res,
      next
    );

    expect(headers["Cache-Control"]).toBe("no-store");
    expect(res.redirect).toHaveBeenCalledWith(
      302,
      "/map?batch=42&utm_source=sticker&utm_medium=qr&utm_campaign=nice-spot-v1"
    );
    expect(next).not.toHaveBeenCalled();
  });

  it("should pass unknown QR sticker requests to the next route", () => {
    const res = {
      redirect: vi.fn(),
      setHeader: vi.fn(),
    };
    const next = vi.fn();

    handleQrStickerRequest(
      { originalUrl: "/qr/unknown", params: { slug: "unknown" } },
      res,
      next
    );

    expect(res.setHeader).not.toHaveBeenCalled();
    expect(res.redirect).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalled();
  });
});
