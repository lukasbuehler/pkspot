import {readFileSync} from "node:fs";
import {join} from "node:path";
import {describe, expect, it} from "vitest";

const source = readFileSync(
  join(process.cwd(), "functions/src/importProvenanceMaintenanceFunctions.ts"),
  "utf8",
);

describe("public import provenance maintenance", () => {
  it("is dry-run-first, resumable, bounded, and deletes only a completed trigger", () => {
    expect(source).toContain('trigger.data()?.["dry_run"] !== false');
    expect(source).toContain('previousState?.["active_event_id"] === event.id');
    expect(source).toContain('phase: BackfillPhase =');
    expect(source).toContain('.limit(pageSize)');
    expect(source).toContain('public_import_provenance: write.projection');
    expect(source.lastIndexOf('status: "DONE"')).toBeLessThan(
      source.lastIndexOf("await trigger.ref.delete()"),
    );
  });

  it("does not treat ordinary source labels as import ids", () => {
    expect(source).toContain('if (!imported.exists && phase === "source") continue;');
    expect(source).toContain('phase === "source" && typeof data["import_id"] === "string"');
  });
});
