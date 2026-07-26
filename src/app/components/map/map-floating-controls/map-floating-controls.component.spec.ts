import { ComponentFixture, TestBed } from "@angular/core/testing";
import { By } from "@angular/platform-browser";
import { provideNoopAnimations } from "@angular/platform-browser/animations";
import { beforeEach, describe, expect, it } from "vitest";
import { FabMenuComponent } from "../../fab-menu/fab-menu.component";
import { MapFloatingControlsComponent } from "./map-floating-controls.component";

describe("MapFloatingControlsComponent", () => {
  let fixture: ComponentFixture<MapFloatingControlsComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [MapFloatingControlsComponent],
      providers: [provideNoopAnimations()],
    });

    fixture = TestBed.createComponent(MapFloatingControlsComponent);
  });

  it("stays empty when map controls are hidden", () => {
    fixture.detectChanges();

    expect(fixture.debugElement.query(By.css(".map-mini-fabs"))).toBeNull();
    expect(fixture.debugElement.query(By.css("#mapCreateFabMenu"))).toBeNull();
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

  it("offers all configured creation actions from the FAB menu", async () => {
    const actions: string[] = [];
    fixture.componentInstance.createSpot.subscribe(() => actions.push("spot"));
    fixture.componentInstance.importSpots.subscribe(() =>
      actions.push("import"),
    );
    fixture.componentInstance.createEvent.subscribe(() =>
      actions.push("event"),
    );
    fixture.componentInstance.planSession.subscribe(() =>
      actions.push("session"),
    );
    fixture.componentRef.setInput("showControls", true);
    fixture.componentRef.setInput("showCreateSpot", true);
    fixture.componentRef.setInput("showImportSpots", true);
    fixture.componentRef.setInput("showCreateEvent", true);
    fixture.componentRef.setInput("showPlanSession", true);

    await fixture.whenStable();
    const fabMenu = fixture.debugElement.query(
      By.directive(FabMenuComponent),
    ).componentInstance as FabMenuComponent;
    expect(
      fixture.componentInstance.createActions().map((action) => action.label),
    ).toEqual(["Add Spot", "Import spots", "Create event", "Plan session"]);

    for (const action of ["spot", "import-spots", "event", "session"]) {
      fixture.componentInstance.onCreateAction(action);
    }

    expect(actions).toEqual(["spot", "import", "event", "session"]);
    expect(fabMenu.actions()).toHaveLength(4);
    expect(fabMenu.alignment()).toBe("start");
  });
});
