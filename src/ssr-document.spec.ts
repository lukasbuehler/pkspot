import { describe, expect, it } from "vitest";
import { prepareSsrDocument } from "./ssr-document";

describe("SSR document preparation", () => {
  it("reveals the rendered page without waiting for client startup", () => {
    const content = '<app-root><main><h1>IMAX</h1><p>Public Spot content</p></main></app-root>';
    const html = `<body><div id="app-splash-screen">\n<img src="logo.webp" alt="PK Spot">\n</div>${content}</body>`;
    expect(prepareSsrDocument(html)).toBe(`<body>${content}</body>`);
  });

  it("keeps other images, content and assets intact while deferring route hints", () => {
    const html = '<link rel="modulepreload" href="map.js"><app-root><img src="spot.webp"></app-root>';
    expect(prepareSsrDocument(html)).toBe(html.replace('rel="modulepreload"', 'rel="pkspot-modulepreload"'));
  });
});
