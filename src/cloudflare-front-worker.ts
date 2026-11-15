import {
  createCloudflareRequestHandler,
  type CloudflareWorkerEnvironment,
} from "./cloudflare-request-handler";
import type { WorkerExecutionContext } from "./cloudflare-ssr-cache";

/** Bindings of the front Worker, which owns the domain, assets and HTML cache. */
export interface CloudflareFrontEnvironment extends CloudflareWorkerEnvironment {
  /** Service binding to the renderer Worker that runs Angular SSR. */
  SSR: { fetch(request: Request): Promise<Response> };
}

/**
 * The front Worker answers redirects, static assets and cached pages without
 * loading Angular, so a cold isolate starts in milliseconds. Only cache misses
 * reach the renderer Worker, through a service binding with no public route.
 *
 * Keep this module and its imports free of Angular: everything it imports is
 * loaded on every cold start.
 */
export function createFrontWorker(buildId: string) {
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
      );
      return handle(request, environment, context);
    },
  };
}
