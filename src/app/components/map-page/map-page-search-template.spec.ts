import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const templatePath = join(
  process.cwd(),
  "src/app/components/map-page/map-page.component.html"
);

function activeTemplate(): string {
  return readFileSync(templatePath, "utf8").replace(
    /<!--[\s\S]*?-->/gu,
    "",
  );
}

describe("MapPageComponent search template", () => {
  it("keeps the main map page readable to simple crawlers", () => {
    const template = readFileSync(templatePath, "utf8");

    expect(template).toContain('<h1 class="visually-hidden"');
    expect(template).toContain(
      "PK Spot — find spots, communities, and events near you",
    );
    expect(template).toContain("Preparing map layout...");
  });

  it("does not hide route-resolved panel content behind the browser layout gate during SSR", () => {
    const template = readFileSync(templatePath, "utf8");

    expect(template).toContain(
      "@if (!responsiveService.isInitialized() && !isServer)",
    );
    expect(template).toContain('<ng-template #sidebarContent>');
    expect(template).toContain('<app-map-community-landing-panel');
  });

  it("should allow Google Places results in the main map search fields", () => {
    const template = readFileSync(templatePath, "utf8");
    const searchFields = template.match(
      /<app-search-field[\s\S]*?<\/app-search-field>/g
    );

    expect(searchFields?.length).toBe(2);
    for (const searchField of searchFields ?? []) {
      expect(searchField).not.toContain(`[onlySpots]="true"`);
      expect(searchField).not.toContain("(placePreviewChange)");
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

  it("passes event series metadata to map event cards", () => {
    const mapTemplate = readFileSync(templatePath, "utf8");
    const objectPanel = mapTemplate.match(
      /<app-map-object-panel[\s\S]*?<\/app-map-object-panel>/
    )?.[0];
    const objectPanelTemplate = readFileSync(
      join(
        process.cwd(),
        "src/app/components/map/map-object-panel/map-object-panel.component.html",
      ),
      "utf8",
    );
    const eventListTemplate = readFileSync(
      join(
        process.cwd(),
        "src/app/components/map/map-event-list/map-event-list.component.html",
      ),
      "utf8",
    );

    expect(objectPanel).toContain(
      '[eventSeriesById]="visibleEventSeriesById()"',
    );
    expect(objectPanelTemplate).toContain(
      '[seriesById]="eventSeriesById()"',
    );
    expect(eventListTemplate).toContain('[seriesById]="seriesById()"');
  });

  it("links map event cards to full event pages instead of map previews", () => {
    const eventListTemplate = readFileSync(
      join(
        process.cwd(),
        "src/app/components/map/map-event-list/map-event-list.component.html",
      ),
      "utf8",
    );
    const communityTemplate = readFileSync(
      join(
        process.cwd(),
        "src/app/components/community-landing-page/community-landing-page.component.html",
      ),
      "utf8",
    );

    expect(eventListTemplate).not.toContain('[selectMode]="true"');
    expect(eventListTemplate).not.toContain("(select)=");
    expect(communityTemplate).not.toContain('[selectMode]="panelMode()"');
    expect(communityTemplate).not.toContain(
      '(select)="onSelectEvent($event)"',
    );
  });

  it("enables desktop hover previews for event map markers", () => {
    const mapTemplate = readFileSync(
      join(
        process.cwd(),
        "src/app/components/google-map-2d/google-map-2d.component.html",
      ),
      "utf8",
    );
    const eventMarkerTemplate = readFileSync(
      join(
        process.cwd(),
        "src/app/components/map/event-dot-marker/event-dot-marker.component.html",
      ),
      "utf8",
    );

    expect(mapTemplate).toContain(
      '[hoverPreviewEnabled]="showSpotPreview()"',
    );
    expect(eventMarkerTemplate).toContain('(mouseenter)="showPreview()"');
    expect(eventMarkerTemplate).toContain(
      'class="event-map-marker-preview"',
    );
    expect(eventMarkerTemplate).toContain("<app-event-card");
    expect(eventMarkerTemplate).toContain('[compact]="true"');
    expect(eventMarkerTemplate).toContain('[showRsvp]="false"');
  });

  it("keeps map weather in the area panel without a floating weather chip", () => {
    const mapTemplate = activeTemplate();
    const objectPanel = mapTemplate.match(
      /<app-map-object-panel[\s\S]*?<\/app-map-object-panel>/,
    )?.[0];
    const objectPanelTemplate = readFileSync(
      join(
        process.cwd(),
        "src/app/components/map/map-object-panel/map-object-panel.component.html",
      ),
      "utf8",
    );
    expect(objectPanel).toContain('[weather]="mapWeatherResponse()"');
    expect(objectPanel).toContain('(weatherOpen)="openMapWeather()"');
    expect(objectPanelTemplate).toContain('appearance="overview"');
    expect(objectPanelTemplate).toMatch(
      /<div class="area-header[\s\S]*?<div\s+class="area-weather"[\s\S]*?@if \(weather\(\); as areaWeather\)/,
    );
    expect(mapTemplate).not.toContain("<app-map-weather-chip");
  });

  it("mounts paid promo island content in both desktop and mobile layouts", () => {
    const mapTemplate = activeTemplate();
    const islandOutlets =
      mapTemplate.match(
        /<ng-container\s+\*ngTemplateOutlet="mapIsland"><\/ng-container>/gu,
      ) ?? [];

    expect(mapTemplate).toContain(
      '<div @fadeInOut class="map-island-host">',
    );
    expect(mapTemplate).toContain(
      '<div @fadeInOut class="map-island-mobile-host">',
    );
    expect(islandOutlets).toHaveLength(2);
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
    expect(controls).toContain('(createSpot)="onCreateSpot()"');
  });
});
