import { detectSsrLayoutHints } from "./ssr-layout-hints";

/** The subset of the Workers Cache API this module needs. */
export interface SsrCacheStore {
  match(request: Request): Promise<Response | undefined>;
  put(request: Request, response: Response): Promise<void>;
}

export interface WorkerExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
}

export type SsrCacheStatus = "hit" | "stale" | "miss" | "bypass";

interface CachePolicy {
  /** Seconds a cached page is served without re-rendering. */
  freshSeconds: number;
  /** Further seconds a page may be served while it re-renders in the background. */
  staleSeconds: number;
}

/**
 * Visitors get long-lived HTML because the app replaces the server-rendered
 * data with live Firestore and Typesense data after hydration. Crawlers and
 * link-preview bots never hydrate, so their copy expires after a few minutes
 * and is never served stale.
 */
export const SSR_CACHE_POLICIES: Record<"visitor" | "crawler", CachePolicy> = {
  visitor: { freshSeconds: 60 * 60, staleSeconds: 7 * 24 * 60 * 60 },
  crawler: { freshSeconds: 5 * 60, staleSeconds: 0 },
};

const CRAWLER_USER_AGENT =
  /bot\b|bot\/|crawl|spider|slurp|facebookexternalhit|facebookcatalog|meta-externalagent|whatsapp|telegram|discord|slack|skypeuripreview|embedly|iframely|pinterest|vkshare|google-inspectiontool|googleother/i;

/** Request headers that must not change the render, since the cache key ignores them. */
const RENDER_IGNORED_HEADERS = [
  "accept-language",
  "authorization",
  "cookie",
  "x-pkspot-client-region",
];

const RENDERED_AT_HEADER = "X-PKSpot-Rendered-At";
export const SSR_CACHE_STATUS_HEADER = "X-PKSpot-SSR-Cache";

/** Keys re-rendering in this isolate, so a burst of stale hits renders once. */
const refreshing = new Set<string>();

export interface CachedRenderOptions {
  request: Request;
  render: (request: Request) => Promise<Response>;
  /** Changes with every deploy, so old HTML never points at removed bundles. */
  deploymentId?: string;
  store?: SsrCacheStore;
  context?: WorkerExecutionContext;
  now?: () => number;
}

/**
 * Renders anonymous HTML through the per-data-centre Workers cache.
 * Requests are rendered without language, region or credential headers, so
 * every visitor with the same URL and layout gets identical HTML. The browser
 * picks the start region itself after hydration.
 */
export async function renderWithSsrCache({
  request,
  render,
  deploymentId,
  store,
  context,
  now = Date.now,
}: CachedRenderOptions): Promise<{ response: Response; status: SsrCacheStatus }> {
  const renderRequest = withoutPersonalHeaders(request);
  if (!deploymentId || !store || !context) {
    return { response: await render(renderRequest), status: "bypass" };
  }
  const audience = CRAWLER_USER_AGENT.test(request.headers.get("user-agent") ?? "")
    ? "crawler" : "visitor";
  const policy = SSR_CACHE_POLICIES[audience];
  const key = cacheKey(request, deploymentId, audience);

  const cached = await store.match(key).catch(() => undefined);
  if (cached) {
    const ageSeconds = (now() - Number(cached.headers.get(RENDERED_AT_HEADER))) / 1000;
    if (ageSeconds >= 0 && ageSeconds < policy.freshSeconds) {
      return { response: cached, status: "hit" };
    }
    if (ageSeconds >= 0 && ageSeconds < policy.freshSeconds + policy.staleSeconds) {
      if (!refreshing.has(key.url)) {
        refreshing.add(key.url);
        context.waitUntil(
          render(renderRequest)
            .then((fresh) => storeIfCacheable(store, key, fresh, policy, now()))
            .catch(() => undefined)
            .finally(() => refreshing.delete(key.url)),
        );
      }
      return { response: cached, status: "stale" };
    }
    void cached.body?.cancel().catch(() => undefined);
  }

  const rendered = await render(renderRequest);
  if (!isCacheable(rendered)) return { response: rendered, status: "miss" };
  const html = await rendered.text();
  const response = new Response(html, rendered);
  context.waitUntil(
    storeIfCacheable(store, key, new Response(html, rendered), policy, now(), html)
      .catch(() => undefined),
  );
  return { response, status: "miss" };
}

function withoutPersonalHeaders(request: Request): Request {
  const headers = new Headers(request.headers);
  for (const name of RENDER_IGNORED_HEADERS) headers.delete(name);
  // HEAD shares the GET entry; the caller drops the body.
  return new Request(request.url, { method: "GET", headers });
}

function cacheKey(request: Request, deploymentId: string, audience: string): Request {
  const url = new URL(request.url);
  const layout = detectSsrLayoutHints(request.headers);
  const variant = `${layout.mobile ? "m" : "-"}${layout.tablet ? "t" : "-"}`;
  const key = new URL(
    `/__ssr-cache/${encodeURIComponent(deploymentId)}/${variant}/${audience}${url.pathname}${url.search}`,
    url.origin,
  );
  return new Request(key.toString(), { method: "GET" });
}

function isCacheable(response: Response): boolean {
  return response.status === 200 &&
    !response.headers.has("Set-Cookie") &&
    (response.headers.get("Content-Type") ?? "").startsWith("text/html");
}

async function storeIfCacheable(
  store: SsrCacheStore,
  key: Request,
  response: Response,
  policy: CachePolicy,
  renderedAt: number,
  knownHtml?: string,
): Promise<void> {
  if (!isCacheable(response)) {
    await response.body?.cancel();
    return;
  }
  const html = knownHtml ?? await response.text();
  // A client-rendered fallback must not be stored for an hour or a week.
  if (!html.includes("ng-server-context")) return;
  const headers = new Headers(response.headers);
  headers.set("Cache-Control", `public, max-age=${policy.freshSeconds + policy.staleSeconds}`);
  headers.set(RENDERED_AT_HEADER, String(renderedAt));
  await store.put(key, new Response(html, { status: 200, headers }));
}

/** Strips the cache bookkeeping before a cached page goes to the browser. */
export function toBrowserResponse(response: Response, status: SsrCacheStatus): Response {
  const headers = new Headers(response.headers);
  headers.delete(RENDERED_AT_HEADER);
  headers.set(SSR_CACHE_STATUS_HEADER, status);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
