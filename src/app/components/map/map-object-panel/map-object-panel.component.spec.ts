import { TestBed } from "@angular/core/testing";
import { describe, expect, it } from "vitest";
import { MapObjectPanelComponent } from "./map-object-panel.component";
import { SpotPreviewData } from "../../../../db/schemas/SpotPreviewData";

describe("MapObjectPanelComponent", () => {
  function createPanel() {
    TestBed.configureTestingModule({ imports: [MapObjectPanelComponent] });
    const fixture = TestBed.createComponent(MapObjectPanelComponent);
    fixture.componentRef.setInput("mode", "all");
    fixture.componentRef.setInput("objectTypes", []);
    fixture.componentRef.setInput("highlightedSpots", [
      { id: "spot-a", name: "Spot A" } as SpotPreviewData,
    ]);
    return fixture;
  }

  it("holds the Spot cards until the area's Events are known", () => {
    const fixture = createPanel();
    fixture.componentRef.setInput("areaKnown", false);

    expect(fixture.componentInstance.allModeHighlightedSpots()).toEqual([]);

    fixture.componentRef.setInput("areaKnown", true);

    expect(
      fixture.componentInstance.allModeHighlightedSpots().map((spot) => spot.id),
    ).toEqual(["spot-a"]);
  });
});
