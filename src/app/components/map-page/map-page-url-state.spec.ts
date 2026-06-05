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

    expect(method).toContain("this.openEventPath(event.slug ?? event.id, null)");
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

  it("tracks map island actions as separate PostHog event names", () => {
    const source = readFileSync(componentPath, "utf8");
    const analyticsMethod = source.match(
      /private _getMapIslandAnalyticsEventName[\s\S]*?\n  \}/
    )?.[0];

    expect(analyticsMethod).toContain("open_event_from_island");
    expect(analyticsMethod).toContain("dismiss_event_island");
    expect(analyticsMethod).toContain("open_community_from_island");
    expect(analyticsMethod).toContain("dismiss_community_island");
    expect(analyticsMethod).toContain("dismiss_filter_island");
    expect(source).not.toContain(
      'this._analytics.trackEvent("map_island_interaction"',
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

  it("opens Google Place search selections on the map", () => {
    const source = readFileSync(componentPath, "utf8");
    const method = source.match(
      /openSpotOrGooglePlace\([\s\S]*?\n  onSearchCommunityPreviewChange/
    )?.[0];

    expect(method).toContain('if (value.type === "place")');
    expect(method).toContain("this.openGooglePlaceById(value.id)");
  });

  it("opens community search selections through the community URL helper", () => {
    const source = readFileSync(componentPath, "utf8");
    const method = source.match(
      /openSpotOrGooglePlace\([\s\S]*?\n  onSearchCommunityPreviewChange/
    )?.[0];

    expect(method).toContain("this.onIslandOpenCommunity(communityPreview)");
    expect(method).toContain("this.openCommunityPath(");
    expect(method).toContain(
      "`/map/communities/${encodeURIComponent(value.id)}`"
    );
    expect(method).not.toContain("this.selectedCommunityLanding.set(community)");
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
      "this.openEventPath(event.slug ?? event.id, event, replaceUrl, {"
    );
    expect(method).toContain("refresh: true");
    expect(source).toContain("previewEvent: event ?? null");
    expect(source).toContain(
      "this.openEventPreview(previewEvent, { updateUrl: false })"
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

  it("pushes history entries for routed map panel opens", () => {
    const source = readFileSync(componentPath, "utf8");
    const communityOpenMethod = source.match(
      /private _openCommunityPanel\([\s\S]*?\n  \}/
    )?.[0];
    const openCommunityPathMethod = source.match(
      /openCommunityPath\([\s\S]*?\n  exploreCommunitySpots/
    )?.[0];
    const openSpotPathMethod = source.match(
      /openSpotPath\([\s\S]*?\n  openEventPath/
    )?.[0];
    const openEventPathMethod = source.match(
      /openEventPath\([\s\S]*?\n  private _prepareCommunityPanelOpen/
    )?.[0];

    expect(communityOpenMethod).toContain(
      "this._location.go(community.canonicalPath)"
    );
    expect(communityOpenMethod).not.toContain(
      "replaceState(community.canonicalPath)"
    );
    expect(openCommunityPathMethod).toContain("this._location.go(nextPath)");
    expect(openSpotPathMethod).toContain("this._location.go(nextPath)");
    expect(openEventPathMethod).toContain("this._location.go(nextPath)");
  });

  it("lets browser history handle back on routed spot, event, and community panels", () => {
    const source = readFileSync(componentPath, "utf8");
    const backHandler = source.match(
      /handleBackPress = \(\) =>[\s\S]*?\n  \};/
    )?.[0];
    const routeHelper = source.match(
      /private _hasRoutedMapPanelOpen\([\s\S]*?\n  \}/
    )?.[0];

    expect(backHandler).toContain("if (this._hasRoutedMapPanelOpen())");
    expect(backHandler).toContain("return false");
    expect(
      backHandler?.indexOf("if (this._hasRoutedMapPanelOpen())")
    ).toBeLessThan(
      backHandler?.indexOf("this.bottomSheet && this.bottomSheet.isOpen()") ??
        -1
    );
    expect(routeHelper).toContain(
      "/^\\/map\\/(?:spots|events|communities)\\/[^/]+/u"
    );
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

  it("stores map object type separately from spot filter chips", () => {
    const source = readFileSync(componentPath, "utf8");
    const updateMethod = source.match(/\n  updateMapURL\([\s\S]*?\n  \}/)?.[0];
    const querySyncMethod = source.match(
      /private _syncMapQueryStateFromParams[\s\S]*?\n  \}/
    )?.[0];

    expect(updateMethod).toContain('existingParams.set("filter", activeFilter)');
    expect(updateMethod).toContain('existingParams.set("type", mapObjectMode)');
    expect(updateMethod).toContain('existingParams.delete("type")');
    expect(querySyncMethod).toContain('params.get("filter")');
    expect(querySyncMethod).toContain('params.get("type")');
    expect(source).toContain('mode !== "all" && mode !== "spots"');
    expect(source).toContain("_clearSpotFilterState");
  });

  it("keeps event filters separate from spot filters in URL state", () => {
    const source = readFileSync(componentPath, "utf8");
    const template = readFileSync(templatePath, "utf8");
    const updateMethod = source.match(/\n  updateMapURL\([\s\S]*?\n  \}/)?.[0];
    const querySyncMethod = source.match(
      /private _syncMapQueryStateFromParams[\s\S]*?\n  \}/
    )?.[0];

    expect(source).toContain(
      'type MapEventFilter = "live" | "competition" | "jam" | "camp"'
    );
    expect(template).toContain("showEventFilterChips()");
    expect(template).toContain("<app-filter-chips-bar");
    expect(template).toContain("eventFilterOptions");
    expect(template).toContain('[showFiltersChip]="false"');
    expect(updateMethod).toContain(
      'existingParams.set("eventFilter", activeEventFilter)'
    );
    expect(querySyncMethod).toContain('params.get("eventFilter")');
    expect(querySyncMethod).toContain('filterParam\n        ? "spots"');
    expect(querySyncMethod).toContain('eventFilterParam\n          ? "events"');
    expect(source).toContain('this.mapObjectMode.set("events")');
  });

  it("promotes spot filters from all mode into the spots tab", () => {
    const source = readFileSync(componentPath, "utf8");
    const filterMethod = source.match(
      /filterChipChanged\([\s\S]*?\n  eventFilterChanged/
    )?.[0];

    expect(filterMethod).toContain('this.mapObjectMode() === "all"');
    expect(filterMethod).toContain('this.mapObjectMode.set("spots")');
  });

  it("keeps all-panel community and about links crawlable", () => {
    const objectPanel = readFileSync(
      join(
        process.cwd(),
        "src/app/components/map/map-object-panel/map-object-panel.component.html",
      ),
      "utf8"
    );
    const objectPanelSource = readFileSync(
      join(
        process.cwd(),
        "src/app/components/map/map-object-panel/map-object-panel.component.ts",
      ),
      "utf8"
    );
    const communityList = readFileSync(
      join(
        process.cwd(),
        "src/app/components/map/map-community-list/map-community-list.component.html",
      ),
      "utf8"
    );

    expect(objectPanelSource).toContain("this.popularCommunities()");
    expect(objectPanel).toContain('routerLink="/about"');
    expect(objectPanel).not.toContain("seo-community-list");
    expect(communityList).toContain("<a");
    expect(communityList).toContain('[attr.href]="community.canonicalPath"');
  });
});
