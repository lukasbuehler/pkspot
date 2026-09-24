import { TestBed } from "@angular/core/testing";
import { MarkerComponent } from "./marker.component";

describe("MarkerComponent", () => {
  it("uses exactly the configured gray color class for a destination pin", async () => {
    const fixture = TestBed.createComponent(MarkerComponent);

    fixture.componentRef.setInput("color", "gray");
    fixture.componentRef.setInput("icons", ["water_full"]);
    await fixture.whenStable();

    const marker = fixture.nativeElement.querySelector(".pin-marker");
    expect(marker.classList.contains("pin-gray")).toBe(true);
    expect(marker.classList.contains("pin-primary")).toBe(false);
  });

  it("keeps primary as the default marker color", async () => {
    const fixture = TestBed.createComponent(MarkerComponent);

    await fixture.whenStable();

    const marker = fixture.nativeElement.querySelector(".pin-marker");
    expect(marker.classList.contains("pin-primary")).toBe(true);
  });

  it("renders an amenity without the destination pill or pointer", async () => {
    const fixture = TestBed.createComponent(MarkerComponent);

    fixture.componentRef.setInput("variant", "amenity");
    fixture.componentRef.setInput("color", "gray");
    fixture.componentRef.setInput("icons", ["water_full"]);
    await fixture.whenStable();

    expect(fixture.nativeElement.querySelector(".amenity-marker")).not.toBeNull();
    expect(fixture.nativeElement.querySelector(".pin-marker")).toBeNull();
    expect(fixture.nativeElement.querySelector("svg")).toBeNull();
  });

  it("renders no visual marker for an amenity without an icon or image", async () => {
    const fixture = TestBed.createComponent(MarkerComponent);

    fixture.componentRef.setInput("variant", "amenity");
    await fixture.whenStable();

    expect(fixture.nativeElement.querySelector(".amenity-marker")).toBeNull();
    expect(fixture.nativeElement.querySelector(".pin-marker")).toBeNull();
  });
});
