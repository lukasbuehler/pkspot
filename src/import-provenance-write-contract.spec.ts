import {readFileSync} from "node:fs";
import {join} from "node:path";
import {describe, expect, it} from "vitest";

const read = (path: string): string =>
  readFileSync(join(process.cwd(), path), "utf8");

describe("public import provenance write contracts", () => {
  it("projects new imports and resynchronizes only changed import projections", () => {
    const imports = read("functions/src/importFunctions.ts");
    const communities = read("functions/src/communityFunctions.ts");

    expect(imports).toContain("const publicImportProvenance = buildPublicImportProvenance(importData)");
    expect(imports).toContain("public_import_provenance: publicImportProvenance");
    expect(communities).toContain("publicImportProvenanceEqual(previous, next)");
    expect(communities).toContain('for (const field of ["import_id", "source"] as const)');
    expect(communities).toContain("public_import_provenance: next");
  });

  it("protects the server projection and skips redundant derived writes", () => {
    const serverEdits = read("functions/src/spotEditFunctions.ts");
    const clientEdits = read(
      "src/app/services/firebase/firestore/spot-edits.service.ts",
    );
    const normalizer = read("functions/src/spotFunctions.ts");
    const communities = read("functions/src/communityFunctions.ts");

    expect(serverEdits).toContain('"public_import_provenance"');
    expect(clientEdits).toContain('"public_import_provenance"');
    expect(normalizer).toContain("isPublicImportProvenanceOnlyWrite(beforeData, afterData)");
    expect(communities).toContain(
      "pageSnapshot.data()?.childCommunities ?? []",
    );
  });

  it("keeps the public projection out of Typesense schemas", () => {
    expect(read("typesense/typesense_spots_v2_schema.json")).not.toContain(
      "public_import_provenance",
    );
  });
});
