import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string): string => readFileSync(join(process.cwd(), path), "utf8");

describe("Spot creation idempotency UI contracts", () => {
  it("locks both save controls, renders pending feedback, and unlocks in finally", () => {
    const component = read("src/app/components/spot-details/spot-details.component.ts");
    const template = read("src/app/components/spot-details/spot-details.component.html");
    const map = read("src/app/components/spot-map/spot-map.component.ts");

    expect(component).toContain("readonly isSaving = input(false)");
    expect(component).toContain("this.isSaving() || !this.canSaveSpot()");
    expect(template.match(/\[disabled\]="!canSaveSpot\(\)"/g))
      .toHaveLength(2);
    expect(template.match(/Saving…/g)).toHaveLength(2);
    expect(map).toContain("if (this.isSavingSpot())");
    expect(map).toContain("this.isSavingSpot.set(false)");
    expect(map).toContain("} finally {");
  });

  it("keeps the editable draft on failure and preserves its token across clones", () => {
    const map = read("src/app/components/spot-map/spot-map.component.ts");
    const model = read("src/db/models/Spot.ts");
    const saveMethod = map.match(
      /async saveSpot\(spot: LocalSpot \| Spot\)[\s\S]*?private _hasEnoughDataForNewSpot/,
    )?.[0] ?? "";
    const errorHandler = [...saveMethod.matchAll(/\.catch\(\(error\) => \{[\s\S]*?\n      \}\);/g)]
      .map((match) => match[0])
      .find((handler) => handler.includes("Error saving spot"));

    expect(errorHandler).not.toContain("this.isEditing.set(false)");
    expect(model).toContain("new LocalSpot(dataCopy, this.locale, this.creationSubmissionId)");
  });

  it("shows conservative resolution and a focused duplicate review queue", () => {
    const dialog = read(
      "src/app/components/spot-duplicate-resolution-dialog/spot-duplicate-resolution-dialog.component.html",
    );
    const dashboard = read(
      "src/app/components/moderation-dashboard-page/moderation-dashboard-page.component.html",
    );

    expect(dialog).toContain('class="candidate-grid"');
    expect(dialog).toContain("candidate.uniqueFields");
    expect(dialog).toContain("preview.blockers.length > 0");
    expect(dialog).toContain('[disabled]="!canResolve()"');
    expect(dashboard).toContain("visibleDuplicateSpotGroups()");
    expect(dashboard).toContain("group.closestDistanceMeters");
    expect(dashboard).toContain("['/map/spots', spot.id]");
    expect(dashboard).toContain("Diagnostics and maintenance");
  });
});
