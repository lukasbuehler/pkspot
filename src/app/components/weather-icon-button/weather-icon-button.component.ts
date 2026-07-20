import {
  ChangeDetectionStrategy,
  Component,
  booleanAttribute,
  computed,
  inject,
  input,
  output,
} from "@angular/core";
import { MatIconButton } from "@angular/material/button";
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
  status?: WeatherVisualStatus;
}

@Component({
  selector: "app-weather-icon-button",
  imports: [MatIconButton, MatIcon, MatTooltip],
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

    .weather-button.compact {
      width: 32px;
      height: 32px;
      --mat-icon-button-state-layer-size: 32px;
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
    const temperature = weather.temperatureC;
    const label = this.label() ?? weather.label ?? this.state().label;
    return temperature === undefined
      ? label
      : `${label}, ${formatTemperature(
          temperature,
          this.accountPreferences.temperatureUnit(
            this.weather().countryCode,
          ),
        )}`;
  });

  protected onPress(event: MouseEvent): void {
    if (this.stopPropagation()) {
      event.stopPropagation();
    }
    this.pressed.emit();
  }
}
