import {
  ChangeDetectionStrategy,
  Component,
  booleanAttribute,
  computed,
  inject,
  input,
  output,
} from "@angular/core";
import { MatButton, MatIconButton } from "@angular/material/button";
import { MatIcon } from "@angular/material/icon";
import { MatTooltip } from "@angular/material/tooltip";
import {
  WEATHER_STATES,
  type WeatherCondition,
  getWeatherStateIcon,
} from "../../weather/weather-display";
import type { WeatherVisualStatus } from "../../weather/weather-warnings";
import { AccountPreferencesService } from "../../services/account-preferences.service";
import { formatTemperature } from "../../weather/weather-temperature";

export interface WeatherIconData {
  condition: WeatherCondition;
  countryCode?: string;
  icon?: string;
  isDay?: boolean;
  label?: string;
  temperatureC?: number;
  minTemperatureC?: number;
  maxTemperatureC?: number;
  status?: WeatherVisualStatus;
}

export type WeatherIconButtonDisplay =
  | "icon-only"
  | "temperature"
  | "temperature-range";

@Component({
  selector: "app-weather-icon-button",
  imports: [MatButton, MatIconButton, MatIcon, MatTooltip],
  templateUrl: "./weather-icon-button.component.html",
  styles: `
    :host {
      display: inline-flex;
      flex: 0 0 auto;
    }

    .weather-button {
      width: 40px;
      height: 40px;
      color: var(--mat-sys-on-surface-variant);
      --mat-icon-button-state-layer-size: 40px;
    }

    .weather-button.with-value {
      width: auto;
      min-width: 0;
      padding-inline: 0.625rem;
      border-radius: 999px;
      gap: 0.25rem;
    }

    .weather-value {
      white-space: nowrap;
    }

    .weather-button.compact {
      width: 32px;
      height: 32px;
      --mat-icon-button-state-layer-size: 32px;
    }

    .weather-button.with-value.compact {
      width: auto;
      padding-inline: 0.5rem;
    }

    .weather-button.is-wet {
      color: var(--mat-sys-primary);
    }

    .weather-button.has-warning {
      color: var(--mat-sys-error);
    }

    mat-icon {
      width: 24px;
      height: 24px;
      font-size: 24px;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WeatherIconButtonComponent {
  private readonly accountPreferences = inject(AccountPreferencesService);

  readonly weather = input.required<WeatherIconData>();
  readonly label = input<string>();
  readonly icon = input<string>();
  readonly size = input<"compact" | "standard">("standard");
  readonly display = input<WeatherIconButtonDisplay>("icon-only");
  readonly stopPropagation = input(true, { transform: booleanAttribute });

  readonly pressed = output<void>();

  protected readonly state = computed(
    () => WEATHER_STATES[this.weather().condition],
  );
  protected readonly status = computed<WeatherVisualStatus>(() => {
    const weather = this.weather();
    if (weather.status) {
      return weather.status;
    }
    if (this.state().tone === "severe") {
      return "warning";
    }
    if (this.state().tone === "wet") {
      return "wet";
    }
    return this.state().tone === "sun" ? "great" : "neutral";
  });

  protected readonly resolvedIcon = computed(() => {
    const weather = this.weather();
    const override = this.icon() ?? weather.icon;
    if (override) {
      return override;
    }
    return getWeatherStateIcon(weather.condition, weather.isDay);
  });

  protected readonly accessibleLabel = computed(() => {
    const weather = this.weather();
    const label = this.label() ?? weather.label ?? this.state().label;
    const unit = this.accountPreferences.temperatureUnit(weather.countryCode);
    if (
      this.display() === "temperature-range" &&
      (weather.maxTemperatureC !== undefined ||
        weather.minTemperatureC !== undefined)
    ) {
      const high = weather.maxTemperatureC;
      const low = weather.minTemperatureC;
      if (high !== undefined && low !== undefined) {
        return $localize`:@@weather.button.range:${label}, high ${formatTemperature(high, unit)}, low ${formatTemperature(low, unit)}`;
      }
      const availableTemperature = high ?? low;
      return availableTemperature === undefined
        ? label
        : `${label}, ${formatTemperature(availableTemperature, unit)}`;
    }
    return weather.temperatureC === undefined
      ? label
      : `${label}, ${formatTemperature(weather.temperatureC, unit)}`;
  });

  protected readonly visibleTemperature = computed(() => {
    const weather = this.weather();
    const unit = this.accountPreferences.temperatureUnit(weather.countryCode);
    if (this.display() === "temperature-range") {
      const values = [weather.maxTemperatureC, weather.minTemperatureC]
        .filter((value): value is number => value !== undefined)
        .map((value) => formatTemperature(value, unit, false));
      return values.join(" / ");
    }
    return weather.temperatureC === undefined
      ? ""
      : formatTemperature(weather.temperatureC, unit, false);
  });

  protected onPress(event: MouseEvent): void {
    if (this.stopPropagation()) {
      event.stopPropagation();
    }
    this.pressed.emit();
  }
}
