import { TestBed } from "@angular/core/testing";
import { MatBottomSheet } from "@angular/material/bottom-sheet";
import { MatSnackBar } from "@angular/material/snack-bar";
import { describe, expect, it, vi } from "vitest";
import type { SpotId } from "../../db/schemas/SpotSchema";
import { CheckInFlowService } from "./check-in-flow.service";
import { CheckInService } from "./check-in.service";

function setup(checkIn: (spotId: SpotId) => Promise<unknown>) {
  const snackbar = vi.fn();
  const sheet = vi.fn();
  TestBed.configureTestingModule({
    providers: [
      { provide: CheckInService, useValue: { checkIn } },
      { provide: MatSnackBar, useValue: { open: snackbar } },
      { provide: MatBottomSheet, useValue: { open: sheet } },
    ],
  });
  return { flow: TestBed.inject(CheckInFlowService), snackbar, sheet };
}

describe("CheckInFlowService", () => {
  it("shows a failure, releases pending state and permits retry", async () => {
    const checkIn = vi.fn()
      .mockRejectedValueOnce(new TypeError("Network error"))
      .mockResolvedValue({ checkInId: "c", sessionRecordId: "s", duplicate: false, spotVisitCount: 3 });
    const { flow, snackbar, sheet } = setup(checkIn);
    await flow.checkIn("spot" as SpotId, "Riverside");
    expect(snackbar).toHaveBeenCalledWith("Could not check in. Please try again.", "Dismiss", { duration: 6000 });
    expect(flow.pending()).toBe(false);
    await flow.checkIn("spot" as SpotId, "Riverside");
    expect(checkIn).toHaveBeenCalledTimes(2);
    // A confirmed check-in opens the private reward sheet with the visit number.
    expect(sheet).toHaveBeenCalledWith(expect.anything(), {
      data: expect.objectContaining({ spotId: "spot", spotName: "Riverside", response: expect.objectContaining({ spotVisitCount: 3 }) }),
    });
  });

  it("does not celebrate a duplicate check-in", async () => {
    const { flow, snackbar, sheet } = setup(vi.fn().mockResolvedValue({ checkInId: "c", sessionRecordId: "s", duplicate: true }));
    await flow.checkIn("spot" as SpotId, null);
    expect(sheet).not.toHaveBeenCalled();
    expect(snackbar).toHaveBeenCalledWith("You're already checked in here.", "Dismiss", { duration: 4000 });
  });

  it("prevents duplicate submissions until the first request finishes", async () => {
    let resolve!: () => void;
    const checkIn = vi.fn(() => new Promise<null>((done) => (resolve = () => done(null))));
    const { flow } = setup(checkIn);
    const first = flow.checkIn("spot" as SpotId, null);
    await flow.checkIn("spot" as SpotId, null);
    expect(checkIn).toHaveBeenCalledTimes(1);
    expect(flow.pending()).toBe(true);
    resolve();
    await first;
    expect(flow.pending()).toBe(false);
  });
});
