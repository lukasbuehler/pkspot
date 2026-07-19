import {
  ChangeDetectionStrategy,
  Component,
  LOCALE_ID,
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
  type WeatherWarning,
  type WeatherWarningDefinition,
  getWeatherStateIcon,
} from "../../weather/weather-display";
import type {
  WeatherPoint,
  WeatherResponse,
} from "../../weather/weather.models";

export interface WeatherForecastDialogData {
  spotName: string;
  response: WeatherResponse;
}

interface WeatherHourView {
  time: string;
  icon: string;
  condition: string;
  temperature?: number;
  rainProbability?: number;
  precipitationMm?: number;
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
  private readonly response = this.data.response;
  private readonly timeFormatter = this.createTimeFormatter();

  protected readonly current =
    this.response.current ?? this.response.forecast?.[0];
  protected readonly currentCondition = this.getCondition(this.current);
  protected readonly currentState = WEATHER_STATES[this.currentCondition];
  protected readonly currentIcon = getWeatherStateIcon(
    this.currentCondition,
    this.current?.isDay,
  );
  protected readonly currentTemperature =
    this.current?.temperatureC === undefined
      ? undefined
      : Math.round(this.current.temperatureC);
  protected readonly apparentTemperature =
    this.current?.apparentTemperatureC === undefined
      ? undefined
      : Math.round(this.current.apparentTemperatureC);
  protected readonly narrative = this.buildNarrative();
  protected readonly surfaceNote = this.buildSurfaceNote();
  protected readonly warnings = this.buildWarnings();
  protected readonly hours = (this.response.forecast ?? []).map(
    (point): WeatherHourView => ({
      time: this.formatTime(point.time),
      icon: getWeatherStateIcon(this.getCondition(point), point.isDay),
      condition: WEATHER_STATES[this.getCondition(point)].label,
      temperature:
        point.temperatureC === undefined
          ? undefined
          : Math.round(point.temperatureC),
      rainProbability: point.precipitationProbabilityPercent,
      precipitationMm: point.precipitationMm,
    }),
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

  private buildNarrative(): string {
    const insights = this.response.insights;
    const isRaining =
      (this.current?.precipitationProbabilityPercent ?? 0) >= 40 ||
      (this.current?.precipitationMm ?? 0) >= 0.2;

    if (isRaining && insights.rainStopsAt) {
      const time = this.formatTime(insights.rainStopsAt);
      return $localize`:@@weather.dialog.raining_until:Rain is likely now and should ease around ${time}.`;
    }
    if (isRaining) {
      return $localize`:@@weather.dialog.raining_now:Rain is likely now.`;
    }
    if (insights.rainStartsAt) {
      const time = this.formatTime(insights.rainStartsAt);
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

  private buildSurfaceNote(): string | undefined {
    const drying = this.response.insights.surfaceDrying;
    if (drying.status === "wet") {
      return $localize`:@@weather.dialog.surface_wet:Training surfaces are likely wet.`;
    }
    if (drying.status === "drying" && drying.estimatedDryAt) {
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

  private buildWarnings(): WeatherWarningDefinition[] {
    const warnings = new Set<WeatherWarning>();
    const points = [this.current, ...(this.response.forecast ?? [])].filter(
      (point): point is WeatherPoint => point !== undefined,
    );
    const conditions = new Set(points.map((point) => this.getCondition(point)));

    if (conditions.has("thunderstorm")) warnings.add("thunderstorm");
    if (conditions.has("hail")) warnings.add("hail");
    if (conditions.has("heavy-rain")) warnings.add("heavy-rain");
    if (
      conditions.has("freezing-rain") ||
      points.some(
        (point) =>
          (point.temperatureC ?? Infinity) <= 0 &&
          (point.precipitationMm ?? 0) > 0,
      )
    ) {
      warnings.add("ice-risk");
    }
    if (this.response.insights.sunExposure === "harsh") {
      warnings.add("harsh-sun");
    } else if ((this.current?.uvIndex ?? 0) >= 6) {
      warnings.add("high-uv");
    }
    if (points.some((point) => (point.windSpeedKmh ?? 0) >= 40)) {
      warnings.add("strong-wind");
    }
    if (this.response.insights.surfaceDrying.status === "wet") {
      warnings.add("wet-surface");
    }

    return [...warnings].map((warning) => WEATHER_WARNINGS[warning]);
  }

  private formatTime(value: string): string {
    return this.timeFormatter.format(new Date(value));
  }

  private createTimeFormatter(): Intl.DateTimeFormat {
    const options: Intl.DateTimeFormatOptions = {
      hour: "2-digit",
      minute: "2-digit",
    };
    if (this.response.timeZone) {
      options.timeZone = this.response.timeZone;
    }
    try {
      return new Intl.DateTimeFormat(this.locale, options);
    } catch {
      delete options.timeZone;
      return new Intl.DateTimeFormat(this.locale, options);
    }
  }
}
