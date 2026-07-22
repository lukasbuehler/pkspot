import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
} from "@angular/core";
import { MatIcon } from "@angular/material/icon";
import { AccountPreferencesService } from "../../services/account-preferences.service";
import { DateTimeFormatService } from "../../services/date-time-format.service";
import {
  WEATHER_STATES,
  getDailyWeatherForecastIconTone,
  getWeatherStateIcon,
  type WeatherForecastIconTone,
} from "../../weather/weather-display";
import {
  dailyForecastByDate,
  enumerateEventDateKeys,
} from "../../weather/event-weather";
import type {
  DailyWeatherPoint,
  WeatherResponse,
} from "../../weather/weather.models";
import { formatTemperature } from "../../weather/weather-temperature";

interface EventWeatherDayView {
  key: string;
  weekday: string;
  date: string;
  available: boolean;
  icon?: string;
  condition?: string;
  high?: string;
  low?: string;
  rainProbability?: number;
  tone: WeatherForecastIconTone;
}

@Component({
  selector: "app-event-weather-days",
  imports: [MatIcon],
  templateUrl: "./event-weather-days.component.html",
  styleUrl: "./event-weather-days.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EventWeatherDaysComponent {
  private readonly accountPreferences = inject(AccountPreferencesService);
  private readonly dateTime = inject(DateTimeFormatService);

  readonly eventStart = input<Date>();
  readonly eventEnd = input<Date>();
  readonly timeZone = input<string>();
  readonly response = input<WeatherResponse>();
  readonly selectedDate = input<string>();
  readonly dateSelected = output<string>();

  protected readonly days = computed<EventWeatherDayView[]>(() => {
    const response = this.response();
    const eventStart = this.eventStart();
    const eventEnd = this.eventEnd();
    if (!response || !eventStart || !eventEnd) return [];

    const dailyByDate = dailyForecastByDate(response.dailyForecast);
    return enumerateEventDateKeys(
      eventStart,
      eventEnd,
      this.timeZone(),
    ).map((date) => this.toDayView(date, dailyByDate.get(date), response));
  });

  private toDayView(
    date: string,
    point: DailyWeatherPoint | undefined,
    response: WeatherResponse,
  ): EventWeatherDayView {
    const displayDate = new Date(`${date}T12:00:00Z`);
    const base = {
      key: date,
      weekday: this.dateTime.format(displayDate, {
        weekday: "short",
        timeZone: "UTC",
      }),
      date: this.dateTime.format(displayDate, {
        day: "numeric",
        month: "short",
        timeZone: "UTC",
      }),
    };
    if (!point) return { ...base, available: false, tone: "neutral" };

    const condition = point.condition ?? "unknown";
    const unit = this.accountPreferences.temperatureUnit(response.countryCode);
    return {
      ...base,
      available: true,
      icon: getWeatherStateIcon(condition),
      condition: WEATHER_STATES[condition].label,
      high:
        point.maxTemperatureC === undefined
          ? undefined
          : formatTemperature(point.maxTemperatureC, unit, false),
      low:
        point.minTemperatureC === undefined
          ? undefined
          : formatTemperature(point.minTemperatureC, unit, false),
      rainProbability: point.precipitationProbabilityPercent,
      tone: getDailyWeatherForecastIconTone({
        condition,
        temperatureC: point.maxTemperatureC,
      }),
    };
  }
}
