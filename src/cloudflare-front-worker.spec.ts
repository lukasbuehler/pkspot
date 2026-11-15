// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { createFrontWorker } from "./cloudflare-front-worker";
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

function setup(rendererBuild: string) {
  const store = new MemoryCache();
  vi.stubGlobal("caches", { default: store });
  const pending: Promise<unknown>[] = [];
  const renderer = vi.fn(async (request: Request) =>
    new Response(
      `<html><body ng-server-context="ssr">${new URL(request.url).pathname}</body></html>`,
      { headers: { "Content-Type": "text/html; charset=utf-8", [RENDER_BUILD_HEADER]: rendererBuild } },
    ),
  );
  const worker = createFrontWorker("build-2");
  const environment = {
    ASSETS: { fetch: vi.fn(async () => new Response("asset")) },
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
});
