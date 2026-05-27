import { ComponentFixture, TestBed } from "@angular/core/testing";
import { By } from "@angular/platform-browser";
import { beforeEach, describe, expect, it } from "vitest";
import { MapFloatingControlsComponent } from "./map-floating-controls.component";

describe("MapFloatingControlsComponent", () => {
  let fixture: ComponentFixture<MapFloatingControlsComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [MapFloatingControlsComponent],
    });

    fixture = TestBed.createComponent(MapFloatingControlsComponent);
  });

  it("stays empty when map controls are hidden", () => {
    fixture.detectChanges();

    expect(fixture.debugElement.query(By.css(".map-mini-fabs"))).toBeNull();
    expect(fixture.debugElement.query(By.css("#createSpotSpeedDial"))).toBeNull();
  });

  it("emits map control actions", () => {
    const actions: string[] = [];
    fixture.componentInstance.resetNorth.subscribe(() => actions.push("north"));
    fixture.componentInstance.toggleMapStyle.subscribe(() =>
      actions.push("style"),
    );
    fixture.componentInstance.focusGeolocation.subscribe(() =>
      actions.push("location"),
    );
    fixture.componentRef.setInput("showControls", true);
    fixture.componentRef.setInput("showResetNorth", true);

    fixture.detectChanges();
    const buttons = fixture.debugElement.queryAll(By.css("button"));
    expect(buttons.length).toBe(3);

    for (const button of buttons) {
      button.nativeElement.click();
    }

    expect(actions).toEqual(["north", "style", "location"]);
  });

  it("keeps spot creation as a separate optional action", () => {
    const actions: string[] = [];
    fixture.componentInstance.createSpot.subscribe(() => actions.push("spot"));
    fixture.componentRef.setInput("showControls", true);
    fixture.componentRef.setInput("showCreateSpot", true);

    fixture.detectChanges();
    fixture.debugElement
      .query(By.css("#createSpotSpeedDial"))
      .nativeElement.click();

    expect(actions).toEqual(["spot"]);
  });
});
