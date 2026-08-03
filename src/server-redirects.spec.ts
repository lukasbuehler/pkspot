import { describe, expect, it } from "vitest";
import { getLegacySsrRedirectTarget } from "./server-redirects";

describe("SSR legacy redirects", () => {
  it("redirects legacy spot map URLs to canonical /map/spots URLs", () => {
    expect(getLegacySsrRedirectTarget("/map/imax")).toBe("/map/spots/imax");
    expect(getLegacySsrRedirectTarget("/de/map/imax?filter=dry")).toBe(
      "/de/map/spots/imax?filter=dry"
    );
    expect(getLegacySsrRedirectTarget("/fr/map/imax/c/challenge-1")).toBe(
      "/fr/map/spots/imax/c/challenge-1"
    );
    expect(getLegacySsrRedirectTarget("/map/imax/edits")).toBe(
      "/map/spots/imax/edits"
    );
  });

  it("does not redirect canonical or reserved map namespaces", () => {
    expect(getLegacySsrRedirectTarget("/map/spots/imax")).toBeNull();
    expect(getLegacySsrRedirectTarget("/map/communities/zurich")).toBeNull();
    expect(getLegacySsrRedirectTarget("/map")).toBeNull();
  });

  it("redirects map event URLs to canonical event URLs", () => {
    expect(getLegacySsrRedirectTarget("/map/events/swissjam25")).toBe(
      "/events/swissjam25"
    );
    expect(
      getLegacySsrRedirectTarget(
        "/de/map/events/9c8e7c60?showProgram=true&day=saturday"
      )
    ).toBe("/de/events/9c8e7c60?showProgram=true&day=saturday");
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
