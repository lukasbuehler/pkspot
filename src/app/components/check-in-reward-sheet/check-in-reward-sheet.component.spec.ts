import { TestBed } from "@angular/core/testing";
import { provideRouter } from "@angular/router";
import { MAT_BOTTOM_SHEET_DATA, MatBottomSheetRef } from "@angular/material/bottom-sheet";
import { describe, expect, it, vi } from "vitest";
import {
  CheckInRewardSheetComponent,
  type CheckInRewardSheetData,
} from "./check-in-reward-sheet.component";

function render(data: CheckInRewardSheetData) {
  const dismiss = vi.fn();
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: MAT_BOTTOM_SHEET_DATA, useValue: data },
      { provide: MatBottomSheetRef, useValue: { dismiss } },
    ],
  });
  const fixture = TestBed.createComponent(CheckInRewardSheetComponent);
  fixture.detectChanges();
  return { element: fixture.nativeElement as HTMLElement, dismiss };
}

const response = { checkInId: "c1", sessionRecordId: "s1", duplicate: false };

describe("CheckInRewardSheetComponent", () => {
  it("celebrates the visit number and links straight to logging this session", () => {
    const { element, dismiss } = render({
      spotId: "river",
      spotName: "Riverside",
      response: { ...response, spotVisitCount: 7, verified: true },
    });
    expect(element.textContent).toContain("Checked in at Riverside");
    expect(element.textContent).toContain("Visit 7 here");
    expect(element.querySelector("a[href*='sessionRecord=s1']")).not.toBeNull();
    element.querySelector<HTMLButtonElement>("button")!.click();
    expect(dismiss).toHaveBeenCalled();
  });

  it("marks a first visit and explains when a check-in did not count", () => {
    const { element } = render({
      spotId: "river",
      spotName: null,
      response: { ...response, spotVisitCount: 1, verified: false },
    });
    expect(element.textContent).toContain("Your first visit here");
    expect(element.textContent).toContain("won't count toward your Spot rank");
  });
});
