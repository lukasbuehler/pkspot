import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterNextRender,
  computed,
  inject,
  signal,
} from "@angular/core";
import { MatButton, MatIconButton } from "@angular/material/button";
import {
  MAT_DIALOG_DATA,
  MatDialogClose,
  MatDialogContent,
  MatDialogTitle,
} from "@angular/material/dialog";
import { MatIcon } from "@angular/material/icon";
import { AccountPreferencesService } from "../../services/account-preferences.service";
import { DateTimeFormatService } from "../../services/date-time-format.service";
import {
  WEATHER_STATES,
  getWeatherForecastIconTone,
  getWeatherStateIcon,
  type WeatherForecastIconTone,
} from "../../weather/weather-display";
import {
  eventHoursForDate,
  forecastHourAt,
  type EventWeatherSelection,
} from "../../weather/event-weather";
import type { WeatherPoint, WeatherResponse } from "../../weather/weather.models";
import { formatTemperature } from "../../weather/weather-temperature";
import { EventWeatherDaysComponent } from "../event-weather-days/event-weather-days.component";

export interface EventWeatherForecastDialogData {
  eventName: string;
  eventStart: Date;
  eventEnd: Date;
  timeZone?: string;
  response: WeatherResponse;
  selection: EventWeatherSelection;
}

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
  selector: "app-event-weather-forecast-dialog",
  imports: [
    MatButton,
    MatDialogClose,
    MatDialogContent,
    MatDialogTitle,
    EventWeatherDaysComponent,
    MatIcon,
    MatIconButton,
  ],
  templateUrl: "./event-weather-forecast-dialog.component.html",
  styleUrl: "./event-weather-forecast-dialog.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EventWeatherForecastDialogComponent {
  protected readonly data = inject<EventWeatherForecastDialogData>(MAT_DIALOG_DATA);
  private readonly accountPreferences = inject(AccountPreferencesService);
  private readonly dateTime = inject(DateTimeFormatService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly selectedTime = signal(this.data.selection.time);

  protected readonly selectedDate = signal(this.data.selection.date);
  protected readonly hours = computed<EventWeatherHourView[]>(() => {
    const selectedTime = this.selectedTime();
    const highlightedPoint = selectedTime
      ? forecastHourAt(this.data.response.forecast, selectedTime)
      : undefined;
    return eventHoursForDate(
      this.data.response.forecast,
      this.selectedDate(),
      this.data.eventStart,
      this.data.eventEnd,
      this.data.timeZone,
    ).map((point) =>
      this.toHourView(point, point.time === highlightedPoint?.time),
    );
  });
  protected readonly providerUrl =
    this.data.response.provider === "open-meteo"
      ? "https://open-meteo.com/"
      : "https://developers.google.com/maps/documentation/weather";
  protected readonly attribution =
    this.data.response.attribution ??
    (this.data.response.provider === "open-meteo"
      ? "Weather: Open-Meteo"
      : "Weather: Google Weather");

  constructor() {
    afterNextRender(() => {
      const highlighted = this.host.nativeElement.querySelector<HTMLElement>(
        "[data-highlighted='true']",
      );
      highlighted?.scrollIntoView?.({
        behavior: "smooth",
        block: "nearest",
        inline: "center",
      });
    });
  }

  protected selectDate(date: string): void {
    this.selectedDate.set(date);
    this.selectedTime.set(undefined);
  }

  private toHourView(
    point: WeatherPoint,
    highlighted: boolean,
  ): EventWeatherHourView {
    const condition = point.condition ?? "unknown";
    const unit = this.accountPreferences.temperatureUnit(
      this.data.response.countryCode,
    );
    return {
      key: point.time,
      time: this.dateTime.format(new Date(point.time), {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: this.data.timeZone,
      }),
      icon: getWeatherStateIcon(condition, point.isDay),
      condition: WEATHER_STATES[condition].label,
      temperature:
        point.temperatureC === undefined
          ? undefined
          : formatTemperature(point.temperatureC, unit, false),
      rainProbability: point.precipitationProbabilityPercent,
      tone: getWeatherForecastIconTone({
        condition,
        temperatureC: point.temperatureC,
        uvIndex: point.uvIndex,
        precipitationMm: point.precipitationMm,
        precipitationProbabilityPercent:
          point.precipitationProbabilityPercent,
        isDay: point.isDay,
      }),
      highlighted,
    };
  }
}
