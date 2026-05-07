import { describe, expect, it } from "vitest";
import { getLegacySsrRedirectTarget } from "./server-redirects";

describe("SSR legacy redirects", () => {
  it("redirects legacy spot map URLs to canonical /map/spots URLs", () => {
    expect(getLegacySsrRedirectTarget("/map/imax")).toBe("/map/spots/imax");
    expect(getLegacySsrRedirectTarget("/de/map/imax?filter=dry")).toBe(
      "/de/map/spots/imax?filter=dry"
    );
    expect(getLegacySsrRedirectTarget("/de-CH/map/imax/c/challenge-1")).toBe(
      "/de-CH/map/spots/imax/c/challenge-1"
    );
    expect(getLegacySsrRedirectTarget("/map/imax/edits")).toBe(
      "/map/spots/imax/edits"
    );
  });

  it("does not redirect canonical or reserved map namespaces", () => {
    expect(getLegacySsrRedirectTarget("/map/spots/imax")).toBeNull();
    expect(getLegacySsrRedirectTarget("/map/events/swissjam25")).toBeNull();
    expect(getLegacySsrRedirectTarget("/map/communities/zurich")).toBeNull();
    expect(getLegacySsrRedirectTarget("/map")).toBeNull();
  });

  it("redirects legacy singular community URLs to plural community URLs", () => {
    expect(getLegacySsrRedirectTarget("/map/community/zurich")).toBe(
      "/map/communities/zurich"
    );
    expect(getLegacySsrRedirectTarget("/fr/map/community/paris?filter=dry")).toBe(
      "/fr/map/communities/paris?filter=dry"
    );
  });
});
