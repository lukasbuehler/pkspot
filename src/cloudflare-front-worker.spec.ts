// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { RENDERER_ASSET_HEADER, createFrontWorker } from "./cloudflare-front-worker";
import { RENDER_BUILD_HEADER, SSR_CACHE_STATUS_HEADER } from "./cloudflare-ssr-cache";

/** Like the Workers cache, every match gets its own body. */
class MemoryCache {
  readonly entries = new Map<string, { body: string; headers: Headers }>();
  async match(request: Request) {
    const entry = this.entries.get(request.url);
    return entry && new Response(entry.body, { headers: entry.headers });
  }
  async put(request: Request, response: Response) {
    this.entries.set(request.url, { body: await response.text(), headers: response.headers });
  }
}

function setup(rendererBuild: string, { ownAssetStatus = 200, rendererAssetStatus = 200 } = {}) {
  const store = new MemoryCache();
  vi.stubGlobal("caches", { default: store });
  const pending: Promise<unknown>[] = [];
  const renderer = vi.fn(async (request: Request) =>
    request.headers.has(RENDERER_ASSET_HEADER)
      ? new Response("renderer asset", { status: rendererAssetStatus })
      : new Response(
      `<html><body ng-server-context="ssr">${new URL(request.url).pathname}</body></html>`,
      { headers: { "Content-Type": "text/html; charset=utf-8", [RENDER_BUILD_HEADER]: rendererBuild } },
    ),
  );
  const worker = createFrontWorker("build-2");
  const environment = {
    ASSETS: { fetch: vi.fn(async () => new Response("asset", { status: ownAssetStatus })) },
    SSR: { fetch: renderer },
    CF_VERSION_METADATA: { id: "front-version" },
  };
  return {
    renderer,
    environment,
    settle: () => Promise.all(pending.splice(0)),
    request: (path: string) =>
      worker.fetch(new Request(`https://pkspot.app${path}`), environment, {
        waitUntil: (promise) => pending.push(promise),
      }),
  };
}

describe("Cloudflare front Worker", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("renders through the renderer binding and serves the next visit from the cache", async () => {
    const { request, renderer, settle } = setup("build-2");

    const first = await request("/en/map/spots/imax");
    await settle();
    const second = await request("/en/map/spots/imax");

    expect(renderer).toHaveBeenCalledTimes(1);
    expect(first.headers.get(SSR_CACHE_STATUS_HEADER)).toBe("miss");
    expect(second.headers.get(SSR_CACHE_STATUS_HEADER)).toBe("hit");
    expect(first.headers.has(RENDER_BUILD_HEADER)).toBe(false);
    expect(second.headers.has(RENDER_BUILD_HEADER)).toBe(false);
  });

  it("does not cache a page from a renderer of another build", async () => {
    // Mid-deploy, the renderer may still run the previous build.
    const { request, renderer, settle } = setup("build-1");

    await request("/en/map");
    await settle();
    const second = await request("/en/map");

    expect(renderer).toHaveBeenCalledTimes(2);
    expect(second.headers.get(SSR_CACHE_STATUS_HEADER)).toBe("miss");
  });

  it("serves assets and redirects without calling the renderer", async () => {
    const { request, renderer, environment } = setup("build-2");

    const asset = await request("/en/main-ABC123.js");
    const redirect = await request("/map");

    expect(await asset.text()).toBe("asset");
    expect(environment.ASSETS.fetch).toHaveBeenCalledTimes(1);
    expect(redirect.status).toBe(302);
    expect(renderer).not.toHaveBeenCalled();
  });

  it("loads a hashed bundle of the renderer's build that this Worker does not have", async () => {
    // Between the two deploys, a page from the new renderer references new bundles.
    const { request, renderer } = setup("build-3", { ownAssetStatus: 404 });

    const asset = await request("/en/chunk-B7GGXzGw.js");

    expect(await asset.text()).toBe("renderer asset");
    expect(renderer).toHaveBeenCalledTimes(1);
    expect(renderer.mock.calls[0][0].headers.get(RENDERER_ASSET_HEADER)).toBe("1");
  });

  it("keeps the 404 for unhashed files and bundles the renderer lacks too", async () => {
    const { request, renderer } = setup("build-2", { ownAssetStatus: 404, rendererAssetStatus: 404 });

    expect((await request("/en/robots-missing.txt")).status).toBe(404);
    expect(renderer).not.toHaveBeenCalled();
    expect((await request("/en/main-ABC12345.js")).status).toBe(404);
    expect(renderer).toHaveBeenCalledTimes(1);
  });

  it("serves the iCal feed itself without waking the renderer", async () => {
    const { renderer, environment } = setup("build-2");
    const search = vi.fn(async () =>
      Response.json({
        hits: [
          {
            document: {
              id: "jam-1",
              name: "Santa Jam",
              start_seconds: 1_796_000_000,
              end_seconds: 1_796_010_000,
            },
          },
        ],
      }),
    );
    vi.stubGlobal("fetch", search);
    const worker = createFrontWorker("build-2", {
      typesense: { host: "search.example.test", apiKey: "search-only" },
    });

    const response = await worker.fetch(
      new Request("https://pkspot.app/calendar/events.ics?country=ch"),
      environment,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("text/calendar");
    expect(await response.text()).toContain("SUMMARY:Santa Jam");
    expect(String(search.mock.calls[0]?.[0])).toContain("search.example.test");
    expect(renderer).not.toHaveBeenCalled();
    expect(environment.ASSETS.fetch).not.toHaveBeenCalled();
  });

  it("answers the feed with 503 when the build has no search key", async () => {
    const { request, renderer } = setup("build-2");
    const response = await request("/calendar/events.ics");
    expect(response.status).toBe(503);
    expect(renderer).not.toHaveBeenCalled();
  });
});
