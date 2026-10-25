import { TestBed } from "@angular/core/testing";
import { provideRouter } from "@angular/router";
import { BehaviorSubject } from "rxjs";
import { describe, expect, it, vi } from "vitest";
import { AuthenticationService } from "../../services/firebase/authentication.service";
import { TrainingSummaryService } from "../../services/firebase/firestore/training-summary.service";
import { SpotPersonalStatsComponent } from "./spot-personal-stats.component";
import { signal } from "@angular/core";
import { LocalLegendService, type LocalLegendState } from "../../services/local-legend.service";

function render(uid: string | null, spot: unknown, rank: unknown = null, verifiedDays = 0, legend: LocalLegendState = "on") {
  const summaries = {
    getMySpot: vi.fn().mockResolvedValue(spot),
    getMyMonth: vi.fn().mockResolvedValue({ spots: { river: { verified_days: verifiedDays, local_legend_days: legend === "on" ? verifiedDays : 0 } } }),
    getMyRanks: vi.fn().mockResolvedValue(rank ? { month: "2026-10", final: false, spots: { river: rank } } : null),
  };
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: AuthenticationService, useValue: { authState$: new BehaviorSubject(uid ? { uid } : null), user: { uid } } },
      { provide: TrainingSummaryService, useValue: summaries },
      { provide: LocalLegendService, useValue: { state: signal(legend), enabled: signal(legend === "on") } },
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
    const { fixture } = render("me", spot, { status: "ranked", verified_days: 4, rank: 2, tied_with: 1, legend: false }, 4);
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector(".spot-personal-stats")).not.toBeNull();
    });
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain("7");
    expect(text).toContain("9h");
    expect(text).toContain("#2 at this Spot");
    expect(text).toContain("Tied with 1 other person");
    expect(text).toContain("4 days this month");
    expect(text).toContain("update at the end of each day");
    expect(fixture.nativeElement.querySelector("app-spot-rank-icon mat-icon")?.textContent).toContain("military_tech");
    expect(text).toContain("Only you");
  });

  it("explains why there is no rank yet and still shows the person's days", async () => {
    const tooFew = render("me", spot, { status: "too_few_people", verified_days: 3 }, 3);
    await vi.waitFor(() => {
      tooFew.fixture.detectChanges();
      expect(tooFew.fixture.nativeElement.textContent).toContain("Rank unavailable");
    });
    expect(tooFew.fixture.nativeElement.textContent).toContain("at least three participating accounts");
    expect(tooFew.fixture.nativeElement.textContent).toContain("3 days this month");

    TestBed.resetTestingModule();
    const oneDay = render("me", spot, null, 1);
    await vi.waitFor(() => {
      oneDay.fixture.detectChanges();
      expect(oneDay.fixture.nativeElement.textContent).toContain("1 more verified day to get ranked");
    });

    TestBed.resetTestingModule();
    const pending = render("me", spot, null, 2);
    await vi.waitFor(() => {
      pending.fixture.detectChanges();
      expect(pending.fixture.nativeElement.textContent).toContain("ranked after tonight's update");
    });
  });

  it("invites people who have not chosen and shows no rank to people who turned it off", async () => {
    const undecided = render("me", spot, { status: "ranked", verified_days: 4, rank: 2, tied_with: 0, legend: false }, 4, "undecided");
    await vi.waitFor(() => {
      undecided.fixture.detectChanges();
      expect(undecided.fixture.nativeElement.querySelector(".spot-visits")).not.toBeNull();
    });
    expect(undecided.fixture.nativeElement.textContent).not.toContain("#2 at this Spot");

    TestBed.resetTestingModule();
    const off = render("me", spot, { status: "ranked", verified_days: 4, rank: 2, tied_with: 0, legend: false }, 4, "off");
    await vi.waitFor(() => {
      off.fixture.detectChanges();
      expect(off.fixture.nativeElement.querySelector(".spot-visits")).not.toBeNull();
    });
    expect(off.fixture.nativeElement.textContent).not.toContain("#2 at this Spot");
    expect(off.fixture.nativeElement.textContent).not.toContain("Become the local legend");
  });

  it("does not invite browsing accounts before their check-in", async () => {
    const {fixture} = render("me", spot, null, 0, "undecided");
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).not.toContain("Become the local legend");
    expect(fixture.nativeElement.querySelector(".spot-visits")).not.toBeNull();
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
