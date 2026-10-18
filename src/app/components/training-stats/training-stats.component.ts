import {
  ChangeDetectionStrategy,
  Component,
  LOCALE_ID,
  computed,
  inject,
  input,
  linkedSignal,
  resource,
  signal,
} from "@angular/core";
import { RouterLink } from "@angular/router";
import { MatButtonModule } from "@angular/material/button";
import { MatButtonToggleModule } from "@angular/material/button-toggle";
import { MatCardModule } from "@angular/material/card";
import { MatIconModule } from "@angular/material/icon";
import { MatListModule } from "@angular/material/list";
import { MatProgressBarModule } from "@angular/material/progress-bar";
import type { LocaleCode } from "../../../db/models/Interfaces";
import type {
  MySpotRank,
  TrainingMonthSchema,
} from "../../../db/schemas/TrainingSummarySchema";
import {
  localDateKey,
  monthRange,
  shiftMonth,
  summarizeTrainingPeriod,
  type TrainingPeriodSummary,
} from "../../../db/utils/training-summary";
import { formatDuration } from "../../features/training-log-activity";
import { DateTimeFormatService } from "../../services/date-time-format.service";
import { TrainingSummaryService } from "../../services/firebase/firestore/training-summary.service";
import { SpotRankIconComponent } from "../spot-rank-icon/spot-rank-icon.component";

export type TrainingStatsPeriod = "month" | "year" | "all";

interface StatsSpotView {
  spotId: string;
  position: number;
  name: string;
  detail: string;
  isNew: boolean;
  rank: MySpotRank | null;
  rankLabel: string | null;
}

const COLLAPSED_SPOTS = 5;

/**
 * Private training statistics for the training log: totals, the person's own
 * Spots with this month's private rank, new Spots and weekly rhythm.
 */
@Component({
  selector: "app-training-stats",
  imports: [
    RouterLink,
    MatButtonModule,
    MatButtonToggleModule,
    MatCardModule,
    MatIconModule,
    MatListModule,
    MatProgressBarModule,
    SpotRankIconComponent,
  ],
  templateUrl: "./training-stats.component.html",
  styleUrl: "./training-stats.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TrainingStatsComponent {
  private readonly summaries = inject(TrainingSummaryService);
  private readonly dateTime = inject(DateTimeFormatService);
  private readonly locale = inject(LOCALE_ID) as LocaleCode;

  /** Changes when the parent reloads history, so the summaries reload too. */
  readonly reloadKey = input(0);

  readonly currentMonth = localDateKey(
    Date.now(),
    Intl.DateTimeFormat().resolvedOptions().timeZone,
  ).slice(0, 7);
  readonly period = signal<TrainingStatsPeriod>("month");
  /** The month (or any month of the year) being viewed; resets on period change. */
  readonly anchor = linkedSignal<TrainingStatsPeriod, string>({
    source: this.period,
    computation: () => this.currentMonth,
  });
  readonly showAllSpots = signal(false);

  readonly months = resource({
    params: () => ({ reload: this.reloadKey() }),
    loader: () => this.summaries.listMyMonths(),
  });
  readonly ranks = resource({
    params: () => ({ reload: this.reloadKey() }),
    loader: async () => {
      try {
        return (await this.summaries.getMySpotRanks()).ranks;
      } catch (error) {
        // Ranks are a bonus; statistics remain useful without them.
        console.warn("[Training stats] ranks unavailable", error);
        return [];
      }
    },
  });

  private readonly allMonths = computed<TrainingMonthSchema[]>(() => this.months.value() ?? []);
  readonly hasHistory = computed(() => this.allMonths().length > 0);
  private readonly periodMonths = computed(() => this.monthsFor(this.period(), this.anchor()));
  private readonly previousMonths = computed(() => {
    const period = this.period();
    if (period === "all") return new Set<string>();
    return this.monthsFor(period, shiftMonth(this.anchor(), period === "year" ? -12 : -1));
  });
  readonly summary = computed<TrainingPeriodSummary>(() =>
    summarizeTrainingPeriod(this.allMonths(), this.periodMonths()),
  );
  private readonly previousSummary = computed(() =>
    summarizeTrainingPeriod(this.allMonths(), this.previousMonths()),
  );

  readonly periodLabel = computed(() => {
    const [year, month] = this.anchor().split("-").map(Number);
    const date = new Date(Date.UTC(year, month - 1, 15));
    return this.period() === "year"
      ? `${year}`
      : this.dateTime.format(date, { month: "long", year: "numeric", timeZone: "UTC" });
  });
  readonly canGoForward = computed(() => {
    const period = this.period();
    if (period === "year") return this.anchor().slice(0, 4) < this.currentMonth.slice(0, 4);
    return period === "month" && this.anchor() < this.currentMonth;
  });
  readonly canGoBack = computed(() => {
    const first = this.allMonths()[0]?.month;
    if (!first || this.period() === "all") return false;
    return this.period() === "year"
      ? this.anchor().slice(0, 4) > first.slice(0, 4)
      : this.anchor() > first;
  });

  readonly sessionDelta = computed(() => {
    if (this.period() === "all") return null;
    const delta = this.summary().sessions - this.previousSummary().sessions;
    const signed = new Intl.NumberFormat(this.locale, { signDisplay: "exceptZero" }).format(delta);
    return this.period() === "year"
      ? $localize`:@@trainingStats.vsLastYear:${signed}:delta: vs last year`
      : $localize`:@@train.reflection.vsLastMonth:${signed}:delta: vs last month`;
  });
  readonly sessionDeltaUp = computed(
    () => this.summary().sessions > this.previousSummary().sessions,
  );
  readonly durationLabel = computed(() => formatDuration(this.summary().minutes));
  readonly durationCoverage = computed(() => {
    const summary = this.summary();
    if (summary.sessions === 0 || summary.sessionsWithDuration === summary.sessions) return null;
    return $localize`:@@trainingStats.durationCoverage:Logged for ${summary.sessionsWithDuration}:logged: of ${summary.sessions}:sessions: sessions`;
  });

  /** Ranks are monthly, so they appear only on the current month. */
  private readonly ranksBySpot = computed(() =>
    this.period() === "month" && this.anchor() === this.currentMonth
      ? new Map((this.ranks.value() ?? []).map((rank) => [rank.spotId, rank]))
      : new Map<string, MySpotRank>(),
  );
  readonly spots = computed<StatsSpotView[]>(() => {
    const spots = this.summary().spots;
    const ranks = this.ranksBySpot();
    return spots.map((spot, index) => ({
      spotId: spot.spotId,
      position: index + 1,
      name: spot.name ?? $localize`:@@trainingStats.unnamedSpot:Spot`,
      detail: [
        spot.visits === 1
          ? $localize`:@@trainingStats.oneVisit:1 visit`
          : $localize`:@@trainingStats.visits:${spot.visits}:count: visits`,
        spot.minutes > 0 ? formatDuration(spot.minutes) : null,
        $localize`:@@trainingStats.lastVisit:last ${this.dateTime.format(new Date(spot.lastMs), { day: "numeric", month: "short" })}:date:`,
      ]
        .filter((part): part is string => !!part)
        .join(" · "),
      isNew: spot.isNew && this.period() !== "all",
      rank: ranks.get(spot.spotId) ?? null,
      rankLabel: rankLabel(ranks.get(spot.spotId)),
    }));
  });
  readonly visibleSpots = computed(() =>
    this.showAllSpots() ? this.spots() : this.spots().slice(0, COLLAPSED_SPOTS),
  );
  readonly hiddenSpotCount = computed(() => Math.max(0, this.spots().length - COLLAPSED_SPOTS));

  readonly weekdays = computed(() => {
    const counts = this.summary().weekdaySessions;
    const max = Math.max(1, ...counts);
    const formatter = new Intl.DateTimeFormat(this.locale, { weekday: "short", timeZone: "UTC" });
    // 5 January 2026 is a Monday; the summaries count Monday first.
    return counts.map((count, index) => ({
      label: formatter.format(new Date(Date.UTC(2026, 0, 5 + index))),
      count,
      share: Math.round((count / max) * 100),
    }));
  });

  setPeriod(period: TrainingStatsPeriod): void {
    this.period.set(period);
    this.showAllSpots.set(false);
  }

  step(direction: -1 | 1): void {
    const months = this.period() === "year" ? 12 : 1;
    const next = shiftMonth(this.anchor(), direction * months);
    this.anchor.set(next > this.currentMonth ? this.currentMonth : next);
    this.showAllSpots.set(false);
  }

  private monthsFor(period: TrainingStatsPeriod, anchor: string): Set<string> {
    if (period === "all") return new Set(this.allMonths().map((month) => month.month));
    if (period === "year") {
      const year = anchor.slice(0, 4);
      return new Set(monthRange(`${year}-01`, `${year}-12`));
    }
    return new Set([anchor]);
  }
}

function rankLabel(rank: MySpotRank | undefined): string | null {
  if (!rank) return null;
  return rank.legend
    ? $localize`:@@trainingStats.legend:Local legend`
    : $localize`:@@trainingStats.rank:#${rank.rank}:rank: this month`;
}
