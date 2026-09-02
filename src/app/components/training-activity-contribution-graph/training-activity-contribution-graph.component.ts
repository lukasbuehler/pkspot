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
} from "../../features/training-log-activity";

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
  readonly selectedDay = input<string | null>(null);
  readonly interactive = input(true);
  readonly daySelected = output<string | null>();
  readonly weekdays = computed(() => {
    const formatter = new Intl.DateTimeFormat(this.locale, { weekday: "narrow" });
    return Array.from({ length: 7 }, (_, index) =>
      formatter.format(new Date(2024, 0, 7 + this.firstWeekday + index)),
    );
  });
  readonly weeks = computed(() =>
    buildTrainingContributionWeeks(this.days(), this.firstWeekday),
  );

  constructor() {
    afterNextRender(() => {
      const container = this.scrollContainer()?.nativeElement;
      if (container) container.scrollLeft = container.scrollWidth;
    });
  }

  selectDay(day: TrainingContributionDay): void {
    if (!day.activity) return;
    this.daySelected.emit(this.selectedDay() === day.key ? null : day.key);
  }

  dayLabel(day: TrainingContributionDay): string {
    const sessionCount = day.activity?.sessionCount ?? 0;
    return `${day.key}: ${sessionCount} ${sessionCount === 1 ? "session" : "sessions"}`;
  }
}

function localeFirstWeekday(locale: string): 0 | 1 {
  const localeWithWeekInfo = new Intl.Locale(locale) as Intl.Locale & {
    getWeekInfo?: () => { firstDay: number };
  };
  const firstDay = localeWithWeekInfo.getWeekInfo?.().firstDay;
  return firstDay === 7 || firstDay === 0 ? 0 : 1;
}
