import {
  createCloudflareRequestHandler,
  type CloudflareAssets,
  type CloudflareWorkerEnvironment,
} from "./cloudflare-request-handler";
import type { WorkerExecutionContext } from "./cloudflare-ssr-cache";
import {
  type EventCalendarFeedConfig,
  handleEventCalendarFeed,
} from "./event-calendar-feed";

/** Marks a renderer request that asks for one of its own build's assets. */
export const RENDERER_ASSET_HEADER = "X-PKSpot-Renderer-Asset";

/** Content-hashed build output, such as `chunk-B7GGXzGw.js` or `videogular-54D7AHHD.woff`. */
const HASHED_ASSET =
  /\/[^/]+-[A-Za-z0-9_-]{8}\.(?:m?js|css|woff2?|ttf|eot|otf|svg|png|jpe?g|gif|webp|avif|ico)$/u;

/** Bindings of the front Worker, which owns the domain, assets and HTML cache. */
export interface CloudflareFrontEnvironment extends CloudflareWorkerEnvironment {
  /** Service binding to the renderer Worker that runs Angular SSR. */
  SSR: { fetch(request: Request): Promise<Response> };
}

export interface FrontWorkerOptions {
  /** Public search-only Typesense access for the iCal feed. */
  typesense?: EventCalendarFeedConfig["typesense"];
}

/**
 * The front Worker answers redirects, static assets, cached pages and the iCal
 * feed without loading Angular, so a cold isolate starts in milliseconds. Only
 * cache misses reach the renderer Worker, through a service binding with no
 * public route.
 *
 * Keep this module and its imports free of Angular: everything it imports is
 * loaded on every cold start.
 */
export function createFrontWorker(buildId: string, options: FrontWorkerOptions = {}) {
  const typesense = options.typesense ?? { host: "", apiKey: "" };
  const handleCalendarFeed = (request: Request) =>
    handleEventCalendarFeed(request, { typesense });
  return {
    fetch(
      request: Request,
      environment: CloudflareFrontEnvironment,
      context?: WorkerExecutionContext,
    ): Promise<Response> {
      const handle = createCloudflareRequestHandler(
        (renderRequest) => environment.SSR.fetch(renderRequest),
        undefined,
        undefined,
        buildId,
        handleCalendarFeed,
      );
      return handle(
        request,
        { ...environment, ASSETS: withRendererAssets(environment) },
        context,
      );
    },
  };
}

/**
 * The two Workers deploy one after the other, and a failed deploy can leave
 * them on different builds. A page rendered by the other build references
 * hashed bundles this Worker does not have, so ask the renderer, which holds
 * the assets of the build that rendered the page.
 */
function withRendererAssets(environment: CloudflareFrontEnvironment): CloudflareAssets {
  return {
    async fetch(request) {
      const own = await environment.ASSETS.fetch(request);
      if (own.status !== 404 || !HASHED_ASSET.test(new URL(request.url).pathname)) {
        return own;
      }
      try {
        const rendererRequest = new Request(request);
        rendererRequest.headers.set(RENDERER_ASSET_HEADER, "1");
        const fromRenderer = await environment.SSR.fetch(rendererRequest);
        if (fromRenderer.ok || fromRenderer.status === 304) {
          await own.body?.cancel();
          return fromRenderer;
        }
        await fromRenderer.body?.cancel();
      } catch {
        console.warn("Renderer asset fallback failed");
      }
      return own;
    },
  };
}
