import { TestBed } from "@angular/core/testing";
import { provideRouter } from "@angular/router";
import { MAT_BOTTOM_SHEET_DATA, MatBottomSheetRef } from "@angular/material/bottom-sheet";
import { BehaviorSubject } from "rxjs";
import { describe, expect, it, vi } from "vitest";
import { TrainingSummaryService } from "../../services/firebase/firestore/training-summary.service";
import { signal } from "@angular/core";
import { MatDialog } from "@angular/material/dialog";
import { LocalLegendService, type LocalLegendState } from "../../services/local-legend.service";
import type { ConfirmCheckInResponse } from "../../../db/schemas/CheckInActivitySchema";
import {
  CheckInRewardSheetComponent,
  type CheckInAttempt,
  type CheckInRewardSheetData,
} from "./check-in-reward-sheet.component";

type RenderData = Omit<CheckInRewardSheetData, "attempt"> & { response?: ConfirmCheckInResponse; attempt?: CheckInRewardSheetData["attempt"] };

function render(input: RenderData, month: unknown = null, legend: LocalLegendState = "on") {
  const { response: confirmed, ...rest } = input;
  const data: CheckInRewardSheetData = {
    ...rest,
    attempt: input.attempt ?? signal<CheckInAttempt>({ status: "done", response: confirmed!, confirmedAt: Date.now() }),
  };
  const dismiss = vi.fn();
  const summary = new BehaviorSubject<unknown>(month);
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: MAT_BOTTOM_SHEET_DATA, useValue: data },
      { provide: MatBottomSheetRef, useValue: { dismiss } },
      {
        provide: TrainingSummaryService,
        useValue: { watchMyMonth: () => summary, getMyRanks: vi.fn().mockResolvedValue(null) },
      },
      { provide: LocalLegendService, useValue: { state: signal(legend), enabled: signal(legend === "on") } },
      { provide: MatDialog, useValue: { open: vi.fn() } },
    ],
  });
  const fixture = TestBed.createComponent(CheckInRewardSheetComponent);
  fixture.detectChanges();
  return { fixture, element: fixture.nativeElement as HTMLElement, dismiss, summary };
}

const response = { checkInId: "c1", sessionRecordId: "s1", duplicate: false };

describe("CheckInRewardSheetComponent", () => {
  it("celebrates the visit and shows rank progress once the server counted it", async () => {
    const { fixture, element, dismiss, summary } = render({
      spotId: "river",
      spotName: "Riverside",
      response: { ...response, spotVisitCount: 7, verified: true },
    }, { updated_at_raw_ms: 0, spots: { river: { verified_days: 1 } } });
    expect(element.textContent).toContain("Checked in at Riverside");
    expect(element.textContent).toContain("Visit 7 here");
    // A summary from before this check-in is not shown as progress.
    expect(element.textContent).not.toContain("to get ranked");
    expect(element.querySelector("a[href*='sessionRecord']")).toBeNull();

    summary.next({ updated_at_raw_ms: Date.now(), spots: { river: { verified_days: 2 } } });
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(element.textContent).toContain("ranked after tonight's update");
    });
    expect(element.textContent).toContain("2 days this month");
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

  it("shows private verified days without a second participation invitation", async () => {
    const { fixture, element } = render({
      spotId: "river", spotName: "Riverside", response: { ...response, spotVisitCount: 3, verified: true },
    }, { updated_at_raw_ms: Date.now(), spots: { river: { verified_days: 2 } } }, "undecided");
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(element.textContent).toContain("2 days this month");
    });
    expect(element.textContent).not.toContain("ranked after tonight's update");
    expect(element.textContent).not.toContain("Learn more");
  });

  it("opens before confirmation, then shows a failure with a retry", () => {
    const attempt = signal<CheckInAttempt>({ status: "pending" });
    const retry = vi.fn();
    const { fixture, element } = render({ spotId: "river", spotName: "Riverside", attempt, retry });
    expect(element.textContent).toContain("Checking in at Riverside");
    expect(element.textContent).not.toContain("Checked in");
    expect(element.querySelector("mat-progress-bar")).not.toBeNull();

    attempt.set({ status: "failed" });
    fixture.detectChanges();
    expect(element.textContent).toContain("Couldn't check in");
    [...element.querySelectorAll("button")].find((button) => button.textContent?.includes("Try again"))!.click();
    expect(retry).toHaveBeenCalled();

    attempt.set({ status: "done", response: { ...response, duplicate: true }, confirmedAt: Date.now() });
    fixture.detectChanges();
    expect(element.textContent).toContain("You're already checked in here.");
    expect(element.textContent).not.toContain("Saved privately");
  });
});
