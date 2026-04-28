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
});
