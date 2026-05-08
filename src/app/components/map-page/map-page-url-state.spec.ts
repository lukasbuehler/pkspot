import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const componentPath = join(
  process.cwd(),
  "src/app/components/map-page/map-page.component.ts"
);
const templatePath = join(
  process.cwd(),
  "src/app/components/map-page/map-page.component.html"
);

describe("MapPageComponent URL-driven panel state", () => {
  it("opens event island clicks through the event URL helper", () => {
    const source = readFileSync(componentPath, "utf8");
    const method = source.match(
      /onIslandOpenEvent\([\s\S]*?\n  \}/
    )?.[0];

    expect(method).toContain("this.openEventPath(event.slug ?? event.id, event)");
    expect(method).not.toContain("this.openEventPreview(event)");
  });

  it("opens spot search selections through the spot URL helper", () => {
    const source = readFileSync(componentPath, "utf8");
    const method = source.match(
      /openSpotOrGooglePlace\([\s\S]*?\n  onSearchCommunityPreviewChange/
    )?.[0];

    expect(method).toContain("this.openSpotPath");
    expect(method).not.toContain("this.loadSpotById(value.id as SpotId, true");
  });

  it("delegates event preview URL updates back into URL-state loading", () => {
    const source = readFileSync(componentPath, "utf8");
    const method = source.match(
      /openEventPreview\([\s\S]*?\n  closeEventPreview/
    )?.[0];

    expect(method).toContain(
      "this.openEventPath(event.slug ?? event.id, event, replaceUrl)"
    );
    expect(source).toContain(
      "this.openEventPreview(cachedEvent, { updateUrl: false })"
    );
    expect(source).toContain(
      "this.openEventPreview(event, { updateUrl: false })"
    );
  });

  it("syncs browser back and forward for all map panel URL shapes", () => {
    const source = readFileSync(componentPath, "utf8");
    const locationSubscription = source.match(
      /this\._locationSubscription = this\._location\.subscribe[\s\S]*?\n      \}\);/
    )?.[0];
    const syncMethod = source.match(
      /private _syncFullMapStateFromUrl[\s\S]*?\n  \}/
    )?.[0];

    expect(locationSubscription).toContain("this._syncFullMapStateFromUrl(url)");
    expect(syncMethod).toContain("this._syncMapPanelStateFromUrl(url)");
    expect(syncMethod).toContain("this._parseMapRouteState(url)");
    expect(syncMethod).toContain("this._handleURLParamsChange(");
  });

  it("stores contextual panel back targets for community and event transitions", () => {
    const source = readFileSync(componentPath, "utf8");
    const template = readFileSync(templatePath, "utf8");

    expect(source).toContain("panelBackTarget = signal<PanelBackTarget | null>(null)");
    expect(source).toContain(
      "this.panelBackTarget.set(this._getCurrentPanelBackTarget(nextPath))"
    );
    expect(template).toContain("[backLabel]=\"panelBackTarget()?.label ?? null\"");
    expect(template).toContain("(back)=\"goBackToPreviousPanel()\"");
  });
});
