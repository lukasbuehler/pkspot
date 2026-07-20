import {
  ChangeDetectionStrategy,
  Component,
  LOCALE_ID,
  computed,
  inject,
  input,
  output,
} from "@angular/core";
import { MatButton } from "@angular/material/button";
import { MatIcon } from "@angular/material/icon";
import { MatTooltip } from "@angular/material/tooltip";
import {
  WEATHER_STATES,
  getWeatherStateIcon,
  type WeatherCondition,
} from "../../../weather/weather-display";
import type {
  WeatherPoint,
  WeatherResponse,
} from "../../../weather/weather.models";
import { getWeatherVisualStatus } from "../../../weather/weather-warnings";
import { AccountPreferencesService } from "../../../services/account-preferences.service";
import { formatTemperature } from "../../../weather/weather-temperature";
import { getWeatherAlertDisplay } from "../../../weather/weather-alert-display";

@Component({
  selector: "app-map-weather-chip",
  imports: [MatButton, MatIcon, MatTooltip],
  host: {
    "[class.is-overview]": "appearance() === 'overview'",
    "[class.has-public-alert]": "primaryAlert() !== undefined",
  },
  templateUrl: "./map-weather-chip.component.html",
  styleUrl: "./map-weather-chip.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MapWeatherChipComponent {
  readonly response = input.required<WeatherResponse>();
  readonly appearance = input<"chip" | "overview">("chip");
  readonly pressed = output<void>();

  private readonly locale = inject(LOCALE_ID);
  private readonly accountPreferences = inject(AccountPreferencesService);
  protected readonly current = computed(
    () => this.response().current ?? this.response().forecast?.[0],
  );
  protected readonly primaryAlert = computed(
    () => this.response().alerts?.[0],
  );
  protected readonly primaryAlertDisplay = computed(() => {
    const alert = this.primaryAlert();
    return alert ? getWeatherAlertDisplay(alert) : undefined;
  });
  protected readonly condition = computed<WeatherCondition>(
    () => this.current()?.condition ?? "unknown",
  );
  protected readonly icon = computed(() =>
    this.primaryAlertDisplay()?.icon ??
    getWeatherStateIcon(this.condition(), this.current()?.isDay),
  );
  protected readonly temperatureC = computed(
    () => this.current()?.temperatureC,
  );
  protected readonly temperature = computed(() => {
    const temperatureC = this.temperatureC();
    return temperatureC === undefined
      ? undefined
      : formatTemperature(
          temperatureC,
          this.accountPreferences.temperatureUnit(
            this.response().countryCode,
          ),
          false,
        );
  });
  protected readonly status = computed(() =>
    getWeatherVisualStatus(this.response()),
  );
  protected readonly changeSummary = computed(() =>
    this.getChangeSummary(),
  );
  protected readonly accessibleLabel = computed(() => {
    const parts = [
      WEATHER_STATES[this.condition()].label,
      this.temperatureC() === undefined
        ? undefined
        : formatTemperature(
            this.temperatureC()!,
            this.accountPreferences.temperatureUnit(
              this.response().countryCode,
            ),
          ),
      this.changeSummary(),
    ].filter((part): part is string => part !== undefined);
    return $localize`:@@map.weather.open:Weather near map center: ${parts.join(", ")}`;
  });

  private getChangeSummary(): string {
    const response = this.response();
    const alertDisplay = this.primaryAlertDisplay();
    if (alertDisplay) {
      return alertDisplay.label;
    }
    const current = this.current();
    if (!current) {
      return $localize`:@@map.weather.unavailable:Weather unavailable`;
    }

    if (this.isRainCondition(this.condition())) {
      const rainStopsAt = response.insights.rainStopsAt;
      return rainStopsAt
        ? $localize`:@@map.weather.rain_until:Rain until ${this.formatTime(rainStopsAt)}`
        : $localize`:@@map.weather.rain_now:Rain now`;
    }

    const nextRain = (response.forecast ?? []).find(
      (point) =>
        new Date(point.time).getTime() > new Date(current.time).getTime() &&
        this.isRainExpected(point),
    );
    if (nextRain) {
      return $localize`:@@map.weather.rain_at:Rain at ${this.formatTime(nextRain.time)}`;
    }

    const sunEvent = this.findNextSunEvent(
      current.isDay === false ? "sunrise" : "sunset",
      new Date(current.time).getTime(),
    );
    if (sunEvent) {
      return current.isDay === false
        ? $localize`:@@map.weather.sunrise_at:Sunrise ${this.formatTime(sunEvent)}`
        : $localize`:@@map.weather.sunset_at:Sunset ${this.formatTime(sunEvent)}`;
    }

    return $localize`:@@map.weather.dry_now:Dry for now`;
  }

  private findNextSunEvent(
    field: "sunrise" | "sunset",
    after: number,
  ): string | undefined {
    return [
      this.current()?.[field],
      ...(this.response().forecast ?? []).map((point) => point[field]),
      ...(this.response().dailyForecast ?? []).map((point) => point[field]),
    ]
      .filter((value): value is string => value !== undefined)
      .filter((value) => new Date(value).getTime() > after)
      .sort(
        (left, right) =>
          new Date(left).getTime() - new Date(right).getTime(),
      )[0];
  }

  private formatTime(value: string): string {
    const options: Intl.DateTimeFormatOptions = {
      hour: "2-digit",
      minute: "2-digit",
    };
    if (this.response().timeZone) {
      options.timeZone = this.response().timeZone;
    }
    try {
      return new Intl.DateTimeFormat(this.locale, options).format(
        new Date(value),
      );
    } catch {
      delete options.timeZone;
      return new Intl.DateTimeFormat(this.locale, options).format(
        new Date(value),
      );
    }
  }

  private isRainExpected(point: WeatherPoint): boolean {
    return (
      this.isRainCondition(point.condition ?? "unknown") ||
      (point.precipitationProbabilityPercent ?? 0) >= 40 ||
      (point.precipitationMm ?? 0) >= 0.2
    );
  }

  private isRainCondition(condition: WeatherCondition): boolean {
    return [
      "drizzle",
      "rain",
      "heavy-rain",
      "freezing-rain",
      "sleet",
      "thunderstorm",
      "hail",
    ].includes(condition);
  }
}
