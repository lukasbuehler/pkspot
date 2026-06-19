import { describe, expect, it } from "vitest";
import {
  isFiniteBoundsLiteral,
  isFiniteLatLngLiteral,
  isUsableMapCenterLiteral,
  reportInvalidMapCoordinate,
} from "./map-coordinate-utils";

describe("map coordinate validation", () => {
  it("accepts finite coordinates inside normal map ranges", () => {
    expect(isFiniteLatLngLiteral({ lat: 47.3769, lng: 8.5417 })).toBe(true);
  });

  it("rejects infinite, null, and out-of-range coordinates", () => {
    expect(isFiniteLatLngLiteral({ lat: 47, lng: Infinity })).toBe(false);
    expect(isFiniteLatLngLiteral({ lat: 47, lng: null as unknown as number })).toBe(
      false,
    );
    expect(isFiniteLatLngLiteral({ lat: 91, lng: 8 })).toBe(false);
    expect(isFiniteLatLngLiteral({ lat: 47, lng: 181 })).toBe(false);
  });

  it("rejects pole camera centers that Google Maps cannot render", () => {
    expect(isUsableMapCenterLiteral({ lat: 85, lng: 8 })).toBe(true);
    expect(isUsableMapCenterLiteral({ lat: 90, lng: 8 })).toBe(false);
    expect(isUsableMapCenterLiteral({ lat: 47, lng: -3.48e87 })).toBe(false);
  });

  it("rejects invalid bounds before they are emitted or stored", () => {
    expect(
      isFiniteBoundsLiteral({
        north: 48,
        south: 47,
        east: 9,
        west: 8,
      }),
    ).toBe(true);
    expect(
      isFiniteBoundsLiteral({
        north: 48,
        south: 47,
        east: Infinity,
        west: 8,
      }),
    ).toBe(false);
    expect(
      isFiniteBoundsLiteral({
        north: 47,
        south: 48,
        east: 9,
        west: 8,
      }),
    ).toBe(false);
  });

  it("logs invalid values with a stack without throwing through", () => {
    const originalWarn = console.warn;
    const warnings: string[] = [];
    console.warn = (message?: unknown) => {
      warnings.push(String(message));
    };

    try {
      expect(() =>
        reportInvalidMapCoordinate("Invalid test center", {
          lat: 47,
          lng: Infinity,
        }),
      ).not.toThrow();
    } finally {
      console.warn = originalWarn;
    }

    expect(warnings[0]).toContain("[MapCoordinateGuard] Invalid test center");
    expect(warnings[0]).toContain('"lng":"Infinity"');
    expect(warnings[0]).toContain("Error: [MapCoordinateGuard]");
  });
});
