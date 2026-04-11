import { describe, expect, it } from "vitest";
import { GeoPoint, Timestamp } from "firebase/firestore";
import {
  parseFirestoreGeoPoint,
  parseFirestoreTimestamp,
  transformFirestoreData,
} from "./Helpers";

describe("Helpers", () => {
  describe("transformFirestoreData", () => {
    it("should normalize REST timestamps and geopoints into mobile-friendly plain objects", () => {
      const createdAt = "2024-02-03T10:20:30.456Z";
      const createdAtMs = Date.parse(createdAt);

      const transformed = transformFirestoreData({
        created_at: { timestampValue: createdAt },
        location: {
          geoPointValue: {
            latitude: 48.1234,
            longitude: 11.5678,
          },
        },
        nested: {
          mapValue: {
            fields: {
              checkpoints: {
                arrayValue: {
                  values: [
                    {
                      geoPointValue: {
                        latitude: 47.5,
                        longitude: 8.5,
                      },
                    },
                  ],
                },
              },
            },
          },
        },
        removed_at: { nullValue: null },
      });

      expect(transformed).toEqual({
        created_at: {
          seconds: Math.floor(createdAtMs / 1000),
          nanoseconds: 456_000_000,
        },
        location: {
          latitude: 48.1234,
          longitude: 11.5678,
        },
        nested: {
          checkpoints: [{ latitude: 47.5, longitude: 8.5 }],
        },
        removed_at: null,
      });
    });
  });

  describe("parseFirestoreTimestamp", () => {
    it("should parse plain mobile timestamp objects with nanosecond precision", () => {
      const parsed = parseFirestoreTimestamp({
        seconds: 1_700_000_000,
        nanoseconds: 123_000_000,
      });

      expect(parsed?.toISOString()).toBe("2023-11-14T22:13:20.123Z");
    });

    it("should parse REST timestamp objects", () => {
      const parsed = parseFirestoreTimestamp({
        timestampValue: "2024-05-06T07:08:09.000Z",
      });

      expect(parsed?.toISOString()).toBe("2024-05-06T07:08:09.000Z");
    });

    it("should parse Timestamp instances", () => {
      const timestamp = Timestamp.fromMillis(1_700_000_456_789);

      const parsed = parseFirestoreTimestamp(timestamp);

      expect(parsed?.getTime()).toBe(1_700_000_456_789);
    });

    it("should parse stringified capacitor timestamp values", () => {
      const parsed = parseFirestoreTimestamp(
        "Timestamp(seconds=1706742000, nanoseconds=0)"
      );

      expect(parsed?.toISOString()).toBe("2024-01-31T23:00:00.000Z");
    });
  });

  describe("parseFirestoreGeoPoint", () => {
    it("should normalize plain latitude and longitude objects", () => {
      const point = parseFirestoreGeoPoint({
        latitude: 48.1234,
        longitude: 11.5678,
      });

      expect(point).toBeInstanceOf(GeoPoint);
      expect(point?.latitude).toBe(48.1234);
      expect(point?.longitude).toBe(11.5678);
    });

    it("should normalize internal firestore geopoint fields", () => {
      const point = parseFirestoreGeoPoint({
        _latitude: 48.5,
        _longitude: 11.5,
      });

      expect(point).toBeInstanceOf(GeoPoint);
      expect(point?.latitude).toBe(48.5);
      expect(point?.longitude).toBe(11.5);
    });

    it("should parse stringified capacitor geopoints and fall back to location_raw", () => {
      const parsedFromString = parseFirestoreGeoPoint(
        "GeoPoint { latitude=47.3973, longitude=8.5485 }"
      );
      const parsedFromFallback = parseFirestoreGeoPoint(undefined, {
        lat: 46.948,
        lng: 7.4474,
      });

      expect(parsedFromString).toBeInstanceOf(GeoPoint);
      expect(parsedFromString?.latitude).toBe(47.3973);
      expect(parsedFromString?.longitude).toBe(8.5485);
      expect(parsedFromFallback).toBeInstanceOf(GeoPoint);
      expect(parsedFromFallback?.latitude).toBe(46.948);
      expect(parsedFromFallback?.longitude).toBe(7.4474);
    });
  });
});
