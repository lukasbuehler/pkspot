import { describe, expect, it } from "vitest";
import { getSpotWeatherContext } from "./spot-weather-context";

describe("getSpotWeatherContext", () => {
  it("disables weather for indoor-only spots", () => {
    expect(
      getSpotWeatherContext({ indoor: true, outdoor: false, covered: true }),
    ).toEqual({ available: false, covered: false });
  });

  it("keeps weather for spots with indoor and outdoor areas", () => {
    expect(
      getSpotWeatherContext({ indoor: true, outdoor: true, covered: false }),
    ).toEqual({ available: true, covered: false });
  });

  it("marks covered outdoor spots as covered", () => {
    expect(
      getSpotWeatherContext({ indoor: false, outdoor: true, covered: true }),
    ).toEqual({ available: true, covered: true });
  });
});
