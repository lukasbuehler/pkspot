import { ComponentFixture, TestBed } from "@angular/core/testing";
import { provideRouter } from "@angular/router";
import { describe, expect, it, vi } from "vitest";
import type { TrainingMonthSchema } from "../../../db/schemas/TrainingSummarySchema";
import { localDateKey, shiftMonth } from "../../../db/utils/training-summary";
import { TrainingSummaryService } from "../../services/firebase/firestore/training-summary.service";
import { TrainingStatsComponent } from "./training-stats.component";
import { signal } from "@angular/core";
import { LocalLegendService } from "../../services/local-legend.service";

const current = localDateKey(Date.now(), Intl.DateTimeFormat().resolvedOptions().timeZone).slice(0, 7);
const previous = shiftMonth(current, -1);

function month(
  key: string,
  spots: Record<string, { visits: number; minutes?: number; name: string }>,
  sessions: number,
  minutes: number,
  withDuration: number,
): TrainingMonthSchema {
  return {
    version: 1,
    month: key,
    session_count: sessions,
    sessions_with_duration: withDuration,
    minutes,
    days: Object.fromEntries(Array.from({ length: sessions }, (_, index) => [
      `${key}-${`${index + 1}`.padStart(2, "0")}`,
      { sessions: 1, minutes: 0 },
    ])),
    spots: Object.fromEntries(Object.entries(spots).map(([id, spot]) => [id, {
      visits: spot.visits,
      verified_days: spot.visits,
      minutes: spot.minutes ?? 0,
      first_ms: Date.parse(`${key}-01T10:00:00Z`),
      last_ms: Date.parse(`${key}-01T10:00:00Z`),
      name: spot.name,
    }])),
    weekday_sessions: [1, 0, 0, 0, 0, 2, 0],
    updated_at_raw_ms: 0,
  };
}

async function render(): Promise<ComponentFixture<TrainingStatsComponent>> {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: LocalLegendService, useValue: { state: signal("on"), enabled: signal(true) } },
      {
        provide: TrainingSummaryService,
        useValue: {
          listMyMonths: vi.fn().mockResolvedValue([
            month(previous, { river: { visits: 1, name: "Riverside" } }, 1, 0, 0),
            month(current, {
              river: { visits: 3, minutes: 120, name: "Riverside" },
              steps: { visits: 1, name: "Sihlcity steps" },
            }, 3, 120, 2),
          ]),
          getMyRanks: vi.fn(async (key: string) => key === current
            ? {
                version: 1,
                month: current,
                final: false,
                computed_at_raw_ms: 0,
                spots: { river: { status: "ranked", verified_days: 3, rank: 1, tied_with: 1, legend: true } },
              }
            : key === previous
              ? {
                  version: 1,
                  month: previous,
                  final: true,
                  computed_at_raw_ms: 0,
                  spots: { river: { status: "too_few_people", verified_days: 2 } },
                }
              : null),
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(TrainingStatsComponent);
  fixture.detectChanges();
  await vi.waitFor(() => {
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector(".stats-spot")).not.toBeNull();
  });
  return fixture;
}

describe("TrainingStatsComponent", () => {
  it("shows this month's totals, your Spots with private ranks and new Spots", async () => {
    const fixture = await render();
    const element = fixture.nativeElement as HTMLElement;
    const headline = element.querySelector(".training-stats__headline")!.textContent!;
    expect(headline).toContain("3");
    expect(headline).toContain("+2");
    expect(headline).toContain("2h");
    expect(headline).toContain("Logged for 2 of 3 sessions");
    expect(headline).toContain("1 new");

    const rows = [...element.querySelectorAll(".stats-spot")].map((row) => row.textContent ?? "");
    expect(rows[0]).toContain("Riverside");
    expect(rows[0]).toContain("Local legend");
    expect(rows[1]).toContain("Sihlcity steps");
    // One verified day: progress toward a rank, not a rank.
    expect(rows[1]).toContain("1 more day to get ranked");
    expect(rows[1]).toContain("New");
    expect(element.textContent).toContain("update at the end of each day");
  });

  it("shows a past month's final ranks without live progress", async () => {
    const fixture = await render();
    fixture.componentInstance.step(-1);
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector(".stats-spot")!.textContent).toContain("Rank unavailable");
    });
  });

  it("drops monthly ranks outside the current month and sums the year", async () => {
    const fixture = await render();
    fixture.componentInstance.setPeriod("all");
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector(".training-stats__headline")!.textContent).toContain("4");
    expect(element.textContent).not.toContain("Local legend");
    expect(element.querySelector(".stats-spot")!.textContent).toContain("4 visits");
  });
});
