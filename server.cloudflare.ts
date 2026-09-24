import { AngularAppEngine, createRequestHandler } from "@angular/ssr";
import { SsrRequestScope } from "./src/ssr-request-scope";
import { createCloudflareRequestHandler } from "./src/cloudflare-request-handler";

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
    return await angularApp.handle(request, scope);
  } finally {
    await scope.close();
  }
});

export default reqHandler;

export const handleWorkerRequest = createCloudflareRequestHandler(reqHandler);
