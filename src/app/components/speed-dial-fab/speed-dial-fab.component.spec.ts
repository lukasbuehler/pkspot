import { TestBed } from "@angular/core/testing";
import { provideNoopAnimations } from "@angular/platform-browser/animations";
import { describe, expect, it, vi } from "vitest";
import { SpeedDialFabComponent } from "./speed-dial-fab.component";

describe("SpeedDialFabComponent", () => {
  it("renders visible action labels and closes after selection", () => {
    TestBed.configureTestingModule({
      providers: [provideNoopAnimations()],
    });
    const fixture = TestBed.createComponent(SpeedDialFabComponent);
    fixture.componentRef.setInput("buttonConfig", {
      mainButton: {
        icon: "add",
        label: "Create",
        isExtended: true,
      },
      miniButtonColor: "primary",
      miniButtons: [
        {
          icon: "event_upcoming",
          label: "Plan session",
        },
      ],
    });
    const selected = vi.fn();
    fixture.componentInstance.miniFabClick.subscribe(selected);

    fixture.componentInstance.open();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain("Plan session");

    fixture.componentInstance.miniButtonClick(0);

    expect(selected).toHaveBeenCalledWith(0);
    expect(fixture.componentInstance.isOpen()).toBe(false);
  });
});
