import {
  getViewportCenter,
  getWeatherTile,
} from "./weather-map-tile";

describe("weather map tiles", () => {
  it("maps nearby points to one canonical zoom-12 tile center", () => {
    const first = getWeatherTile({ lat: 47.3769, lng: 8.5417 });
    const second = getWeatherTile({ lat: 47.3775, lng: 8.544 });

    expect(first.key).toBe(second.key);
    expect(first.zoom).toBe(12);
    expect(first.center.lat).toBeCloseTo(47.37, 1);
    expect(first.center.lng).toBeCloseTo(8.57, 1);
  });

  it("calculates a viewport center across the date line", () => {
    expect(
      getViewportCenter({
        north: 36,
        south: 34,
        west: 179,
        east: -179,
      }),
    ).toEqual({ lat: 35, lng: -180 });
  });

  it("clamps locations to the Web Mercator range", () => {
    const tile = getWeatherTile({ lat: 90, lng: 180 });
    const maxTileIndex = 2 ** tile.zoom - 1;

    expect(tile.x).toBe(0);
    expect(tile.y).toBe(0);
    expect(tile.x).toBeLessThanOrEqual(maxTileIndex);
  });
});
