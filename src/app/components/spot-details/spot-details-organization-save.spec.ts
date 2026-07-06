import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const componentPath = join(
  process.cwd(),
  "src/app/components/spot-details/spot-details.component.ts"
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
    const source = readFileSync(componentPath, "utf8");
    const saveButtonClick = source.match(
      /async saveButtonClick\(\)[\s\S]*?\n  private async _ensureOrganizationsLoadedForAdmin/
    )?.[0];

    expect(source).toContain(
      'type OrganizationRelationshipSaveResult = "unchanged" | "changed" | "failed"'
    );
    expect(saveButtonClick).toContain(
      'if (relationshipSaveResult === "changed")'
    );
    expect(saveButtonClick).toContain("this.isEditing.set(false)");
    expect(saveButtonClick).toContain("return;");
    expect(saveButtonClick).toContain("this.saveClick.emit(spot)");
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
    const adminPanelStart = template.indexOf("spot-org-admin-panel");
    const badgeStart = template.indexOf("spot-verification-badge");

    expect(badgeHeader).toContain("stewardedOrganizations()");
    expect(badgeHeader).toContain("Verified by {{ steward.organization.name }}");
    expect(badgeHeader).not.toContain("isAdmin()");
    expect(badgeStart).toBeGreaterThan(-1);
    expect(adminPanelStart).toBeGreaterThan(badgeStart);
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
