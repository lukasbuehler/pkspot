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
      expect(searchField).toContain('[contextLabel]="searchContextLabel()"');
      expect(searchField).toContain('(contextClear)="onSearchContextClear()"');
    }
  });

  it("keeps the map check-in banner wired only to map-page check-in actions", () => {
    const template = readFileSync(templatePath, "utf8");
    const banner = template.match(
      /<app-map-check-in-banner[\s\S]*?<\/app-map-check-in-banner>/
    )?.[0];

    expect(banner).toBeDefined();
    expect(banner).toContain('[spot]="proximityCheckInSpot()"');
    expect(banner).toContain('(checkIn)="spotCheckIn($event)"');
    expect(banner).toContain('(dismiss)="dismissCheckInSpot($event)"');
  });

  it("should hide the Add Spot button while a spot is selected", () => {
    const template = readFileSync(templatePath, "utf8");
    const controls = template.match(
      /<app-map-floating-controls[\s\S]*?<\/app-map-floating-controls>/
    )?.[0];

    expect(controls).toBeDefined();
    expect(controls).toContain("[showCreateSpot]");
    expect(controls).toContain("!selectedSpot()");
  });

  it("should keep the Add Spot button renderable when signed in and zoomed in", () => {
    const template = readFileSync(templatePath, "utf8");
    const controls = template.match(
      /<app-map-floating-controls[\s\S]*?<\/app-map-floating-controls>/
    )?.[0];

    expect(controls).toBeDefined();
    expect(controls).toContain("isSignedIn()");
    expect(controls).toContain("spotMap.mapZoom() >= 14");
    expect(controls).toContain('(createSpot)="spotMap.createSpot()"');
  });
});
