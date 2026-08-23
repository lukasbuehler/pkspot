import {describe, expect, it} from "vitest";
import {
  buildPublicImportProvenance,
  publicImportProvenanceEqual,
  spotLinksToImport,
} from "../functions/src/importProvenanceProjection";
import {
  BoundedTtlCache,
  PerKeyFixedWindowLimiter,
} from "../functions/src/importProvenanceFunctions";
import {isPublicImportProvenanceOnlyWrite} from "../functions/src/spotFunctions";
import type {SpotSchema} from "./db/schemas/SpotSchema";

describe("public import provenance", () => {
  it("copies exactly the public six-field allowlist", () => {
    expect(buildPublicImportProvenance({
      credits: {
        source_name: " Community map ",
        attribution_text: "With permission",
        website_url: "https://example.test",
        instagram_url: "https://instagram.com/example",
        license: "private-review-only",
      },
      source_url: "https://example.test/source",
      viewer_url: "https://example.test/viewer",
      user: {uid: "private"},
    })).toEqual({
      source_name: "Community map",
      attribution_text: "With permission",
      website_url: "https://example.test",
      instagram_url: "https://instagram.com/example",
      source_url: "https://example.test/source",
      viewer_url: "https://example.test/viewer",
    });
  });

  it("uses explicit null for imports without public credit", () => {
    expect(buildPublicImportProvenance({credits: {license: "private"}})).toBeNull();
    expect(publicImportProvenanceEqual(null, null)).toBe(true);
    expect(publicImportProvenanceEqual(undefined, null)).toBe(false);
  });

  it("compares projections independently of field insertion order", () => {
    const left = {
      source_name: "Community map",
      attribution_text: "Used with permission",
      source_url: "https://example.test/source",
    };
    const right = {
      source_url: "https://example.test/source",
      source_name: "Community map",
      attribution_text: "Used with permission",
    };

    expect(publicImportProvenanceEqual(left, right)).toBe(true);
    expect(publicImportProvenanceEqual(
      {...left, private_note: "remove me"} as typeof left,
      right,
    )).toBe(false);
  });

  it("prefers a Spot's import_id over its legacy source link", () => {
    expect(spotLinksToImport({import_id: "import-a", source: "import-b"}, "import-a"))
      .toBe(true);
    expect(spotLinksToImport({import_id: "import-a", source: "import-b"}, "import-b"))
      .toBe(false);
    expect(spotLinksToImport({source: "import-b"}, "import-b")).toBe(true);
  });

  it("caches null, expires entries, and stays bounded", () => {
    const cache = new BoundedTtlCache<string | null>(2, 10);
    cache.set("one", null, 0);
    cache.set("two", "two", 0);
    expect(cache.get("one", 5)).toEqual({found: true, value: null});
    cache.set("three", "three", 5);
    expect(cache.get("two", 5).found).toBe(false);
    expect(cache.get("one", 11).found).toBe(false);
  });

  it("rate-limits each key independently and resets its window", () => {
    const limiter = new PerKeyFixedWindowLimiter(2, 2, 100);
    expect(limiter.allow("a", 0)).toBe(true);
    expect(limiter.allow("a", 1)).toBe(true);
    expect(limiter.allow("a", 2)).toBe(false);
    expect(limiter.allow("b", 2)).toBe(true);
    expect(limiter.allow("a", 101)).toBe(true);
  });

  it("recognizes projection-only Spot writes", () => {
    const before = {
      name: {en: "Spot"},
      public_import_provenance: undefined,
    } as unknown as SpotSchema;
    const after = {
      ...before,
      public_import_provenance: {source_name: "Source"},
    };
    expect(isPublicImportProvenanceOnlyWrite(before, after)).toBe(true);
    expect(isPublicImportProvenanceOnlyWrite(before, {
      ...after,
      rating: 5,
    })).toBe(false);
  });
});
