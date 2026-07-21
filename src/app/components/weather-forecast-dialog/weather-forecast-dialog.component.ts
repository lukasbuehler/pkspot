import {
  ChangeDetectionStrategy,
  Component,
  LOCALE_ID,
  computed,
  inject,
} from "@angular/core";
import { MatButton, MatIconButton } from "@angular/material/button";
import {
  MAT_DIALOG_DATA,
  MatDialogClose,
  MatDialogContent,
  MatDialogTitle,
} from "@angular/material/dialog";
import { MatIcon } from "@angular/material/icon";
import {
  WEATHER_STATES,
  WEATHER_WARNINGS,
  type WeatherCondition,
  type WeatherForecastIconTone,
  type WeatherWarningDefinition,
  getDailyWeatherForecastIconTone,
  getWeatherForecastIconTone,
  getWeatherStateIcon,
} from "../../weather/weather-display";
import type {
  DailyWeatherPoint,
  WeatherAlert,
  WeatherPoint,
  WeatherResponse,
} from "../../weather/weather.models";
import {
  getWeatherVisualStatus,
  getWeatherWarnings,
} from "../../weather/weather-warnings";
import { AccountPreferencesService } from "../../services/account-preferences.service";
import { DateTimeFormatService } from "../../services/date-time-format.service";
import { formatTemperature } from "../../weather/weather-temperature";
import { getWeatherAlertDisplay } from "../../weather/weather-alert-display";

export interface WeatherForecastDialogData {
  spotName: string;
  response: WeatherResponse;
  countryCode?: string;
  covered?: boolean;
  context?: "spot" | "map-region";
}

interface WeatherHourView {
  time: string;
  icon: string;
  condition: string;
  temperature?: string;
  rainProbability?: number;
  precipitationMm?: number;
  iconTone: WeatherForecastIconTone;
}

interface WeatherDayView {
  date: string;
  weekday: string;
  icon: string;
  condition: string;
  maxTemperature?: string;
  minTemperature?: string;
  rainProbability?: number;
  precipitationMm?: number;
  iconTone: WeatherForecastIconTone;
}

interface WeatherWarningGroup {
  tone: WeatherWarningDefinition["tone"];
  warnings: WeatherWarningDefinition[];
}

interface WeatherAlertView extends WeatherAlert {
  tone: "primary" | "error";
  categoryLabel: string;
  icon: string;
  activeUntil?: string;
  hasDetails: boolean;
}

@Component({
  selector: "app-weather-forecast-dialog",
  imports: [
    MatButton,
    MatDialogClose,
    MatDialogContent,
    MatDialogTitle,
    MatIcon,
    MatIconButton,
  ],
  templateUrl: "./weather-forecast-dialog.component.html",
  styleUrl: "./weather-forecast-dialog.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WeatherForecastDialogComponent {
  readonly data = inject<WeatherForecastDialogData>(MAT_DIALOG_DATA);
  private readonly locale = inject(LOCALE_ID);
  private readonly accountPreferences = inject(AccountPreferencesService);
  private readonly response = this.data.response;
  private readonly dateTime = inject(DateTimeFormatService);
  private readonly relativeTimeFormatter = new Intl.RelativeTimeFormat(
    this.locale,
    { numeric: "always" },
  );

  protected readonly current =
    this.response.current ?? this.response.forecast?.[0];
  protected readonly currentCondition = this.getCondition(this.current);
  protected readonly currentState = WEATHER_STATES[this.currentCondition];
  protected readonly currentIcon = getWeatherStateIcon(
    this.currentCondition,
    this.current?.isDay,
  );
  protected readonly visualStatus = getWeatherVisualStatus(this.response, {
    covered: this.data.covered,
  });
  protected readonly currentTemperature = computed(() =>
    this.displayTemperature(this.current?.temperatureC, true),
  );
  protected readonly apparentTemperature = computed(() =>
    this.displayTemperature(this.current?.apparentTemperatureC, true),
  );
  protected readonly narrative = this.buildNarrative();
  protected readonly surfaceNote = this.buildSurfaceNote();
  protected readonly daylightSummary = this.buildDaylightSummary();
  protected readonly cloudCoverSummary =
    this.current?.cloudCoverPercent === undefined
      ? undefined
      : $localize`:@@weather.dialog.cloud_cover:Current cloud cover: ${Math.round(this.current.cloudCoverPercent)}%.`;
  protected readonly warningGroups = this.groupWarnings(this.buildWarnings());
  protected readonly alerts = (this.response.alerts ?? []).map(
    (alert): WeatherAlertView => {
      const display = getWeatherAlertDisplay(alert);
      return {
        ...alert,
        tone:
          alert.severity === "severe" || alert.severity === "extreme"
            ? "error"
            : "primary",
        categoryLabel: display.label,
        icon: display.icon,
        activeUntil: alert.expiresAt
          ? $localize`:@@weather.alert.active_until:Active until ${this.formatTime(alert.expiresAt)}`
          : undefined,
        hasDetails:
          Boolean(alert.description) ||
          alert.instructions.length > 0 ||
          alert.safetyRecommendations.length > 0,
      };
    },
  );
  protected readonly alertSourceLabel =
    $localize`:@@weather.alert.source:Source:`;
  protected readonly hours = computed(() =>
    (this.response.forecast ?? []).map(
      (point): WeatherHourView => ({
        time: this.formatTime(point.time),
        icon: getWeatherStateIcon(this.getCondition(point), point.isDay),
        condition: WEATHER_STATES[this.getCondition(point)].label,
        temperature: this.displayTemperature(point.temperatureC),
        rainProbability: point.precipitationProbabilityPercent,
        precipitationMm: point.precipitationMm,
        iconTone: getWeatherForecastIconTone({
          condition: this.getCondition(point),
          temperatureC: point.temperatureC,
          uvIndex: point.uvIndex,
          precipitationMm: point.precipitationMm,
          precipitationProbabilityPercent:
            point.precipitationProbabilityPercent,
          isDay: point.isDay,
        }),
      }),
    ),
  );
  protected readonly days = computed(() =>
    (this.response.dailyForecast ?? [])
      .slice(0, 8)
      .map((point) => this.toDayView(point)),
  );
  protected readonly providerUrl =
    this.response.provider === "open-meteo"
      ? "https://open-meteo.com/"
      : "https://developers.google.com/maps/documentation/weather";
  protected readonly attribution =
    this.response.attribution ??
    (this.response.provider === "open-meteo"
      ? "Weather: Open-Meteo"
      : "Weather: Google Weather");

  private getCondition(point: WeatherPoint | undefined): WeatherCondition {
    return point?.condition ?? "unknown";
  }

  private toDayView(point: DailyWeatherPoint): WeatherDayView {
    const condition = point.condition ?? "unknown";
    const date = new Date(`${point.date}T12:00:00Z`);
    return {
      date: this.dateTime.format(date, {
        day: "numeric",
        month: "numeric",
        timeZone: "UTC",
      }),
      weekday: this.dateTime.format(date, {
        weekday: "short",
        timeZone: "UTC",
      }),
      icon: getWeatherStateIcon(condition),
      condition: WEATHER_STATES[condition].label,
      maxTemperature: this.displayTemperature(point.maxTemperatureC),
      minTemperature: this.displayTemperature(point.minTemperatureC),
      rainProbability: point.precipitationProbabilityPercent,
      precipitationMm: point.precipitationMm,
      iconTone: getDailyWeatherForecastIconTone({
        condition,
        temperatureC: point.maxTemperatureC,
      }),
    };
  }

  private buildNarrative(): string {
    const insights = this.response.insights;
    const isRaining = this.isRainCondition(this.currentCondition);
    const nextRain = this.findNextRain();

    if (isRaining && insights.rainStopsAt) {
      const time = this.formatTime(insights.rainStopsAt);
      return $localize`:@@weather.dialog.raining_until:Rain is likely now and should ease around ${time}.`;
    }
    if (isRaining) {
      return $localize`:@@weather.dialog.raining_now:Rain is likely now.`;
    }
    if (nextRain) {
      const time = this.formatTime(nextRain.time);
      return $localize`:@@weather.dialog.dry_until:Conditions should stay dry until around ${time}, when rain is expected.`;
    }
    if (
      insights.precipitationRisk === "none" ||
      insights.precipitationRisk === "low"
    ) {
      return $localize`:@@weather.dialog.no_rain:No meaningful rain is expected in the next 12 hours.`;
    }
    return $localize`:@@weather.dialog.rain_possible:Rain is possible later.`;
  }

  private isRainExpected(point: WeatherPoint): boolean {
    return (
      this.isRainCondition(this.getCondition(point)) ||
      (point.precipitationProbabilityPercent ?? 0) >= 40 ||
      (point.precipitationMm ?? 0) >= 0.2
    );
  }

  private findNextRain(): WeatherPoint | undefined {
    const currentTime = this.current
      ? new Date(this.current.time).getTime()
      : -Infinity;
    return (this.response.forecast ?? []).find(
      (point) =>
        new Date(point.time).getTime() > currentTime &&
        this.isRainExpected(point),
    );
  }

  private isRainCondition(condition: WeatherCondition): boolean {
    return (
      condition === "drizzle" ||
      condition === "rain" ||
      condition === "heavy-rain" ||
      condition === "freezing-rain" ||
      condition === "sleet" ||
      condition === "thunderstorm" ||
      condition === "hail"
    );
  }

  private buildSurfaceNote(): string | undefined {
    if (this.data.covered) {
      return undefined;
    }
    const drying = this.response.insights.surfaceDrying;
    if (drying.status === "wet") {
      return $localize`:@@weather.dialog.surface_wet:Training surfaces are likely wet.`;
    }
    if (drying.status === "drying" && drying.estimatedDryAt) {
      const nextRain = this.findNextRain();
      if (
        nextRain &&
        new Date(nextRain.time).getTime() <=
          new Date(drying.estimatedDryAt).getTime()
      ) {
        return undefined;
      }
      const time = this.formatTime(drying.estimatedDryAt);
      return $localize`:@@weather.dialog.surface_drying:Exposed surfaces may dry around ${time}. This is only an estimate.`;
    }
    if (drying.status === "drying") {
      return $localize`:@@weather.dialog.surface_drying_unknown:Exposed surfaces are probably drying, but the timing is uncertain.`;
    }
    if (drying.status === "likely_dry") {
      return $localize`:@@weather.dialog.surface_dry:Exposed surfaces are likely dry.`;
    }
    return undefined;
  }

  private buildDaylightSummary(): string | undefined {
    if (!this.current) {
      return undefined;
    }
    const currentTime = new Date(this.current.time).getTime();
    if (!Number.isFinite(currentTime)) {
      return undefined;
    }

    if (this.current.isDay === true) {
      const sunset = this.findNextSunEvent("sunset", currentTime);
      if (!sunset) {
        return undefined;
      }
      const time = this.formatTime(sunset);
      const remaining = this.formatRelativeDuration(
        new Date(sunset).getTime() - currentTime,
      );
      return $localize`:@@weather.dialog.daylight.sunset:Sunset at ${time} (${remaining}).`;
    }

    if (this.current.isDay === false) {
      const sunrise = this.findNextSunEvent("sunrise", currentTime);
      if (!sunrise) {
        return $localize`:@@weather.dialog.daylight.dark:It is dark now.`;
      }
      const time = this.formatTime(sunrise);
      return $localize`:@@weather.dialog.daylight.sunrise:It is dark now. Sunrise is at ${time}.`;
    }

    return undefined;
  }

  private findNextSunEvent(
    field: "sunrise" | "sunset",
    after: number,
  ): string | undefined {
    const candidates = [
      this.current?.[field],
      ...(this.response.forecast ?? []).map((point) => point[field]),
      ...(this.response.dailyForecast ?? []).map((point) => point[field]),
    ]
      .filter((value): value is string => value !== undefined)
      .filter((value) => new Date(value).getTime() > after)
      .sort(
        (a, b) => new Date(a).getTime() - new Date(b).getTime(),
      );
    return candidates[0];
  }

  private formatRelativeDuration(durationMs: number): string {
    const minutes = Math.max(1, Math.round(durationMs / (60 * 1000)));
    if (minutes < 120) {
      return this.relativeTimeFormatter.format(minutes, "minute");
    }
    const hours = Math.round((minutes / 60) * 2) / 2;
    return this.relativeTimeFormatter.format(hours, "hour");
  }

  private buildWarnings(): WeatherWarningDefinition[] {
    return getWeatherWarnings(this.response, {
      covered: this.data.covered,
    }).map(
      (warning) => WEATHER_WARNINGS[warning],
    );
  }

  private groupWarnings(
    warnings: WeatherWarningDefinition[],
  ): WeatherWarningGroup[] {
    const tones: WeatherWarningDefinition["tone"][] = ["error", "primary"];
    return tones
      .map((tone) => ({
        tone,
        warnings: warnings.filter((warning) => warning.tone === tone),
      }))
      .filter((group) => group.warnings.length > 0);
  }

  private formatTime(value: string): string {
    const options: Intl.DateTimeFormatOptions = {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: this.response.timeZone,
    };
    try {
      return this.dateTime.format(value, options);
    } catch {
      delete options.timeZone;
      return this.dateTime.format(value, options);
    }
  }

  private displayTemperature(
    value: number | undefined,
    includeUnit = false,
  ): string | undefined {
    return value === undefined
      ? undefined
      : formatTemperature(
          value,
          this.accountPreferences.temperatureUnit(
            this.response.countryCode ?? this.data.countryCode,
          ),
          includeUnit,
        );
  }

}
