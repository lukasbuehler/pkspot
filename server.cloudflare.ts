import { AngularAppEngine, createRequestHandler } from "@angular/ssr";

const angularApp = new AngularAppEngine({
  allowedHosts: [
    "edge-test.pkspot.app",
    "*.workers.dev",
    "localhost",
    "127.0.0.1",
    "[::1]",
  ],
});

export const reqHandler = createRequestHandler((request) =>
  angularApp.handle(request)
);

export default reqHandler;
