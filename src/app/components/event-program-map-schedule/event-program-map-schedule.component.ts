import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
} from "@angular/core";
import { MatExpansionModule } from "@angular/material/expansion";
import { MatIconModule } from "@angular/material/icon";
import type {
  Event as PkEvent,
  EventProgramItem,
} from "../../../db/models/Event";
import { DateTimeFormatService } from "../../services/date-time-format.service";
import {
  effectiveProgramItem,
  isEventProgramSpotOccurrence,
  type EventMarkerBinding,
  type EventProgramOccurrence,
  type EventProgramSpotOccurrence,
} from "../../shared/event-program-spots";
import { eventProgramTimelineLocationsByItem } from "../../shared/event-program-timeline";
import {
  dailyForecastByDate,
  eventDateKey,
  eventProgramDayWeather,
  eventProgramHourWeather,
  forecastHourAt,
  type EventProgramDayWeather,
  type EventWeatherSelection,
} from "../../weather/event-weather";
import type { WeatherResponse } from "../../weather/weather.models";
import {
  EventProgramDayTimelineComponent,
  type EventProgramTimelineEntry,
} from "../event-program-day-timeline/event-program-day-timeline.component";
import type { MarkerSchema } from "../map/markers/map-marker.model";
import { WeatherIconButtonComponent } from "../weather-icon-button/weather-icon-button.component";

interface ProgramScheduleDay {
  key: string;
  label: string;
  entries: EventProgramTimelineEntry[];
  weather?: EventProgramDayWeather;
}

@Component({
  selector: "app-event-program-map-schedule",
  imports: [
    MatExpansionModule,
    MatIconModule,
    EventProgramDayTimelineComponent,
    WeatherIconButtonComponent,
  ],
  templateUrl: "./event-program-map-schedule.component.html",
  styleUrl: "./event-program-map-schedule.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EventProgramMapScheduleComponent {
  private readonly dateTime = inject(DateTimeFormatService);

  readonly items = input.required<readonly EventProgramItem[]>();
  readonly occurrences = input<readonly EventProgramOccurrence[]>([]);
  readonly customMarkers = input<readonly MarkerSchema[]>([]);
  readonly linkedEventsById = input<Readonly<Record<string, PkEvent>>>({});
  readonly timeZone = input<string>();
  readonly eventStart = input<Date>();
  readonly eventEnd = input<Date>();
  readonly weather = input<WeatherResponse>();
  readonly now = input(new Date());
  readonly selectedDay = input("");
  readonly selectedItemId = input<string | null>(null);

  readonly dayOpened = output<string>();
  readonly dayClosed = output<string>();
  readonly occurrenceSelected = output<EventProgramOccurrence>();
  readonly spotSelected = output<EventProgramSpotOccurrence>();
  readonly weatherSelected = output<EventWeatherSelection>();

  readonly days = computed<ProgramScheduleDay[]>(() => {
    const groups = new Map<string, ProgramScheduleDay>();
    const response = this.weather();
    const dailyByDate = dailyForecastByDate(response?.dailyForecast);
    const markerBindings = this.customMarkers().flatMap(
      (marker): EventMarkerBinding[] =>
        marker.id
          ? [
              {
                ref: { kind: "custom_marker", id: marker.id },
                marker,
              },
            ]
          : [],
    );
    const locationsByItem = eventProgramTimelineLocationsByItem(
      this.items(),
      markerBindings,
      this.occurrences(),
      this.timeZone(),
      this.now(),
    );
    const labelFormatter = this.dateTime.formatter({
      weekday: "long",
      day: "numeric",
      month: "short",
      timeZone: this.timeZone(),
    });

    for (const item of [...this.items()].sort(
      (left, right) =>
        effectiveProgramItem(left).start.getTime() -
        effectiveProgramItem(right).start.getTime(),
    )) {
      const effective = effectiveProgramItem(item);
      const key = eventDateKey(effective.start, this.timeZone());
      const eventStart = this.eventStart();
      const eventEnd = this.eventEnd();
      const itemIsWithinEvent =
        (!eventStart || effective.start >= eventStart) &&
        (!eventEnd || effective.start <= eventEnd);
      const locations = locationsByItem.get(item.id);
      const entry: EventProgramTimelineEntry = {
        item,
        start: effective.start,
        end: effective.end,
        linkedEvent: item.linked_event_id
          ? this.linkedEventsById()[item.linked_event_id]
          : undefined,
        spots: locations?.spots ?? [],
        markers: locations?.markers ?? [],
        weather: eventProgramHourWeather(
          itemIsWithinEvent
            ? forecastHourAt(response?.forecast, effective.start)
            : undefined,
        ),
      };
      const day = groups.get(key);

      if (day) {
        day.entries.push(entry);
      } else {
        groups.set(key, {
          key,
          label: labelFormatter.format(effective.start),
          entries: [entry],
          weather: eventProgramDayWeather(dailyByDate.get(key)),
        });
      }
    }

    return [...groups.values()];
  });

  selectLocation(occurrence: EventProgramOccurrence): void {
    if (isEventProgramSpotOccurrence(occurrence)) {
      this.spotSelected.emit(occurrence);
      return;
    }
    this.occurrenceSelected.emit(occurrence);
  }

  selectDayWeather(date: string): void {
    this.weatherSelected.emit({ date });
  }

  selectItemWeather(date: string, time: Date): void {
    this.weatherSelected.emit({ date, time });
  }
}
