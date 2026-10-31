import { AngularAppEngine, createRequestHandler } from "@angular/ssr";
import { SsrRequestScope } from "./src/ssr-request-scope";
import { createCloudflareRequestHandler } from "./src/cloudflare-request-handler";

import { prepareSsrDocument } from "./src/ssr-document";

const angularApp = new AngularAppEngine({
  allowedHosts: [
    "test.pkspot.app",
    "*.test.pkspot.app",
    "*.workers.dev",
    "localhost",
    "127.0.0.1",
    "[::1]",
  ],
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

export const handleWorkerRequest = createCloudflareRequestHandler(reqHandler);
