import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
} from "@angular/core";
import { MatButton } from "@angular/material/button";
import { MatIcon } from "@angular/material/icon";
import {
  MatTooltip,
  type TooltipPosition,
} from "@angular/material/tooltip";
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
import { DateTimeFormatService } from "../../../services/date-time-format.service";

interface ChangeSummary {
  full: string;
  beforeTime: string;
  time?: string;
  afterTime?: string;
}

@Component({
  selector: "app-map-weather-chip",
  imports: [MatButton, MatIcon, MatTooltip],
  host: {
    "[class.is-overview]": "appearance() === 'overview'",
  },
  templateUrl: "./map-weather-chip.component.html",
  styleUrl: "./map-weather-chip.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MapWeatherChipComponent {
  readonly response = input.required<WeatherResponse>();
  readonly appearance = input<"chip" | "overview">("chip");
  readonly tooltipPosition = input<TooltipPosition>("above");
  readonly pressed = output<void>();

  private readonly dateTime = inject(DateTimeFormatService);
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
      this.changeSummary().full,
    ].filter((part): part is string => part !== undefined);
    return $localize`:@@map.weather.open:Weather near map center: ${parts.join(", ")}`;
  });

  private getChangeSummary(): ChangeSummary {
    const response = this.response();
    const alertDisplay = this.primaryAlertDisplay();
    if (alertDisplay) {
      return this.untimedSummary(alertDisplay.label);
    }
    const current = this.current();
    if (!current) {
      return this.untimedSummary(
        $localize`:@@map.weather.unavailable:Weather unavailable`,
      );
    }

    if (this.isRainCondition(this.condition())) {
      const rainStopsAt = response.insights.rainStopsAt;
      if (rainStopsAt) {
        const time = this.formatTime(rainStopsAt);
        return this.timedSummary(
          $localize`:@@map.weather.rain_until:Rain until ${time}`,
          time,
        );
      }
      return this.untimedSummary($localize`:@@map.weather.rain_now:Rain now`);
    }

    const nextRain = (response.forecast ?? []).find(
      (point) =>
        new Date(point.time).getTime() > new Date(current.time).getTime() &&
        this.isRainExpected(point),
    );
    if (nextRain) {
      const time = this.formatTime(nextRain.time);
      return this.timedSummary(
        $localize`:@@map.weather.rain_at:Rain at ${time}`,
        time,
      );
    }

    const sunEvent = this.findNextSunEvent(
      current.isDay === false ? "sunrise" : "sunset",
      new Date(current.time).getTime(),
    );
    if (sunEvent) {
      const time = this.formatTime(sunEvent);
      return this.timedSummary(
        current.isDay === false
          ? $localize`:@@map.weather.sunrise_at:Sunrise ${time}`
          : $localize`:@@map.weather.sunset_at:Sunset ${time}`,
        time,
      );
    }

    return this.untimedSummary($localize`:@@map.weather.dry_now:Dry for now`);
  }

  private timedSummary(full: string, time: string): ChangeSummary {
    const timeIndex = full.indexOf(time);
    if (timeIndex === -1) return this.untimedSummary(full);

    return {
      full,
      beforeTime: full.slice(0, timeIndex).trimEnd(),
      time,
      afterTime: full.slice(timeIndex + time.length).trimStart() || undefined,
    };
  }

  private untimedSummary(full: string): ChangeSummary {
    return { full, beforeTime: full };
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
      return this.dateTime.format(value, options);
    } catch {
      delete options.timeZone;
      return this.dateTime.format(value, options);
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
