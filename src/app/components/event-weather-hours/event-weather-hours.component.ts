import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterNextRender,
  computed,
  inject,
  input,
} from "@angular/core";
import { MatButton } from "@angular/material/button";
import { MatIcon } from "@angular/material/icon";
import { AccountPreferencesService } from "../../services/account-preferences.service";
import { DateTimeFormatService } from "../../services/date-time-format.service";
import {
  getWeatherForecastIconTone,
  getWeatherForecastState,
  getWeatherForecastStateIcon,
  type WeatherForecastIconTone,
} from "../../weather/weather-display";
import {
  eventHoursForDate,
  forecastHourAt,
} from "../../weather/event-weather";
import type {
  WeatherPoint,
  WeatherResponse,
} from "../../weather/weather.models";
import { formatTemperature } from "../../weather/weather-temperature";

interface EventWeatherHourView {
  key: string;
  time: string;
  icon: string;
  condition: string;
  temperature?: string;
  rainProbability?: number;
  tone: WeatherForecastIconTone;
  highlighted: boolean;
}

@Component({
  selector: "app-event-weather-hours",
  imports: [MatButton, MatIcon],
  templateUrl: "./event-weather-hours.component.html",
  styleUrl: "./event-weather-hours.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EventWeatherHoursComponent {
  private readonly accountPreferences = inject(AccountPreferencesService);
  private readonly dateTime = inject(DateTimeFormatService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly response = input.required<WeatherResponse>();
  readonly date = input.required<string>();
  readonly eventStart = input.required<Date>();
  readonly eventEnd = input.required<Date>();
  readonly timeZone = input<string>();
  readonly highlightedTime = input<Date>();

  protected readonly hours = computed<EventWeatherHourView[]>(() => {
    const response = this.response();
    const highlightedTime = this.highlightedTime();
    const highlightedPoint = highlightedTime
      ? forecastHourAt(response.forecast, highlightedTime)
      : undefined;

    return eventHoursForDate(
      response.forecast,
      this.date(),
      this.eventStart(),
      this.eventEnd(),
      this.timeZone(),
    ).map((point) =>
      this.toHourView(point, point.time === highlightedPoint?.time),
    );
  });
  protected readonly providerUrl = computed(() =>
    this.response().provider === "open-meteo"
      ? "https://open-meteo.com/"
      : "https://developers.google.com/maps/documentation/weather",
  );
  protected readonly attribution = computed(
    () =>
      this.response().attribution ??
      (this.response().provider === "open-meteo"
        ? "Weather: Open-Meteo"
        : "Weather: Google Weather"),
  );

  constructor() {
    afterNextRender(() => {
      this.host.nativeElement
        .querySelector<HTMLElement>("[data-highlighted='true']")
        ?.scrollIntoView?.({
          behavior: "smooth",
          block: "nearest",
          inline: "center",
        });
    });
  }

  private toHourView(
    point: WeatherPoint,
    highlighted: boolean,
  ): EventWeatherHourView {
    const response = this.response();
    const condition = point.condition ?? "unknown";
    const context = { ...point, condition };
    const state = getWeatherForecastState(context);
    const unit = this.accountPreferences.temperatureUnit(response.countryCode);
    return {
      key: point.time,
      time: this.dateTime.format(new Date(point.time), {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: this.timeZone(),
      }),
      icon: getWeatherForecastStateIcon(context),
      condition: state.label,
      temperature:
        point.temperatureC === undefined
          ? undefined
          : formatTemperature(point.temperatureC, unit, false),
      rainProbability: point.precipitationProbabilityPercent,
      tone: getWeatherForecastIconTone(context),
      highlighted,
    };
  }
}
