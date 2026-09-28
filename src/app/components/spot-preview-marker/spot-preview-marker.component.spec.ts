import {TestBed} from "@angular/core/testing";
import {SpotPreviewMarkerComponent} from "./spot-preview-marker.component";
import {SpotPreviewData} from "../../../db/schemas/SpotPreviewData";

describe("reported Spot markers", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("keeps the rating but replaces iconic styling with a neutral warning", () => {
    vi.stubGlobal("google", {maps: {CollisionBehavior: {REQUIRED: "REQUIRED"}}});
    TestBed.overrideComponent(SpotPreviewMarkerComponent, {set: {template: "", imports: []}});
    const fixture = TestBed.createComponent(SpotPreviewMarkerComponent);
    const spot: SpotPreviewData = {
      id: "reported-spot" as SpotPreviewData["id"], name: "Training walls",
      locality: "Zurich", imageSrc: "", isIconic: true, rating: 3.5, isReported: true,
    };
    fixture.componentRef.setInput("spot", spot);
    expect(fixture.componentInstance.markerColor()).toBe("gray");
    expect(fixture.componentInstance.markerIcons()).toEqual(["warning"]);
    expect(fixture.componentInstance.markerNumber()).toBe(3.5);
    fixture.componentRef.setInput("spot", {...spot, isReported: false});
    expect(fixture.componentInstance.markerIcons()).toEqual(["stars"]);
    expect(fixture.componentInstance.markerColor()).not.toBe("gray");
  });
});
