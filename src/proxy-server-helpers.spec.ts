import { describe, expect, it, vi } from "vitest";
import {
  applySsrDocumentCacheHeaders,
  applyTrustedClientRegionHeader,
  DYNAMIC_SSR_CACHE_CONTROL,
  getStaticAssetCacheControl,
  getQrStickerRedirectTarget,
  getRetiredUiLocaleRedirectTarget,
  getTrustedClientRegionFromHeaders,
  handlePublicCallableRequest,
  handleQrStickerRequest,
  isStaticSsrPath,
  LONG_LIVED_ASSET_CACHE_CONTROL,
  MISSING_ASSET_CACHE_CONTROL,
  normalizeClientRegionHeader,
  REVALIDATING_ASSET_CACHE_CONTROL,
  sendMissingAssetResponse,
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

  it("should redirect retired Swiss German URLs to German", () => {
    expect(getRetiredUiLocaleRedirectTarget("/de-CH")).toBe("/de");
    expect(getRetiredUiLocaleRedirectTarget("/de-CH/")).toBe("/de/");
    expect(
      getRetiredUiLocaleRedirectTarget(
        "/de-CH/map/spots/josefhalle?filter=dry&zoom=16",
      ),
    ).toBe("/de/map/spots/josefhalle?filter=dry&zoom=16");
  });

  it("should only redirect an exact retired locale path segment", () => {
    expect(getRetiredUiLocaleRedirectTarget("/de/map")).toBeNull();
    expect(getRetiredUiLocaleRedirectTarget("/de-CH-community")).toBeNull();
    expect(getRetiredUiLocaleRedirectTarget(undefined)).toBeNull();
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

  it("should proxy the allowlisted public provenance callable", async () => {
    const headers = new Map([["content-type", "application/json"]]);
    const fetchImpl = vi.fn().mockResolvedValue({
      headers: { get: (name: string) => headers.get(name) ?? null },
      status: 200,
      text: vi.fn().mockResolvedValue('{"result":null}'),
    });
    const res = {
      send: vi.fn(),
      setHeader: vi.fn(),
      status: vi.fn(() => res),
    };

    await handlePublicCallableRequest(
      {
        body: { data: { importId: "pkspot-import" } },
        params: { functionName: "getPublicImportProvenance" },
      },
      res,
      fetchImpl,
    );

    expect(fetchImpl).toHaveBeenCalledWith(
      "https://europe-west1-parkour-base-project.cloudfunctions.net/getPublicImportProvenance",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: '{"data":{"importId":"pkspot-import"}}',
      },
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.send).toHaveBeenCalledWith('{"result":null}');
  });

  it("should reject public callable names that are not allowlisted", async () => {
    const fetchImpl = vi.fn();
    const res = {
      send: vi.fn(),
      status: vi.fn(() => res),
    };

    await handlePublicCallableRequest(
      {
        body: { data: {} },
        params: { functionName: "adminFunction" },
      },
      res,
      fetchImpl,
    );

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it("should cache fingerprinted browser assets for a long time", () => {
    expect(
      getStaticAssetCacheControl(
        { originalUrl: "/en/main-AB12CD34.js" },
        "/app/browser/en/main-AB12CD34.js"
      )
    ).toBe(LONG_LIVED_ASSET_CACHE_CONTROL);

    expect(
      getStaticAssetCacheControl(
        { originalUrl: "/en/assets/fonts/material-symbols.woff2?v=e781ea4e6f" },
        "/app/browser/en/assets/fonts/material-symbols.woff2"
      )
    ).toBe(LONG_LIVED_ASSET_CACHE_CONTROL);
  });

  it("should require revalidation for stable browser asset URLs", () => {
    expect(
      getStaticAssetCacheControl(
        { originalUrl: "/en/main.js" },
        "/app/browser/en/main.js"
      )
    ).toBe(REVALIDATING_ASSET_CACHE_CONTROL);

    expect(
      getStaticAssetCacheControl(
        { originalUrl: "/en/manifest.webmanifest" },
        "/app/browser/en/manifest.webmanifest"
      )
    ).toBe(REVALIDATING_ASSET_CACHE_CONTROL);
  });

  it("should classify static SSR paths after stripping locale prefixes", () => {
    const languages = ["en", "de", "fr"];

    expect(isStaticSsrPath("/", languages)).toBe(true);
    expect(isStaticSsrPath("/en/about", languages)).toBe(true);
    expect(isStaticSsrPath("/de/safety", languages)).toBe(true);
    expect(isStaticSsrPath("/fr/privacy-policy/", languages)).toBe(true);
    expect(isStaticSsrPath("/en/map", languages)).toBe(false);
    expect(isStaticSsrPath("/de/map/spots/josefhalle", languages)).toBe(false);
    expect(isStaticSsrPath("/en/events/swissjam25", languages)).toBe(false);
  });

  it("should keep build freshness headers for static SSR pages", () => {
    const headers: Record<string, string> = {};
    const res = {
      removeHeader: vi.fn((key: string) => {
        delete headers[key];
      }),
      setHeader: vi.fn((key: string, value: string) => {
        headers[key] = value;
      }),
    };
    const lastModified = "Wed, 24 Jun 2026 18:21:21 GMT";

    applySsrDocumentCacheHeaders(
      res,
      "/en/terms-of-service",
      lastModified,
      ["en"]
    );

    expect(headers["Cache-Control"]).toBe(REVALIDATING_ASSET_CACHE_CONTROL);
    expect(headers["Last-Modified"]).toBe(lastModified);
    expect(res.removeHeader).not.toHaveBeenCalled();
  });

  it("should omit build freshness headers for dynamic SSR pages", () => {
    const headers: Record<string, string> = {
      "Last-Modified": "Wed, 24 Jun 2026 18:21:21 GMT",
    };
    const res = {
      removeHeader: vi.fn((key: string) => {
        delete headers[key];
      }),
      setHeader: vi.fn((key: string, value: string) => {
        headers[key] = value;
      }),
    };

    applySsrDocumentCacheHeaders(
      res,
      "/en/map/spots/josefhalle",
      "Wed, 24 Jun 2026 18:21:21 GMT",
      ["en"]
    );

    expect(headers["Cache-Control"]).toBe(DYNAMIC_SSR_CACHE_CONTROL);
    expect(headers).not.toHaveProperty("Last-Modified");
    expect(res.removeHeader).toHaveBeenCalledWith("Last-Modified");
  });

  it("should not let missing browser assets inherit immutable cache headers", () => {
    const res = {
      headersSent: false,
      send: vi.fn(),
      setHeader: vi.fn(),
      status: vi.fn(() => res),
      type: vi.fn(() => res),
    };

    sendMissingAssetResponse(res, "/en/chunk-LX5C6STU.js");

    expect(res.setHeader).toHaveBeenCalledWith(
      "Cache-Control",
      MISSING_ASSET_CACHE_CONTROL
    );
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.type).toHaveBeenCalledWith("text/plain");
    expect(res.send).toHaveBeenCalledWith(
      "Asset not found: /en/chunk-LX5C6STU.js"
    );
  });
});
