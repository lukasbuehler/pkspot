import { TestBed } from "@angular/core/testing";
import { provideRouter } from "@angular/router";
import { BehaviorSubject } from "rxjs";
import { describe, expect, it, vi } from "vitest";
import { AuthenticationService } from "../../services/firebase/authentication.service";
import { TrainingSummaryService } from "../../services/firebase/firestore/training-summary.service";
import { SpotPersonalStatsComponent } from "./spot-personal-stats.component";

function render(uid: string | null, spot: unknown, rank: unknown = null) {
  const summaries = {
    getMySpot: vi.fn().mockResolvedValue(spot),
    getMySpotRanks: vi.fn().mockResolvedValue({ month: "2026-10", ranks: rank ? [rank] : [] }),
  };
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: AuthenticationService, useValue: { authState$: new BehaviorSubject(uid ? { uid } : null), user: { uid } } },
      { provide: TrainingSummaryService, useValue: summaries },
    ],
  });
  const fixture = TestBed.createComponent(SpotPersonalStatsComponent);
  fixture.componentRef.setInput("spotId", "river");
  fixture.detectChanges();
  return { fixture, summaries };
}

const spot = {
  version: 1, spot_id: "river", visits: 7, verified_days: 6, minutes: 540,
  first_ms: Date.parse("2026-03-04T10:00:00Z"), last_ms: Date.now(), months: {}, updated_at_raw_ms: 0,
};

describe("SpotPersonalStatsComponent", () => {
  it("shows the signed-in person's own visits and private rank", async () => {
    const { fixture, summaries } = render("me", spot, { spotId: "river", month: "2026-10", verifiedDays: 4, rank: 2, legend: false });
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector(".spot-personal-stats")).not.toBeNull();
    });
    const text = fixture.nativeElement.textContent as string;
    expect(summaries.getMySpotRanks).toHaveBeenCalledWith({ spotIds: ["river"] });
    expect(text).toContain("7");
    expect(text).toContain("9h");
    expect(text).toContain("#2 at this Spot");
    expect(fixture.nativeElement.querySelector("app-spot-rank-icon mat-icon")?.textContent).toContain("military_tech");
    expect(text).toContain("Only you");
  });

  it("stays hidden when signed out or without visits", async () => {
    const signedOut = render(null, spot);
    await signedOut.fixture.whenStable();
    expect(signedOut.summaries.getMySpot).not.toHaveBeenCalled();
    expect(signedOut.fixture.nativeElement.querySelector(".spot-personal-stats")).toBeNull();

    TestBed.resetTestingModule();
    const noVisits = render("me", null);
    await noVisits.fixture.whenStable();
    noVisits.fixture.detectChanges();
    expect(noVisits.fixture.nativeElement.querySelector(".spot-personal-stats")).toBeNull();
  });
});
