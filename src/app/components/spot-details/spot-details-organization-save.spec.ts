// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const componentPath = join(
  process.cwd(),
  "src/app/components/spot-details/spot-details.component.ts"
);
const editorPath = join(
  process.cwd(),
  "src/app/components/spot-editor/spot-editor.component.ts"
);

describe("SpotDetailsComponent organization relationship saving", () => {
  it("lets map surfaces hide ratings without hiding spot metadata", () => {
    const source = readFileSync(componentPath, "utf8");
    const template = readFileSync(
      join(
        process.cwd(),
        "src/app/components/spot-details/spot-details.component.html"
      ),
      "utf8"
    );

    expect(source).toContain("showRating = input<boolean>(true)");
    expect(template).toContain("showRating() && spot()?.rating");
    expect(template).toContain("showRating() &&");
    expect(template).toContain("<app-google-place-preview");
    expect(template).toContain("<app-spot-provenance");
    expect(template).toContain("managedOrganization()");
  });

  it("does not emit a normal spot save after organization-only relationship changes", () => {
    const source = readFileSync(editorPath, "utf8");
    const saveButtonClick = source.match(
      /async saveButtonClick\(\)[\s\S]*?\n  discardButtonClick/
    )?.[0];

    expect(source).toContain(
      'type OrganizationRelationshipSaveResult = "unchanged" | "changed" | "failed"'
    );
    expect(saveButtonClick).toContain(
      'if (relationshipSaveResult === "changed")'
    );
    expect(saveButtonClick).toContain("this.organizationsSaved.emit()");
    expect(saveButtonClick).toContain("return;");
    expect(saveButtonClick).toContain("this.save.emit(spot)");
    expect(
      readFileSync(componentPath.replace(/\.ts$/, ".html"), "utf8")
    ).toContain('(organizationsSaved)="isEditing.set(false)"');
  });

  it("guards the organization save before its first await", () => {
    const source = readFileSync(editorPath, "utf8");
    const saveButtonClick = source.match(
      /async saveButtonClick\(\)[\s\S]*?\n  discardButtonClick/
    )?.[0];

    expect(source).toContain("this.isSaving() || this._isSaveFlowPending()");
    expect(saveButtonClick).toMatch(
      /this\._isSaveFlowPending\.set\(true\)[\s\S]*?await[\s\S]*?finally\s*{[\s\S]*?this\._isSaveFlowPending\.set\(false\)/,
    );
  });

  it("keeps verified organization badges available outside admin-only UI", () => {
    const template = readFileSync(
      join(
        process.cwd(),
        "src/app/components/spot-details/spot-details.component.html"
      ),
      "utf8"
    );
    const badgeHeader = template.match(
      /@if \(managedOrganization\(\); as managed\)[\s\S]*?<\/span>/
    )?.[0];
    const editorTemplate = readFileSync(
      editorPath.replace(/\.ts$/, ".html"),
      "utf8"
    );

    expect(badgeHeader).toContain("stewardedOrganizations()");
    expect(badgeHeader).toContain("Verified by {{ steward.organization.name }}");
    expect(badgeHeader).not.toContain("isAdmin()");
    expect(template.indexOf("spot-verification-badge")).toBeGreaterThan(-1);
    // The admin-only panel lives in the editor, away from the public badge.
    expect(template).not.toContain("spot-org-admin-panel");
    expect(editorTemplate).toContain("spot-org-admin-panel");
  });

  it("replaces the spot from live snapshots so verified organization computeds refresh", () => {
    const source = readFileSync(componentPath, "utf8");
    const liveSubscription = source.match(
      /private _subscribeToLiveSpot\(spot: Spot\)[\s\S]*?\n  private _unsubscribeFromLiveSpot/
    )?.[0];

    expect(liveSubscription).toContain(".getSpotById$(spot.id, this.locale)");
    expect(liveSubscription).toContain("this.spot.set(incoming)");
    expect(liveSubscription).not.toContain("current.applyFromSchema");
  });
});
