// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { createCloudflareRequestHandler } from "./cloudflare-request-handler";
import { SSR_CACHE_POLICIES, SSR_CACHE_STATUS_HEADER } from "./cloudflare-ssr-cache";
import { detectSsrLayoutHints } from "./ssr-layout-hints";

const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Mobile/15E148 Safari/604.1";
const DESKTOP = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/140.0 Safari/537.36";
const GOOGLEBOT = "Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X) Chrome/140.0 Mobile Safari/537.36 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";

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

function setup({ deploymentId = "version-1" as string | null } = {}) {
  let clock = 1_000_000;
  let renders = 0;
  const store = new MemoryCache();
  const pending: Promise<unknown>[] = [];
  const render = vi.fn(async (request: Request) => {
    renders += 1;
    return new Response(
      `<html><body ng-server-context="ssr">render ${renders} ${new URL(request.url).pathname}</body></html>`,
      { headers: { "Content-Type": "text/html; charset=utf-8" } },
    );
  });
  const handle = createCloudflareRequestHandler(render, undefined, () => store);
  vi.spyOn(Date, "now").mockImplementation(() => clock);
  return {
    store,
    render,
    advance: (seconds: number) => { clock += seconds * 1000; },
    settle: () => Promise.all(pending.splice(0)),
    request: (path: string, headers: Record<string, string> = { "user-agent": IPHONE }, version = deploymentId) =>
      handle(
        new Request(`https://pkspot.app${path}`, { headers }),
        { ASSETS: { fetch: async () => new Response(null, { status: 404 }) }, CF_VERSION_METADATA: version ? { id: version } : undefined },
        { waitUntil: (promise) => pending.push(promise) },
      ),
  };
}

describe("Cloudflare SSR HTML cache", () => {
  it("serves a second visitor from the edge cache without rendering again", async () => {
    const { request, render, settle } = setup();
    const first = await request("/en/map/spots/imax");
    expect(first.headers.get(SSR_CACHE_STATUS_HEADER)).toBe("miss");
    await settle();
    const second = await request("/en/map/spots/imax");
    expect(second.headers.get(SSR_CACHE_STATUS_HEADER)).toBe("hit");
    expect(await second.text()).toContain("render 1");
    expect(second.headers.get("Cache-Control")).toBe("no-cache");
    expect(second.headers.get("X-PKSpot-Rendered-At")).toBeNull();
    expect(render).toHaveBeenCalledTimes(1);
  });

  it("serves stale HTML to visitors and refreshes it in the background", async () => {
    const { request, render, advance, settle } = setup();
    await request("/en/map");
    await settle();
    advance(SSR_CACHE_POLICIES.visitor.freshSeconds + 1);
    const stale = await request("/en/map");
    expect(stale.headers.get(SSR_CACHE_STATUS_HEADER)).toBe("stale");
    expect(await stale.text()).toContain("render 1");
    await settle();
    expect(render).toHaveBeenCalledTimes(2);
    const refreshed = await request("/en/map");
    expect(refreshed.headers.get(SSR_CACHE_STATUS_HEADER)).toBe("hit");
    expect(await refreshed.text()).toContain("render 2");
  });

  it("gives crawlers their own short-lived copy that is never served stale", async () => {
    const { request, render, advance, settle } = setup();
    const crawler = { "user-agent": GOOGLEBOT };
    await request("/en/map/spots/imax");
    await request("/en/map/spots/imax", crawler);
    await settle();
    expect(render).toHaveBeenCalledTimes(2);
    expect((await request("/en/map/spots/imax", crawler)).headers.get(SSR_CACHE_STATUS_HEADER)).toBe("hit");
    advance(SSR_CACHE_POLICIES.crawler.freshSeconds + 1);
    const expired = await request("/en/map/spots/imax", crawler);
    expect(expired.headers.get(SSR_CACHE_STATUS_HEADER)).toBe("miss");
    expect(await expired.text()).toContain("render 3");
    expect((await request("/en/map/spots/imax")).headers.get(SSR_CACHE_STATUS_HEADER)).toBe("hit");
  });

  it("keeps mobile and desktop layouts apart but shares them across languages and regions", async () => {
    const { request, render, settle } = setup();
    await request("/en/map", { "user-agent": IPHONE, "accept-language": "en-US" });
    await settle();
    expect((await request("/en/map", { "user-agent": IPHONE, "accept-language": "de-CH" })).headers.get(SSR_CACHE_STATUS_HEADER)).toBe("hit");
    expect((await request("/en/map", { "user-agent": DESKTOP })).headers.get(SSR_CACHE_STATUS_HEADER)).toBe("miss");
    expect(render).toHaveBeenCalledTimes(2);
  });

  it("renders without language, region or credential headers", async () => {
    const { request, render } = setup();
    await request("/en/map", {
      "user-agent": IPHONE,
      "accept-language": "de-CH",
      "x-pkspot-client-region": "CH",
      cookie: "session=1",
      authorization: "Bearer token",
    });
    const headers = render.mock.calls[0][0].headers;
    expect(headers.get("user-agent")).toBe(IPHONE);
    for (const name of ["accept-language", "x-pkspot-client-region", "cookie", "authorization"]) {
      expect(headers.has(name), name).toBe(false);
    }
  });

  it("starts a new cache with every deploy", async () => {
    const { request, settle } = setup();
    await request("/en/map");
    await settle();
    const next = await request("/en/map", { "user-agent": IPHONE }, "version-2");
    expect(next.headers.get(SSR_CACHE_STATUS_HEADER)).toBe("miss");
  });

  it("bypasses the cache when the deploy id is unavailable", async () => {
    const { request, store, settle } = setup({ deploymentId: null });
    const response = await request("/en/map");
    await settle();
    expect(response.headers.get(SSR_CACHE_STATUS_HEADER)).toBe("bypass");
    expect(store.entries.size).toBe(0);
  });

  it.each([
    ["a 404", new Response("Not Found", { status: 404, headers: { "Content-Type": "text/html" } })],
    ["a cookie", new Response("<b ng-server-context>x</b>", { headers: { "Content-Type": "text/html", "Set-Cookie": "a=1" } })],
    ["a client-rendered fallback", new Response("<app-root></app-root>", { headers: { "Content-Type": "text/html" } })],
  ])("never stores a response with %s", async (_label, response) => {
    const { request, render, store, settle } = setup();
    render.mockResolvedValueOnce(response);
    await request("/en/map/spots/missing");
    await settle();
    expect(store.entries.size).toBe(0);
  });
});

describe("SSR layout hints", () => {
  it.each([
    [{ "sec-ch-ua-mobile": "?1" }, { mobile: true, tablet: false }],
    [{ "sec-ch-ua-mobile": "?0", "user-agent": IPHONE }, { mobile: false, tablet: false }],
    [{ "user-agent": IPHONE }, { mobile: true, tablet: false }],
    [{ "user-agent": "Mozilla/5.0 (Linux; Android 14; SM-X710) Safari/537.36" }, { mobile: true, tablet: true }],
    [{ "user-agent": DESKTOP }, { mobile: false, tablet: false }],
  ])("reads %o as %o", (headers, expected) => {
    expect(detectSsrLayoutHints(new Headers(headers))).toEqual(expected);
  });
});
