// Must load before any application chunk evaluates.
import "./src/cloudflare-runtime-polyfills";
import { AngularAppEngine, createRequestHandler } from "@angular/ssr";
import { SsrRequestScope } from "./src/ssr-request-scope";

import { environment } from "./src/environments/environment.default";
import { cloudflareSsrAllowedHosts } from "./src/cloudflare-hosts";
import { prepareSsrDocument } from "./src/ssr-document";

const angularApp = new AngularAppEngine({
  allowedHosts: cloudflareSsrAllowedHosts(environment.name),
});

export const reqHandler = createRequestHandler(async (request) => {
  const scope = new SsrRequestScope();
  try {
    const response = await angularApp.handle(request, scope);
    if (!response?.body || !response.headers.get("Content-Type")?.startsWith("text/html")) return response;
    const html = prepareSsrDocument(await response.text());
    const headers = new Headers(response.headers);
    headers.delete("Content-Length");
    return new Response(html, { status: response.status, statusText: response.statusText, headers });
  } finally {
    await scope.close();
  }
});

export default reqHandler;

/**
 * Entry of the renderer Worker. The front Worker (`src/cloudflare-front-worker.ts`)
 * has already applied redirects, asset routing and the HTML cache, and calls
 * this only for pages it has to render.
 */
export async function handleRenderRequest(request: Request): Promise<Response> {
  const response = await reqHandler(request);
  if (response) return response;
  // Angular can return null after a navigation error, not only a missing route.
  // Log no URL/query data; the Worker invocation identifies the request.
  console.error("Cloudflare SSR returned no response", {
    locale: new URL(request.url).pathname.split("/")[1],
  });
  return new Response("Not Found", { status: 404 });
}
