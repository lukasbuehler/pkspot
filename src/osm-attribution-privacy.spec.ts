import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

describe("OSM attribution and privacy disclosure", () => {
  it("shows a linked map credit only while the amenity layer is displayable", () => {
    const spotMapTemplate = source(
      "src/app/components/spot-map/spot-map.component.html",
    );
    const mapTemplate = source(
      "src/app/components/google-map-2d/google-map-2d.component.html",
    );
    const mapStyles = source(
      "src/app/components/google-map-2d/google-map-2d.component.scss",
    );
    const mapPageStyles = source(
      "src/app/components/map-page/map-page.component.scss",
    );

    expect(spotMapTemplate).toContain(
      '[showOsmAttribution]="showAmenities() && mapZoom() >= 16"',
    );
    expect(mapTemplate).toContain("© OpenStreetMap contributors");
    expect(mapTemplate).toContain(
      'href="https://www.openstreetmap.org/copyright"',
    );
    expect(mapStyles).toMatch(
      /\.osm-attribution\s*\{[\s\S]*bottom:\s*calc\(var\(--map-bottom-obstruction, 0px\) \+ 14px\)[\s\S]*right:\s*var\(--safe-area-inset-right/u,
    );
    expect(mapStyles).toContain("bottom: var(--map-bottom-obstruction, 0px) !important;");
    expect(mapPageStyles).toMatch(
      /:host\.map-with-bottom-sheet\s*\{[\s\S]*--map-bottom-obstruction:\s*var\(--map-sheet-closed-height, 0px\)/u,
    );
    expect(mapPageStyles).toMatch(
      /\.map-bottom-sheet\s*\{[\s\S]*bottom:\s*0;/u,
    );
  });

  it("discloses the server-side cache without claiming client anonymity from Firebase", () => {
    const privacyPolicy = source(
      "src/app/components/privacy-policy/privacy-policy.component.html",
    );

    expect(privacyPolicy).toContain("Last Updated: 28 August 2026");
    expect(privacyPolicy).toContain("OpenStreetMap amenity markers");
    expect(privacyPolicy).toMatch(
      /your device sends\s+the requested coarse map tile to our Firebase backend/u,
    );
    expect(privacyPolicy).toContain(
      "We do not forward your IP address, browser",
    );
    expect(privacyPolicy).toMatch(
      /Cached records contain public OpenStreetMap content/u,
    );
  });
});

function source(path: string): string {
  return readFileSync(resolve(repoRoot, path), "utf8");
}
