import { describe, expect, it, vi } from "vitest";
import { createCloudflareRequestHandler } from "./cloudflare-request-handler";

function setup(host = "test.pkspot.app") {
  const render = vi.fn<(request: Request) => Promise<Response | null>>(
    async () =>
      new Response("<title>SSR page</title>", {
        headers: { "Content-Type": "text/html" },
      }),
  );
  const assets = {
    fetch: vi.fn<(request: Request) => Promise<Response>>(
      async () =>
        new Response("asset", { headers: { "Content-Type": "image/png" } }),
    ),
  };
  const handle = createCloudflareRequestHandler(render);
  return {
    render,
    assets,
    request: (path: string, init?: RequestInit) =>
      handle(new Request(`https://${host}${path}`, init), {
        ASSETS: assets,
      }),
  };
}

describe("Cloudflare request routing", () => {
  it.each([
    "test.pkspot.app", "branch.test.pkspot.app", "pkspot-web.workers.dev", "pkspot.app",
  ])("rejects probes on %s before rendering, assets or redirects", async (host) => {
    const { request, render, assets } = setup(host);
    for (const path of [
      "/.env", "/backend/.env", "/de/.env.production", "/%2egit/config",
      "/wp-admin/", "/wp-content/debug.log", "/wp-includes/version.php",
      "/wp-login.php", "/xmlrpc.php", "/en/wp-admin/", "/INFO.PHP",
    ]) {
      for (const method of ["GET", "HEAD", "POST"]) {
        const response = await request(path, { method });
        expect(response.status, `${method} ${path}`).toBe(404);
        expect(response.headers.get("Cache-Control")).toBe("no-store");
        expect(response.headers.get("Location")).toBeNull();
        expect(await response.text()).toBe(method === "HEAD" ? "" : "Not Found");
      }
    }
    expect(render).not.toHaveBeenCalled();
    expect(assets.fetch).not.toHaveBeenCalled();
  });

  it("preserves deep links and queries when selecting the preferred supported locale", async () => {
    const { request, render, assets } = setup();
    const response = await request("/map/spots/imax?tab=photos", {
      headers: { "Accept-Language": "zz;q=1,en;q=0.2,de-CH;q=0.9" },
    });
    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe(
      "/de/map/spots/imax?tab=photos",
    );
    expect(response.headers.get("Vary")).toBe("Accept-Language");
    expect(render).not.toHaveBeenCalled();
    expect(assets.fetch).not.toHaveBeenCalled();
  });

  it("does not select a rejected locale and defaults to English", async () => {
    const { request } = setup();
    const response = await request("/?test=1", {
      headers: { "Accept-Language": "fr;q=0,zz;q=0.5" },
    });
    expect(response.headers.get("Location")).toBe("/en?test=1");
  });

  it.each(["/en", "/en/"])("renders %s directly as the map", async (path) => {
    const { request, render } = setup();
    expect((await request(path)).status).toBe(200);
    expect(new URL(render.mock.calls[0][0].url).pathname).toBe("/en/map");
  });

  it.each([
    ["/de-CH/map/spots/imax?x=1", "/de/map/spots/imax?x=1"],
    ["/en/map/imax?x=1", "/en/map/spots/imax?x=1"],
    ["/en/map/events/swissjam25", "/en/events/swissjam25"],
    ["/en/map/spots/imax/index.html", "/en/map/spots/imax"],
  ])("keeps the permanent redirect for %s", async (path, target) => {
    const response = await setup().request(path);
    expect(response.status).toBe(301);
    expect(response.headers.get("Location")).toBe(target);
  });

  it.each([
    ["/assets/icons/favicon-16x16.png", "/en/assets/icons/favicon-16x16.png"],
    [
      "/fr/assets/icons/favicon-16x16.png",
      "/fr/assets/icons/favicon-16x16.png",
    ],
    ["/firebase-messaging-sw.js", "/en/firebase-messaging-sw.js"],
    [
      "/.well-known/apple-app-site-association",
      "/en/assets/.well-known/apple-app-site-association",
    ],
  ])("serves %s without rendering Angular", async (path, target) => {
    const { request, render, assets } = setup();
    const response = await request(path);
    expect(response.status).toBe(200);
    expect(new URL(assets.fetch.mock.calls[0][0].url).pathname).toBe(target);
    expect(render).not.toHaveBeenCalled();
    if (path.endsWith("firebase-messaging-sw.js"))
      expect(response.headers.get("Service-Worker-Allowed")).toBe("/");
  });

  it("returns a missing asset as an uncached 404, without a locale redirect", async () => {
    const { request, assets, render } = setup();
    assets.fetch.mockResolvedValue(new Response("Not Found", { status: 404 }));
    const response = await request("/assets/missing.png");
    expect(response.status).toBe(404);
    expect(response.headers.get("Location")).toBeNull();
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(render).not.toHaveBeenCalled();
  });

  it("preserves Angular's 404 and keeps staging pages out of indexes", async () => {
    const { request, render } = setup();
    render.mockResolvedValue(new Response("Not Found", { status: 404 }));
    const response = await request("/en/missing");
    expect(response.status).toBe(404);
    expect(response.headers.get("X-Robots-Tag")).toBe(
      "noindex, nofollow, noarchive",
    );
    expect(response.headers.get("Cache-Control")).toBe("no-cache");
  });

  it("identifies null-render fallbacks without logging URL or query data", async () => {
    const { request, render } = setup();
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      render.mockResolvedValue(null);
      const response = await request("/en/map/spots/imax?private=value");
      expect(response.status).toBe(404);
      expect(await response.text()).toBe("Not Found");
      expect(error).toHaveBeenCalledExactlyOnceWith(
        "Cloudflare SSR returned no response",
        { locale: "en" },
      );
    } finally {
      error.mockRestore();
    }
  });

  it("returns HEAD metadata without a body", async () => {
    const response = await setup().request("/en/about", { method: "HEAD" });
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("");
  });
});
