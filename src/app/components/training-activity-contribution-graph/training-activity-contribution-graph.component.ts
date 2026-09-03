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
  readonly selectionChange = output<TrainingContributionSelection | null>();
  readonly weekdays = computed(() => {
    const formatter = new Intl.DateTimeFormat(this.locale, { weekday: "narrow" });
    return Array.from({ length: 7 }, (_, index) =>
      formatter.format(new Date(2024, 0, 7 + this.firstWeekday + index)),
    );
  });
  readonly weeks = computed(() =>
    buildTrainingContributionWeeks(
      this.days(),
      this.recoveryPauses(),
      this.firstWeekday,
    ),
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
    const sessionCount = day.activity?.sessionCount ?? 0;
    if (day.activity) {
      return `${day.key}: ${sessionCount} ${sessionCount === 1 ? "session" : "sessions"}`;
    }
    if (day.recoveryPause) {
      return `${day.key}: ${recoveryReasonLabel(day.recoveryPause.reason)} ${recoveryPauseLabel()}`;
    }
    return day.key;
  }
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

function localeFirstWeekday(locale: string): 0 | 1 {
  const localeWithWeekInfo = new Intl.Locale(locale) as Intl.Locale & {
    getWeekInfo?: () => { firstDay: number };
  };
  const firstDay = localeWithWeekInfo.getWeekInfo?.().firstDay;
  return firstDay === 7 || firstDay === 0 ? 0 : 1;
}
