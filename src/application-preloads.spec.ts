import { afterEach, describe, expect, it } from "vitest";
import { deferApplicationPreloads, restoreApplicationPreloads } from "./application-preloads";

describe("application preload scheduling", () => {
  afterEach(() => document.head.querySelectorAll("link").forEach(link => link.remove()));

  it("defers only generated module hints and preserves assets and HTML", () => {
    const html = '<link rel="stylesheet" href="styles.css"><link rel="modulepreload" href="map.js"><main>SSR content</main>';
    const deferred = deferApplicationPreloads(html);
    expect(deferred).toBe(html.replace('rel="modulepreload"', 'rel="pkspot-modulepreload"'));
    expect(deferApplicationPreloads(deferred)).toBe(deferred);
  });

  it("restores every route hint once the full application is requested", () => {
    document.head.insertAdjacentHTML("beforeend", deferApplicationPreloads(
      '<link rel="modulepreload" href="map.js"><link rel="modulepreload" href="firebase.js">',
    ));
    expect(document.querySelectorAll('link[rel="modulepreload"]')).toHaveLength(0);
    restoreApplicationPreloads();
    restoreApplicationPreloads();
    expect([...document.querySelectorAll<HTMLLinkElement>('link[rel="modulepreload"]')].map(link => link.getAttribute("href")))
      .toEqual(["map.js", "firebase.js"]);
  });
});
