import {describe, expect, it} from "vitest";
import {
  countsFrom,
  cursorFrom,
  isImportDocumentId,
  pageSizeFrom,
} from "../functions/src/importProvenanceMaintenanceFunctions";

describe("public import provenance maintenance helpers", () => {
  it("normalizes page sizes into the supported range", () => {
    expect(pageSizeFrom(undefined)).toBe(100);
    expect(pageSizeFrom(0)).toBe(1);
    expect(pageSizeFrom(25)).toBe(25);
    expect(pageSizeFrom(999)).toBe(250);
    expect(pageSizeFrom(1.5)).toBe(100);
  });

  it("restores non-negative checkpoint counts", () => {
    expect(countsFrom({
      scanned: 10,
      linked: -2,
      changed: 3,
      written: "4",
      missing_imports: 1,
    })).toEqual({
      scanned: 10,
      linked: 0,
      changed: 3,
      written: 0,
      missing_imports: 1,
    });
    expect(countsFrom(null)).toEqual({
      scanned: 0,
      linked: 0,
      changed: 0,
      written: 0,
      missing_imports: 0,
    });
  });

  it("accepts only complete persisted cursors", () => {
    expect(cursorFrom({value: "import-1", document_id: "spot-1"})).toEqual({
      value: "import-1",
      document_id: "spot-1",
    });
    expect(cursorFrom({value: "import-1"})).toBeNull();
    expect(cursorFrom("import-1")).toBeNull();
  });

  it("rejects empty, path-like, and oversized import document ids", () => {
    expect(isImportDocumentId("import-1")).toBe(true);
    expect(isImportDocumentId(" ")).toBe(false);
    expect(isImportDocumentId("imports/import-1")).toBe(false);
    expect(isImportDocumentId("x".repeat(181))).toBe(false);
    expect(isImportDocumentId(null)).toBe(false);
  });
});
