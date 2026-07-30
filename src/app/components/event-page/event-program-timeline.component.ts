import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  linkedSignal,
  output,
} from "@angular/core";
import { MatIconModule } from "@angular/material/icon";
import { Event as PkEvent, EventProgramItem } from "../../../db/models/Event";
import { DateTimeFormatService } from "../../services/date-time-format.service";
import {
  WEATHER_STATES,
  getDailyWeatherForecastIconTone,
  getWeatherForecastIconTone,
  getWeatherStateIcon,
  type WeatherForecastIconTone,
} from "../../weather/weather-display";
import type {
  DailyWeatherPoint,
  WeatherPoint,
  WeatherResponse,
} from "../../weather/weather.models";
import {
  dailyForecastByDate,
  eventDateKey,
  forecastHourAt,
  type EventWeatherSelection,
} from "../../weather/event-weather";
import {
  WeatherIconButtonComponent,
  type WeatherIconData,
} from "../weather-icon-button/weather-icon-button.component";
import {
  effectiveProgramItem,
  type EventMarkerBinding,
  type EventSpotBinding,
} from "../../shared/event-program-spots";
import { eventProgramTimelineLocationsByItem } from "../../shared/event-program-timeline";
import type { SeriesDocument } from "../../services/firebase/firestore/series.service";
import {
  EventProgramDayTimelineComponent,
  type EventProgramTimelineEntry,
} from "../event-program-day-timeline/event-program-day-timeline.component";
import type { MarkerSchema } from "../map/markers/map-marker.model";

interface ProgramDayWeather {
  data: WeatherIconData;
  icon: string;
  label: string;
  tone: WeatherForecastIconTone;
}

interface ProgramDayGroup {
  key: string;
  label: string;
  items: EventProgramTimelineEntry[];
  weather?: ProgramDayWeather;
}

@Component({
  selector: "app-event-program-timeline",
  imports: [
    MatIconModule,
    WeatherIconButtonComponent,
    EventProgramDayTimelineComponent,
  ],
  templateUrl: "./event-program-timeline.component.html",
  styleUrl: "./event-program-timeline.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EventProgramTimelineComponent {
  private readonly _dateTime = inject(DateTimeFormatService);

  readonly items = input.required<EventProgramItem[]>();
  readonly timeZone = input<string | undefined>();
  readonly eventStart = input<Date>();
  readonly eventEnd = input<Date>();
  readonly weather = input<WeatherResponse>();
  readonly spotBindings = input<readonly EventSpotBinding[]>([]);
  readonly customMarkers = input<readonly MarkerSchema[]>([]);
  readonly now = input(new Date());
  readonly linkedEventsById = input<Readonly<Record<string, PkEvent>>>({});
  readonly seriesById = input<Readonly<Record<string, SeriesDocument>>>({});
  readonly eventMapRoute = input.required<string[]>();
  readonly weatherSelected = output<EventWeatherSelection>();

  readonly dayGroups = computed<ProgramDayGroup[]>(() => {
    const groups = new Map<string, ProgramDayGroup>();
    const response = this.weather();
    const dailyByDate = dailyForecastByDate(response?.dailyForecast);
    const labelFormatter = this._dateTime.formatter({
      weekday: "long",
      day: "numeric",
      month: "short",
      timeZone: this.timeZone(),
    });
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
      [...this.spotBindings(), ...markerBindings],
      [],
      this.timeZone(),
      this.now(),
    );

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
      const itemView: EventProgramTimelineEntry = {
        item,
        start: effective.start,
        end: effective.end,
        spots: locations?.spots ?? [],
        markers: locations?.markers ?? [],
        linkedEvent: item.linked_event_id
          ? this.linkedEventsById()[item.linked_event_id]
          : undefined,
        weather: this.hourWeatherData(
          itemIsWithinEvent
            ? forecastHourAt(response?.forecast, effective.start)
            : undefined,
        ),
      };
      const existing = groups.get(key);
      if (existing) {
        existing.items.push(itemView);
      } else {
        groups.set(key, {
          key,
          label: labelFormatter.format(effective.start),
          items: [itemView],
          weather: this.dayWeatherData(dailyByDate.get(key)),
        });
      }
    }

    return [...groups.values()];
  });
  readonly selectedDayKey = linkedSignal<
    ProgramDayGroup[],
    string
  >({
    source: this.dayGroups,
    computation: (groups, previous) => {
      const previousKey = previous?.value;
      if (previousKey && groups.some((group) => group.key === previousKey)) {
        return previousKey;
      }
      return groups[0]?.key ?? "";
    },
  });
  readonly selectedDay = computed(() =>
    this.dayGroups().find((day) => day.key === this.selectedDayKey()),
  );

  selectDay(dayKey: string): void {
    this.selectedDayKey.set(dayKey);
  }

  handleTabKeydown(
    event: KeyboardEvent,
    currentIndex: number,
    tabList: HTMLElement,
  ): void {
    const groups = this.dayGroups();
    if (groups.length === 0) return;

    let nextIndex: number;
    switch (event.key) {
      case "ArrowRight":
        nextIndex = (currentIndex + 1) % groups.length;
        break;
      case "ArrowLeft":
        nextIndex = (currentIndex - 1 + groups.length) % groups.length;
        break;
      case "Home":
        nextIndex = 0;
        break;
      case "End":
        nextIndex = groups.length - 1;
        break;
      default:
        return;
    }

    event.preventDefault();
    this.selectDay(groups[nextIndex].key);
    tabList
      .querySelectorAll<HTMLButtonElement>('[role="tab"]')
      .item(nextIndex)
      .focus();
  }

  scrollTabsWithWheel(event: WheelEvent, tabList: HTMLElement): void {
    if (tabList.scrollWidth <= tabList.clientWidth) return;

    const delta =
      Math.abs(event.deltaX) > Math.abs(event.deltaY)
        ? event.deltaX
        : event.deltaY;
    if (delta === 0) return;

    const previousScrollLeft = tabList.scrollLeft;
    tabList.scrollLeft += delta;
    if (tabList.scrollLeft !== previousScrollLeft) {
      event.preventDefault();
    }
  }

  selectDayWeather(date: string): void {
    this.weatherSelected.emit({ date });
  }

  selectItemWeather(date: string, time: Date): void {
    this.weatherSelected.emit({ date, time });
  }

  private hourWeatherData(point: WeatherPoint | undefined): WeatherIconData | undefined {
    if (!point) return undefined;
    const condition = point.condition ?? "unknown";
    return {
      condition,
      isDay: point.isDay,
      temperatureC: point.temperatureC,
      status: this.statusFromTone(
        getWeatherForecastIconTone({
          condition,
          temperatureC: point.temperatureC,
          uvIndex: point.uvIndex,
          precipitationMm: point.precipitationMm,
          precipitationProbabilityPercent:
            point.precipitationProbabilityPercent,
          isDay: point.isDay,
        }),
      ),
    };
  }

  private dayWeatherData(
    point: DailyWeatherPoint | undefined,
  ): ProgramDayWeather | undefined {
    if (!point) return undefined;
    const condition = point.condition ?? "unknown";
    const tone = getDailyWeatherForecastIconTone({
      condition,
      temperatureC: point.maxTemperatureC,
    });
    return {
      data: {
        condition,
        minTemperatureC: point.minTemperatureC,
        maxTemperatureC: point.maxTemperatureC,
        status: this.statusFromTone(tone),
      },
      icon: getWeatherStateIcon(condition),
      label: WEATHER_STATES[condition].label,
      tone,
    };
  }

  private statusFromTone(
    tone: WeatherForecastIconTone,
  ): "neutral" | "wet" | "warning" {
    if (tone === "wet") return "wet";
    return tone === "warning" ? "warning" : "neutral";
  }
}
