import { MAT_DIALOG_DATA } from "@angular/material/dialog";
import { signal } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { describe, expect, it, vi } from "vitest";
import { localDateKey, shiftMonth } from "../../../db/utils/training-summary";
import { TrainingSummaryService } from "../../services/firebase/firestore/training-summary.service";
import { LocalLegendService, type LocalLegendState } from "../../services/local-legend.service";
import { LocalLegendDataDialogComponent } from "../local-legend-data-dialog/local-legend-data-dialog.component";

const current = localDateKey(Date.now(), "Europe/Zurich").slice(0, 7);
const past = shiftMonth(current, -3);

function render(state: LocalLegendState) {
  const summaries = {
    listMyRanks: vi.fn().mockResolvedValue([
      { version: 1, month: current, final: false, computed_at_raw_ms: 0, spots: { river: { status: "ranked", verified_days: 5, rank: 1, tied_with: 0, legend: true } } },
      { version: 1, month: past, final: true, computed_at_raw_ms: 0, spots: {
        river: { status: "ranked", verified_days: 4, rank: 3, tied_with: 0, legend: false },
        steps: { status: "too_few_people", verified_days: 2 },
      } },
    ]),
    listMyMonths: vi.fn().mockResolvedValue([{ month: past, spots: { river: { name: "Riverside" } } }]),
    deleteMyRank: vi.fn().mockResolvedValue({ deleted: true }),
  };
  TestBed.configureTestingModule({
    providers: [
      {provide: MAT_DIALOG_DATA, useValue: {withdraw: false}},
      { provide: TrainingSummaryService, useValue: summaries },
      { provide: LocalLegendService, useValue: { state: signal(state), enabled: signal(state === "on"), saving: signal(false), setEnabled: vi.fn() } },
    ],
  });
  const fixture = TestBed.createComponent(LocalLegendDataDialogComponent);
  fixture.detectChanges();
  return { fixture, element: fixture.nativeElement as HTMLElement, summaries };
}

describe("LocalLegendDataDialogComponent", () => {
  it("lists finished months' ranks and removes one only after confirmation", async () => {
    const { fixture, element, summaries } = render("on");
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(element.textContent).toContain("Riverside · #3");
    });
    // The open month and unranked Spots are not part of the history.
    expect(fixture.componentInstance.entries()).toHaveLength(1);

    const entry = fixture.componentInstance.entries()[0];
    fixture.componentInstance.confirming.set(entry.key);
    fixture.detectChanges();
    expect(summaries.deleteMyRank).not.toHaveBeenCalled();
    await fixture.componentInstance.remove(entry);
    expect(summaries.deleteMyRank).toHaveBeenCalledWith({ month: past, spotId: "river" });
  });

  it("allows history deletion while participation is off", async () => {
    const {fixture, element, summaries} = render("off");
    await vi.waitFor(() => { fixture.detectChanges(); expect(element.textContent).toContain("Riverside"); });
    await fixture.componentInstance.remove(fixture.componentInstance.entries()[0]);
    expect(summaries.deleteMyRank).toHaveBeenCalledWith({month: past, spotId: "river"});
  });
});
