import { deferApplicationPreloads } from "./application-preloads";

/** SSR already has content to paint; the bundled native/CSR index keeps its splash. */
export function prepareSsrDocument(html: string): string {
  return deferApplicationPreloads(html).replace(
    /<div id="app-splash-screen">\s*<img\b[^>]*>\s*<\/div>/u,
    "",
  );
}
