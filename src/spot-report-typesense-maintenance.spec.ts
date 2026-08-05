import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  join(
    process.cwd(),
    "functions/src/safetyDataMaintenanceFunctions.ts",
  ),
  "utf8",
);

describe("reported Spot Typesense maintenance", () => {
  it("resyncs only reported Spots and records completion before deleting the trigger", () => {
    const resyncFunction = source.match(
      /export const resyncReportedSpotsToTypesenseOnCreate[\s\S]*?\n\);/,
    )?.[0];

    expect(resyncFunction).toContain('.where("is_reported", "==", true)');
    expect(resyncFunction).toContain("const forceSyncValue = Date.now()");
    expect(resyncFunction).toContain("{_force_sync: forceSyncValue}");
    expect(resyncFunction).toContain("reported_spots_resynced");
    expect(resyncFunction?.indexOf("SPOT_TYPESENSE_REPORT_RESYNC_STATE")).toBeLessThan(
      resyncFunction?.indexOf("event.data?.ref.delete()") ?? -1,
    );
  });
});
