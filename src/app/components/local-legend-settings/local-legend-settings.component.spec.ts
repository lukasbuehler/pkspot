import { signal } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { describe, expect, it, vi } from "vitest";
import { localDateKey, shiftMonth } from "../../../db/utils/training-summary";
import { TrainingSummaryService } from "../../services/firebase/firestore/training-summary.service";
import { LocalLegendService, type LocalLegendState } from "../../services/local-legend.service";
import { LocalLegendSettingsComponent } from "./local-legend-settings.component";

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
      { provide: TrainingSummaryService, useValue: summaries },
      { provide: LocalLegendService, useValue: { state: signal(state), enabled: signal(state === "on"), saving: signal(false), setEnabled: vi.fn() } },
    ],
  });
  const fixture = TestBed.createComponent(LocalLegendSettingsComponent);
  fixture.detectChanges();
  return { fixture, element: fixture.nativeElement as HTMLElement, summaries };
}

describe("LocalLegendSettingsComponent", () => {
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

  it("hides past ranks while Local Legend is off and says they are kept", () => {
    const { element, summaries } = render("off");
    expect(element.textContent).toContain("Your past ranks are kept privately");
    expect(summaries.listMyRanks).not.toHaveBeenCalled();
  });
});
