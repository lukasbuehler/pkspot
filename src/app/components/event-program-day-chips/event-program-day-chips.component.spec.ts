import { ComponentFixture, TestBed } from "@angular/core/testing";
import { provideNoopAnimations } from "@angular/platform-browser/animations";
import { EventProgramDayChipsComponent } from "./event-program-day-chips.component";

describe("EventProgramDayChipsComponent", () => {
  let fixture: ComponentFixture<EventProgramDayChipsComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideNoopAnimations()],
    });
    fixture = TestBed.createComponent(EventProgramDayChipsComponent);
    fixture.componentRef.setInput("days", ["2026-08-05", "2026-08-06"]);
  });

  it("keeps all days distinct from a deselected program layer", async () => {
    const changes: Array<string | null> = [];
    fixture.componentInstance.dayChange.subscribe((day) => changes.push(day));

    fixture.componentRef.setInput("selectedDay", "");
    await fixture.whenStable();
    expect(fixture.componentInstance.selectedFilter()).toBe("all");

    fixture.componentInstance.selectDay("");
    expect(changes).toEqual([null]);

    fixture.componentRef.setInput("selectedDay", null);
    await fixture.whenStable();
    expect(fixture.componentInstance.selectedFilter()).toBe("");

    fixture.componentInstance.selectDay("all");
    expect(changes).toEqual([null, ""]);
  });
});
