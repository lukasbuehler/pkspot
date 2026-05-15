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

  it("makes the event island body open the event while keeping dismiss isolated", () => {
    const template = readFileSync(
      join(
        process.cwd(),
        "src/app/components/map-island/map-island.component.html",
      ),
      "utf8",
    );

    expect(template).toContain(
      '(click)="island.kind === \'event\' ? onOpenEvent() : null"',
    );
    expect(template).toContain(
      '(click)="onOpenEvent(); $event.stopPropagation()"',
    );
    expect(template).toContain(
      '(click)="onDismissEvent(); $event.stopPropagation()"',
    );
  });

  it("does not surface another event island while an event panel is open", () => {
    const source = readFileSync(componentPath, "utf8");

    expect(source).toContain(
      "const eventPanelOpen = this.selectedEvent() || this.pendingEventPreview();",
    );
    expect(source).toContain("if (viewport && !eventPanelOpen)");
  });

  it("opens spot search selections through the spot URL helper", () => {
    const source = readFileSync(componentPath, "utf8");
    const method = source.match(
      /openSpotOrGooglePlace\([\s\S]*?\n  onSearchCommunityPreviewChange/
    )?.[0];

    expect(method).toContain("this.openSpotPath");
    expect(method).not.toContain("this.loadSpotById(value.id as SpotId, true");
  });

  it("lets the map page open spot marker clicks before the map focuses them", () => {
    const component = readFileSync(componentPath, "utf8");
    const template = readFileSync(templatePath, "utf8");
    const spotMapComponent = readFileSync(
      join(process.cwd(), "src/app/components/spot-map/spot-map.component.ts"),
      "utf8"
    );

    expect(template).toContain('(spotOpenRequested)="onSpotOpenRequested($event)"');
    expect(spotMapComponent).toContain("spotOpenRequested = new EventEmitter");
    expect(spotMapComponent).toContain("this.spotOpenRequested.emit(spot)");
    expect(component).toContain("this._openPendingSpotPanel(");
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
    expect(source).toContain("cleanUrl.match(/^\\/map\\/events?\\/([^/]+)$/u)");
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

  it("uses country viewport lookup instead of spot-density radius for country focus", () => {
    const source = readFileSync(componentPath, "utf8");
    const focusMethod = source.match(
      /private _focusCommunityOnMap[\s\S]*?\n  private _focusCommunityPreviewOnMap/
    )?.[0];

    expect(focusMethod).toContain('communityLanding.scope === "country"');
    expect(source).toContain("private async _getCountryViewportBounds");
    expect(source).toContain('includedType: "country"');
    expect(source).toContain('fields: ["id", "viewport"]');
  });
});
