import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
} from "@angular/core";
import { DateTimeFormatService } from "../../services/date-time-format.service";
import {
  FilterChipsBarComponent,
  type PresetFilterChip,
} from "../filter-chips-bar/filter-chips-bar.component";

const ALL_DAYS = "all";

@Component({
  selector: "app-event-program-day-chips",
  imports: [FilterChipsBarComponent],
  templateUrl: "./event-program-day-chips.component.html",
  styleUrl: "./event-program-day-chips.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EventProgramDayChipsComponent {
  private readonly dateTime = inject(DateTimeFormatService);

  readonly days = input.required<readonly string[]>();
  readonly selectedDay = input<string | null>("");
  readonly dayChange = output<string | null>();

  readonly selectedFilter = computed(() => {
    const day = this.selectedDay();
    if (day === null) return "";
    return day || ALL_DAYS;
  });
  readonly chips = computed<PresetFilterChip[]>(() => [
    {
      urlParam: ALL_DAYS,
      label: $localize`:@@event_program.all_days:All days`,
      icon: "calendar_month",
    },
    ...this.days().map((day) => ({
      urlParam: day,
      label: this.dateTime.format(new Date(`${day}T12:00:00Z`), {
        weekday: "short",
        day: "numeric",
        month: "short",
        timeZone: "UTC",
      }),
    })),
  ]);

  selectDay(value: string): void {
    if (!value) {
      this.dayChange.emit(null);
      return;
    }
    this.dayChange.emit(value === ALL_DAYS ? "" : value);
  }
}
