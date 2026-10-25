import { signal } from "@angular/core";
import { MatDialog } from "@angular/material/dialog";
import { LocalLegendService, type LocalLegendState } from "./local-legend.service";
import { TestBed } from "@angular/core/testing";
import { MatBottomSheet } from "@angular/material/bottom-sheet";
import { MatSnackBar } from "@angular/material/snack-bar";
import { Subject } from "rxjs";
import { describe, expect, it, vi } from "vitest";
import type { SpotId } from "../../db/schemas/SpotSchema";
import type { CheckInRewardSheetData } from "../components/check-in-reward-sheet/check-in-reward-sheet.component";
import { CheckInFlowService } from "./check-in-flow.service";
import { CheckInService } from "./check-in.service";

function setup(checkIn: (spotId: SpotId) => Promise<unknown>, state: LocalLegendState = "on") {
  const decision = new Subject<boolean | undefined>();
  const dialog = vi.fn(() => ({afterClosed: () => decision}));
  const choiceForCheckIn = vi.fn().mockResolvedValue("undecided");
  const canCheckIn = vi.fn().mockReturnValue(true);
  const snackbar = vi.fn();
  const dismissed = new Subject<void>();
  const dismiss = vi.fn();
  const sheet = vi.fn((_component: unknown, _config: { data: CheckInRewardSheetData }) =>
    ({ dismiss, afterDismissed: () => dismissed }));
  TestBed.configureTestingModule({
    providers: [
      { provide: CheckInService, useValue: { checkIn, canCheckIn } },
      { provide: MatDialog, useValue: {open: dialog} },
      { provide: LocalLegendService, useValue: {state: signal(state), choiceForCheckIn} },
      { provide: MatSnackBar, useValue: { open: snackbar } },
      { provide: MatBottomSheet, useValue: { open: sheet } },
    ],
  });
  const data = () => sheet.mock.calls[0][1].data;
  return { flow: TestBed.inject(CheckInFlowService), snackbar, sheet, data, dismissed, dismiss, decision, dialog, choiceForCheckIn, canCheckIn };
}

const confirmed = { checkInId: "c", sessionRecordId: "s", duplicate: false, spotVisitCount: 3 };

describe("CheckInFlowService", () => {
  it.each([true, false])("waits for the persisted participation decision before sending (enabled=%s)", async enabled => {
    const checkIn = vi.fn().mockResolvedValue(confirmed);
    const {flow, dialog, sheet, decision} = setup(checkIn, "undecided");
    const attempt = flow.checkIn("spot" as SpotId, "Riverside");
    expect(dialog).toHaveBeenCalledOnce();
    expect(dialog.mock.calls[0]).toEqual(expect.arrayContaining([expect.objectContaining({data: {forCheckIn: true}})]));
    expect(sheet).not.toHaveBeenCalled();
    expect(checkIn).not.toHaveBeenCalled();
    await flow.checkIn("spot" as SpotId, "Riverside");
    expect(dialog).toHaveBeenCalledOnce();
    decision.next(enabled);
    await attempt;
    expect(checkIn).toHaveBeenCalledOnce();
    expect(sheet).toHaveBeenCalledOnce();
    expect(flow.pending()).toBe(false);
  });

  it("cancels the attempt when the choice dialog is dismissed", async () => {
    const checkIn = vi.fn();
    const {flow, sheet, decision, snackbar} = setup(checkIn, "undecided");
    const attempt = flow.checkIn("spot" as SpotId, null);
    decision.next(undefined);
    await attempt;
    expect(checkIn).not.toHaveBeenCalled();
    expect(sheet).not.toHaveBeenCalled();
    expect(snackbar).not.toHaveBeenCalled();
    expect(flow.pending()).toBe(false);
  });

  it("does not ask for a decision without location access", async () => {
    const checkIn = vi.fn();
    const {flow, canCheckIn, dialog} = setup(checkIn, "undecided");
    canCheckIn.mockReturnValue(false);
    await flow.checkIn("spot" as SpotId, null);
    expect(dialog).not.toHaveBeenCalled();
    expect(checkIn).not.toHaveBeenCalled();
  });

  it("waits for settings to load and does not submit when loading fails", async () => {
    const checkIn = vi.fn();
    const {flow, choiceForCheckIn, dialog} = setup(checkIn, "unavailable");
    choiceForCheckIn.mockRejectedValue(new Error("offline"));
    await flow.checkIn("spot" as SpotId, null);
    expect(choiceForCheckIn).toHaveBeenCalled();
    expect(checkIn).not.toHaveBeenCalled();
    expect(dialog).not.toHaveBeenCalled();
    expect(flow.pending()).toBe(false);
  });

  it("does not ask again after choosing Not now", async () => {
    const checkIn = vi.fn().mockResolvedValue(confirmed);
    const {flow, dialog} = setup(checkIn, "off");
    await flow.checkIn("spot" as SpotId, null);
    expect(dialog).not.toHaveBeenCalled();
    expect(checkIn).toHaveBeenCalledOnce();
  });

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
