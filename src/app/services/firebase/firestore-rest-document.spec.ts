import { Bytes, GeoPoint, Timestamp } from "firebase/firestore";
import { describe, expect, it, vi } from "vitest";
import { decodeFirestoreRestFields } from "./firestore-rest-document";

describe("decodeFirestoreRestFields", () => {
  it("returns the value types the web SDK returns", () => {
    const toReference = vi.fn((path: string) => `reference:${path}`);

    const decoded = decodeFirestoreRestFields(
      {
        empty: { nullValue: null },
        live: { booleanValue: true },
        name: { stringValue: "Spot" },
        count: { integerValue: "12" },
        rating: { doubleValue: 4.5 },
        created: { timestampValue: "2026-01-02T03:04:05.123456789Z" },
        location: { geoPointValue: { latitude: 47.5, longitude: 8.5 } },
        equator: { geoPointValue: { longitude: 8.5 } },
        blob: { bytesValue: "AQID" },
        owner: {
          referenceValue:
            "projects/p/databases/(default)/documents/users/abc",
        },
        tags: { arrayValue: { values: [{ stringValue: "a" }] } },
        none: { arrayValue: {} },
        address: {
          mapValue: { fields: { code: { stringValue: "CH" } } },
        },
        blank: { mapValue: {} },
      },
      toReference,
    );

    expect(decoded["empty"]).toBeNull();
    expect(decoded["live"]).toBe(true);
    expect(decoded["name"]).toBe("Spot");
    expect(decoded["count"]).toBe(12);
    expect(decoded["rating"]).toBe(4.5);
    expect(decoded["created"]).toBeInstanceOf(Timestamp);
    expect(decoded["created"]).toEqual(
      new Timestamp(Date.UTC(2026, 0, 2, 3, 4, 5) / 1000, 123456789),
    );
    expect(decoded["location"]).toEqual(new GeoPoint(47.5, 8.5));
    expect(decoded["location"]).toBeInstanceOf(GeoPoint);
    expect(decoded["equator"]).toEqual(new GeoPoint(0, 8.5));
    expect(decoded["blob"]).toBeInstanceOf(Bytes);
    expect(decoded["owner"]).toBe("reference:users/abc");
    expect(decoded["tags"]).toEqual(["a"]);
    expect(decoded["none"]).toEqual([]);
    expect(decoded["address"]).toEqual({ code: "CH" });
    expect(decoded["blank"]).toEqual({});
  });

  it("keeps whole-second timestamps at zero nanoseconds", () => {
    const decoded = decodeFirestoreRestFields(
      { created: { timestampValue: "2026-01-02T03:04:05Z" } },
      vi.fn(),
    );

    expect((decoded["created"] as Timestamp).nanoseconds).toBe(0);
  });

  it("does not create references for documents without any", () => {
    const toReference = vi.fn();

    decodeFirestoreRestFields({ name: { stringValue: "Spot" } }, toReference);

    expect(toReference).not.toHaveBeenCalled();
  });

  it("rejects value types it cannot decode faithfully", () => {
    expect(() =>
      decodeFirestoreRestFields({ odd: { vectorValue: {} } }, vi.fn()),
    ).toThrow("Unsupported Firestore REST value");
  });
});
