import { TestBed } from "@angular/core/testing";
import { MatBottomSheet } from "@angular/material/bottom-sheet";
import { MatSnackBar } from "@angular/material/snack-bar";
import { Subject } from "rxjs";
import { describe, expect, it, vi } from "vitest";
import type { SpotId } from "../../db/schemas/SpotSchema";
import type { CheckInRewardSheetData } from "../components/check-in-reward-sheet/check-in-reward-sheet.component";
import { CheckInFlowService } from "./check-in-flow.service";
import { CheckInService } from "./check-in.service";

function setup(checkIn: (spotId: SpotId) => Promise<unknown>) {
  const snackbar = vi.fn();
  const dismissed = new Subject<void>();
  const dismiss = vi.fn();
  const sheet = vi.fn((_component: unknown, _config: { data: CheckInRewardSheetData }) =>
    ({ dismiss, afterDismissed: () => dismissed }));
  TestBed.configureTestingModule({
    providers: [
      { provide: CheckInService, useValue: { checkIn } },
      { provide: MatSnackBar, useValue: { open: snackbar } },
      { provide: MatBottomSheet, useValue: { open: sheet } },
    ],
  });
  const data = () => sheet.mock.calls[0][1].data;
  return { flow: TestBed.inject(CheckInFlowService), snackbar, sheet, data, dismissed, dismiss };
}

const confirmed = { checkInId: "c", sessionRecordId: "s", duplicate: false, spotVisitCount: 3 };

describe("CheckInFlowService", () => {
  it("opens the sheet on the tap and fills it in once the server confirms", async () => {
    let resolve!: (value: unknown) => void;
    const { flow, sheet, data } = setup(vi.fn(() => new Promise((done) => (resolve = done))));
    const done = flow.checkIn("spot" as SpotId, "Riverside");
    expect(sheet).toHaveBeenCalledTimes(1);
    expect(data()).toMatchObject({ spotId: "spot", spotName: "Riverside" });
    expect(data().attempt()).toEqual({ status: "pending" });
    expect(flow.pending()).toBe(true);
    resolve(confirmed);
    await done;
    expect(data().attempt()).toMatchObject({ status: "done", response: { spotVisitCount: 3 } });
    expect(flow.pending()).toBe(false);
  });

  it("shows a failure in the sheet and retries from it", async () => {
    const checkIn = vi.fn().mockRejectedValueOnce(new TypeError("Network error")).mockResolvedValue(confirmed);
    const { flow, data, snackbar } = setup(checkIn);
    await flow.checkIn("spot" as SpotId, null);
    expect(data().attempt()).toEqual({ status: "failed" });
    expect(snackbar).not.toHaveBeenCalled();
    data().retry!();
    await vi.waitFor(() => expect(data().attempt()).toMatchObject({ status: "done" }));
    expect(checkIn).toHaveBeenCalledTimes(2);
  });

  it("reports a failure with a message when the sheet was swiped away", async () => {
    let reject!: (error: unknown) => void;
    const { flow, snackbar, dismissed } = setup(vi.fn(() => new Promise((_, fail) => (reject = fail))));
    const done = flow.checkIn("spot" as SpotId, null);
    dismissed.next();
    reject(new Error("offline"));
    await done;
    expect(snackbar).toHaveBeenCalledWith("Could not check in. Please try again.", "Dismiss", { duration: 6000 });
  });

  it("prevents duplicate submissions until the first request finishes", async () => {
    let resolve!: () => void;
    const checkIn = vi.fn(() => new Promise<null>((done) => (resolve = () => done(null))));
    const { flow, sheet, dismiss } = setup(checkIn);
    const first = flow.checkIn("spot" as SpotId, null);
    await flow.checkIn("spot" as SpotId, null);
    expect(checkIn).toHaveBeenCalledTimes(1);
    expect(sheet).toHaveBeenCalledTimes(1);
    resolve();
    await first;
    // Check-ins switched off: nothing to show.
    expect(dismiss).toHaveBeenCalled();
    expect(flow.pending()).toBe(false);
  });
});
