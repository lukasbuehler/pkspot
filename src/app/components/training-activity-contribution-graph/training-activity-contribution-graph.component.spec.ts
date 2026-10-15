import { LOCALE_ID } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { describe, expect, it } from "vitest";
import { dateKey } from "../../features/training-log-activity";
import { TrainingActivityContributionGraphComponent } from "./training-activity-contribution-graph.component";

describe("TrainingActivityContributionGraphComponent", () => {
  function render(inputs: Record<string, unknown>): HTMLElement {
    TestBed.configureTestingModule({ providers: [{ provide: LOCALE_ID, useValue: "de" }] });
    const fixture = TestBed.createComponent(TrainingActivityContributionGraphComponent);
    for (const [name, value] of Object.entries(inputs)) fixture.componentRef.setInput(name, value);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it("renders a single week as one row of seven days including today", () => {
    const today = dateKey(Date.now());
    const element = render({
      days: [{ key: today, entryIds: [], sessionCount: 1, durationMinutes: 0, spotCount: 1 }],
      weeks: 1,
      showHeader: false,
    });

    expect(element.querySelectorAll(".week-strip__day")).toHaveLength(7);
    expect(element.querySelectorAll(".week")).toHaveLength(0);
    expect(element.querySelector("header")).toBeNull();
    const todayCell = element.querySelector(".week-strip .cell.is-today");
    expect(todayCell?.classList).toContain("day-active");
  });

  it("keeps the full scrollable history by default", () => {
    const element = render({ days: [] });

    expect(element.querySelector(".week-strip")).toBeNull();
    expect(element.querySelectorAll(".week").length).toBeGreaterThanOrEqual(27);
    expect(element.querySelector("header")).not.toBeNull();
  });
});
