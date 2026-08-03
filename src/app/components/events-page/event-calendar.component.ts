import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  LOCALE_ID,
  output,
} from "@angular/core";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import type { SeriesDocument } from "../../services/firebase/firestore/series.service";
import { DateTimeFormatService } from "../../services/date-time-format.service";
import {
  calendarWeekdayLabels,
  type EventCalendarDay,
  type EventCalendarMonth,
} from "./event-calendar.model";
import { EventCalendarItemComponent } from "./event-calendar-item.component";
import { EventCalendarThumbnailComponent } from "./event-calendar-thumbnail.component";
import { EventDiscoveryListComponent } from "./event-discovery-list.component";

@Component({
  selector: "app-event-calendar",
  imports: [
    MatButtonModule,
    MatIconModule,
    EventCalendarItemComponent,
    EventCalendarThumbnailComponent,
    EventDiscoveryListComponent,
  ],
  templateUrl: "./event-calendar.component.html",
  styleUrl: "./event-calendar.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EventCalendarComponent {
  private readonly _locale = inject(LOCALE_ID);
  private readonly _dateTime = inject(DateTimeFormatService);

  readonly calendar = input.required<EventCalendarMonth>();
  readonly selectedDay = input.required<string>();
  readonly wide = input(false);
  readonly seriesById = input<Record<string, SeriesDocument>>({});

  readonly previousMonth = output<void>();
  readonly nextMonth = output<void>();
  readonly today = output<void>();
  readonly daySelected = output<string>();

  readonly weekdayLabels = calendarWeekdayLabels(this._locale);
  readonly monthLabel = computed(() =>
    this._dateTime.format(
      new Date(`${this.calendar().monthKey}-01T12:00:00.000Z`),
      {
        year: "numeric",
        month: "long",
        timeZone: "UTC",
      },
    ),
  );
  readonly selectedDayModel = computed(
    () =>
      this.calendar().days.find((day) => day.key === this.selectedDay()) ??
      this.calendar().days.find((day) => day.inSelectedMonth) ??
      this.calendar().days[0],
  );
  readonly selectedDayLabel = computed(() => {
    const day = this.selectedDayModel();
    return day
      ? this._dateTime.format(day.date, {
          dateStyle: "full",
          timeZone: "UTC",
        })
      : "";
  });

  dayAriaLabel(day: EventCalendarDay): string {
    const date = this._dateTime.format(day.date, {
      dateStyle: "full",
      timeZone: "UTC",
    });
    return `${date}, ${this.eventCountLabel(day.events.length)}`;
  }

  moreEventsAriaLabel(day: EventCalendarDay): string {
    const date = this._dateTime.format(day.date, {
      dateStyle: "full",
      timeZone: "UTC",
    });
    return $localize`:@@events.calendar_more_aria:Show ${day.hiddenEventCount}:eventCount: more events on ${date}:localDate:`;
  }

  private eventCountLabel(count: number): string {
    return count === 1
      ? $localize`:@@events.count_one:1 event`
      : $localize`:@@events.count_many:${count}:eventCount: events`;
  }
}
