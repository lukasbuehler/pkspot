import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const templatePath = join(
  process.cwd(),
  "src/app/components/map-page/map-page.component.html"
);

describe("MapPageComponent search template", () => {
  it("should allow Google Places results in the main map search fields", () => {
    const template = readFileSync(templatePath, "utf8");
    const searchFields = template.match(
      /<app-search-field[\s\S]*?<\/app-search-field>/g
    );

    expect(searchFields?.length).toBe(2);
    for (const searchField of searchFields ?? []) {
      expect(searchField).not.toContain(`[onlySpots]="true"`);
      expect(searchField).toContain("(placePreviewChange)");
    }
  });

  it("should hide the Add Spot button while a spot is selected", () => {
    const template = readFileSync(templatePath, "utf8");
    const buttonIndex = template.indexOf('id="createSpotSpeedDial"');
    const addSpotConditionContext = template.slice(
      Math.max(0, buttonIndex - 800),
      buttonIndex
    );

    expect(buttonIndex).toBeGreaterThan(-1);
    expect(addSpotConditionContext).toContain("!selectedSpot()");
  });

  it("should keep the Add Spot button renderable when signed in and zoomed in", () => {
    const template = readFileSync(templatePath, "utf8");
    const addSpotBlock = template.match(
      /@if\s*\([\s\S]*?isSignedIn\(\)[\s\S]*?spotMap\.mapZoom\(\) >= 14[\s\S]*?\)\s*\{[\s\S]*?<button[\s\S]*?id="createSpotSpeedDial"[\s\S]*?<\/button>/
    )?.[0];

    expect(addSpotBlock).toBeDefined();
    expect(addSpotBlock).toContain("mat-fab");
    expect(addSpotBlock).toContain("(click)=");
    expect(addSpotBlock).toContain("spotMap.createSpot()");
    expect(addSpotBlock).toContain("Add Spot");
  });
});
