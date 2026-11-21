import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  LOCALE_ID,
  afterNextRender,
  computed,
  inject,
  input,
  output,
  viewChild,
} from "@angular/core";
import type { LocaleCode } from "../../../db/models/Interfaces";
import {
  buildTrainingContributionWeeks,
  localeFirstWeekday,
  type TrainingActivityDay,
  type TrainingContributionDay,
  type TrainingContributionSelection,
} from "../../features/training-log-activity";
import type { RecoveryPauseDocument } from "../../../db/schemas/RecoveryPauseSchema";

@Component({
  selector: "app-training-activity-contribution-graph",
  templateUrl: "./training-activity-contribution-graph.component.html",
  styleUrl: "./training-activity-contribution-graph.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TrainingActivityContributionGraphComponent {
  private readonly locale = inject(LOCALE_ID) as LocaleCode;
  private readonly firstWeekday = localeFirstWeekday(this.locale);
  private readonly scrollContainer = viewChild<ElementRef<HTMLElement>>("scrollContainer");

  readonly days = input<readonly TrainingActivityDay[]>([]);
  readonly recoveryPauses = input<readonly RecoveryPauseDocument[]>([]);
  readonly selected = input<TrainingContributionSelection | null>(null);
  readonly interactive = input(true);
  /**
   * Limits the graph to the most recent weeks; the full history remains the
   * default. A single week renders as one row of days (used by the Train page
   * rail together with `showHeader` off).
   */
  readonly weeks = input<number | null>(null);
  readonly showHeader = input(true);
  readonly selectionChange = output<TrainingContributionSelection | null>();
  readonly weekdays = computed(() => {
    const formatter = new Intl.DateTimeFormat(this.locale, { weekday: "narrow" });
    return Array.from({ length: 7 }, (_, index) =>
      formatter.format(new Date(2024, 0, 7 + this.firstWeekday + index)),
    );
  });
  readonly visibleWeeks = computed(() => {
    const weeks = buildTrainingContributionWeeks(
      this.days(),
      this.recoveryPauses(),
      this.firstWeekday,
    );
    const shown = this.weeks();
    return shown && shown > 0 ? weeks.slice(-shown) : weeks;
  });

  /**
   * Spoken names for each day and week, built once per data change. Screen
   * readers get a date and status instead of empty cells or ISO keys.
   */
  private readonly _labels = computed(() => {
    const dateFormat = new Intl.DateTimeFormat(this.locale, {
      weekday: "long",
      day: "numeric",
      month: "long",
    });
    const shortDate = new Intl.DateTimeFormat(this.locale, {
      day: "numeric",
      month: "long",
    });
    const days = new Map<string, string>();
    const weeks = new Map<string, string>();
    for (const week of this.visibleWeeks()) {
      let trainingDays = 0;
      let pauseDays = 0;
      for (const day of week.days) {
        const date = dateFormat.format(dayKeyToDate(day.key));
        days.set(day.key, describeDay(date, day));
        if (day.activity) trainingDays++;
        else if (day.recoveryPause) pauseDays++;
      }
      const first = week.days[0];
      if (!first) continue;
      const start = shortDate.format(dayKeyToDate(first.key));
      weeks.set(week.key, describeWeek(start, trainingDays, pauseDays));
    }
    return { days, weeks };
  });

  readonly singleWeek = computed(() => this.weeks() === 1);
  readonly currentWeekDays = computed(
    () => this.visibleWeeks().at(-1)?.days ?? [],
  );

  constructor() {
    afterNextRender(() => {
      const container = this.scrollContainer()?.nativeElement;
      if (container) container.scrollLeft = container.scrollWidth;
    });
  }

  selectDay(day: TrainingContributionDay): void {
    const selection = day.activity
      ? ({ kind: "training-day", dayKey: day.key } as const)
      : day.recoveryPause
        ? ({ kind: "recovery-pause", recoveryPauseId: day.recoveryPause.id } as const)
        : null;
    if (!selection) return;
    this.selectionChange.emit(
      matchesSelection(selection, this.selected()) ? null : selection,
    );
  }

  isSelected(day: TrainingContributionDay): boolean {
    const selection = this.selected();
    return !!selection && (
      selection.kind === "training-day"
        ? selection.dayKey === day.key && !!day.activity
        : selection.recoveryPauseId === day.recoveryPause?.id && !day.activity
    );
  }

  dayLabel(day: TrainingContributionDay): string {
    return this._labels().days.get(day.key) ?? day.key;
  }

  weekLabel(weekKey: string): string {
    return this._labels().weeks.get(weekKey) ?? "";
  }
}

function dayKeyToDate(key: string): Date {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, (month ?? 1) - 1, day ?? 1);
}

function describeDay(date: string, day: TrainingContributionDay): string {
  if (day.activity) {
    const count = day.activity.sessionCount;
    return count === 1
      ? $localize`:@@trainingContributionGraph.day_one_session:${date}:date:: 1 session`
      : $localize`:@@trainingContributionGraph.day_sessions:${date}:date:: ${count}:count: sessions`;
  }
  if (day.recoveryPause) {
    return `${date}: ${recoveryReasonLabel(day.recoveryPause.reason)}, ${recoveryPauseLabel()}`;
  }
  if (day.isFuture) return date;
  return $localize`:@@trainingContributionGraph.day_no_training:${date}:date:: no training`;
}

function describeWeek(
  start: string,
  trainingDays: number,
  pauseDays: number,
): string {
  const training =
    trainingDays === 1
      ? $localize`:@@trainingContributionGraph.week_one_day:Week of ${start}:start:: 1 training day`
      : $localize`:@@trainingContributionGraph.week_days:Week of ${start}:start:: ${trainingDays}:count: training days`;
  if (pauseDays === 0) return training;
  return `${training}, ${$localize`:@@trainingContributionGraph.week_pause_days:${pauseDays}:count: recovery days`}`;
}

function matchesSelection(
  left: TrainingContributionSelection,
  right: TrainingContributionSelection | null,
): boolean {
  if (!right || left.kind !== right.kind) return false;
  if (left.kind === "training-day" && right.kind === "training-day") {
    return left.dayKey === right.dayKey;
  }
  if (left.kind === "recovery-pause" && right.kind === "recovery-pause") {
    return left.recoveryPauseId === right.recoveryPauseId;
  }
  return false;
}

function recoveryReasonLabel(reason: RecoveryPauseDocument["reason"]): string {
  switch (reason) {
    case "illness":
      return $localize`:@@recoveryPause.reason.illness:Illness`;
    case "personal_break":
      return $localize`:@@recoveryPause.reason.personalBreak:Personal break`;
    case "other":
      return $localize`:@@recoveryPause.reason.other:Other`;
    default:
      return $localize`:@@recoveryPause.reason.injury:Injury`;
  }
}

function recoveryPauseLabel(): string {
  return $localize`:@@trainingContributionGraph.recovery:Recovery pause`;
}
