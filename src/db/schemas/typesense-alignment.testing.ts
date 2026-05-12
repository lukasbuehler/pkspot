import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";

/**
 * Where a Typesense field's value comes from. Each entry in a collection
 * mapping documents the contract between a Firestore schema and the
 * Typesense JSON: either a 1:1 copy, a computed transform, or a synthetic
 * ops field with no Firestore equivalent.
 */
export type FieldOrigin =
  | { kind: "doc-id" }
  | { kind: "direct"; source: string }
  | { kind: "derived"; from: string | readonly string[]; transform: string }
  | { kind: "synthetic"; reason: string };

export type CollectionMapping = Readonly<Record<string, FieldOrigin>>;

export interface AlignmentSpec {
  /** Path to the Typesense JSON schema, relative to the repo root. */
  typesenseSchemaPath: string;
  /** Expected `name` value inside the JSON. */
  expectedCollectionName: string;
  /**
   * Flat list of valid Firestore field paths (dotted). Direct + derived
   * mapping entries must reference paths from this list — that's how we
   * guard against typos and stale field names.
   */
  firestoreFields: readonly string[];
  /** Firestore field paths that are non-optional in the TS interface. */
  requiredFirestoreFields?: readonly string[];
  /**
   * Firestore field paths we expect to be indexed in Typesense. Used to
   * catch silent drift where a new searchable Firestore field is added
   * but no one updates the Typesense schema.
   */
  expectedIndexedFirestoreFields?: readonly string[];
  /**
   * Firestore field paths that are optional in the TS interface but are
   * guaranteed present in Typesense docs by the indexer (e.g. via default
   * value, or by filtering out source docs that lack them). Exempts the
   * field from the "Typesense-required must come from Firestore-required"
   * check. Document why each entry is here in a leading comment.
   */
  indexerProvidedDefaults?: readonly string[];
  /** One entry per Typesense field. */
  mapping: CollectionMapping;
}

interface TypesenseFieldDef {
  name: string;
  type: string;
  optional: boolean;
}

function loadTypesenseSchema(relativePath: string): {
  name: string;
  fields: TypesenseFieldDef[];
} {
  // Resolve from repo root so it works regardless of where vitest cwd is.
  const abs = join(process.cwd(), relativePath);
  const json = JSON.parse(readFileSync(abs, "utf8"));
  const fields: TypesenseFieldDef[] = (json.fields ?? []).map((f: any) => ({
    name: String(f.name),
    type: String(f.type),
    optional: Boolean(f.optional),
  }));
  return { name: String(json.name), fields };
}

function sourcesOf(origin: FieldOrigin): string[] {
  if (origin.kind === "direct") return [origin.source];
  if (origin.kind === "derived")
    return Array.isArray(origin.from) ? [...origin.from] : [origin.from as string];
  return [];
}

/**
 * Register a vitest suite that asserts the given Typesense JSON schema is
 * in sync with the Firestore TS interface. Call inside a `describe` block.
 */
export function registerAlignmentTests(spec: AlignmentSpec): void {
  const { name, fields } = loadTypesenseSchema(spec.typesenseSchemaPath);
  const tsByName = new Map(fields.map((f) => [f.name, f]));

  it(`schema name matches "${spec.expectedCollectionName}"`, () => {
    expect(name).toBe(spec.expectedCollectionName);
  });

  it("every Typesense field has a mapping entry", () => {
    const missing = fields
      .filter((f) => !(f.name in spec.mapping))
      .map((f) => f.name);
    expect(missing, "Typesense fields without a mapping entry").toEqual([]);
  });

  it("every mapping entry refers to a real Typesense field", () => {
    const extra = Object.keys(spec.mapping).filter((n) => !tsByName.has(n));
    expect(extra, "Mapping entries pointing to non-existent Typesense fields").toEqual(
      []
    );
  });

  it("direct + derived mapping sources are valid Firestore field paths", () => {
    const fsSet = new Set(spec.firestoreFields);
    const problems: string[] = [];
    for (const [tsField, origin] of Object.entries(spec.mapping)) {
      for (const src of sourcesOf(origin)) {
        if (!fsSet.has(src)) {
          problems.push(`"${tsField}" references unknown Firestore path "${src}"`);
        }
      }
    }
    expect(problems).toEqual([]);
  });

  if (spec.expectedIndexedFirestoreFields?.length) {
    it("every expected-indexed Firestore field is referenced by some Typesense field", () => {
      const referenced = new Set<string>();
      for (const origin of Object.values(spec.mapping)) {
        for (const src of sourcesOf(origin)) referenced.add(src);
      }
      const missing = spec.expectedIndexedFirestoreFields!.filter(
        (f) => !referenced.has(f)
      );
      expect(missing, "Firestore fields not indexed in Typesense").toEqual([]);
    });
  }

  if (spec.requiredFirestoreFields?.length) {
    it("Typesense fields sourced from a required Firestore field are non-optional", () => {
      const requiredSet = new Set(spec.requiredFirestoreFields);
      const mismatches: string[] = [];
      for (const [tsField, origin] of Object.entries(spec.mapping)) {
        if (origin.kind !== "direct" && origin.kind !== "derived") continue;
        const srcs = sourcesOf(origin);
        // Treat as required-derived only when every source is itself required.
        const allRequired = srcs.length > 0 && srcs.every((s) => requiredSet.has(s));
        if (!allRequired) continue;
        const ts = tsByName.get(tsField);
        if (ts?.optional) {
          mismatches.push(
            `"${tsField}" sources required Firestore field(s) [${srcs.join(", ")}] but is optional`
          );
        }
      }
      expect(mismatches).toEqual([]);
    });
  }

  it("Typesense-required fields source a Firestore-required field (or indexer default)", () => {
    const requiredSet = new Set(spec.requiredFirestoreFields ?? []);
    const indexerProvidedSet = new Set(spec.indexerProvidedDefaults ?? []);
    const mismatches: string[] = [];
    for (const [tsField, origin] of Object.entries(spec.mapping)) {
      const ts = tsByName.get(tsField);
      if (!ts || ts.optional) continue;
      if (origin.kind === "doc-id" || origin.kind === "synthetic") continue;
      const srcs = sourcesOf(origin);
      if (srcs.length === 0) continue;
      const offending = srcs.filter(
        (s) => !requiredSet.has(s) && !indexerProvidedSet.has(s)
      );
      if (offending.length > 0) {
        mismatches.push(
          `"${tsField}" is required in Typesense but Firestore source(s) [${offending.join(", ")}] are optional — add to requiredFirestoreFields or indexerProvidedDefaults`
        );
      }
    }
    expect(mismatches).toEqual([]);
  });
}
