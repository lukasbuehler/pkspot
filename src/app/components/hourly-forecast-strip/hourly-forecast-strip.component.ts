import {
  ChangeDetectionStrategy,
  Component,
  LOCALE_ID,
  computed,
  inject,
  input,
} from "@angular/core";
import { MatIcon } from "@angular/material/icon";
import {
  hasMeaningfulPrecipitation,
  type WeatherForecastIconTone,
} from "../../weather/weather-display";
import {
  MEASURABLE_PRECIPITATION_MM,
  formatPrecipitationMm,
} from "../../weather/weather-precipitation";

/**
 * Keep drizzle visually small: the bar scale never tops out below this
 * amount, so 0.3 mm/h does not fill the column like a downpour would.
 */
const MIN_SCALE_MM = 2;
/** Smallest visible bar for any measurable amount, in percent of the zone. */
const MIN_AMOUNT_PERCENT = 6;

/** One forecast hour, already formatted by the caller. */
export interface HourlyForecastColumn {
  key: string;
  time: string;
  icon: string;
  condition: string;
  iconTone: WeatherForecastIconTone;
  temperature?: string;
  precipitationMm?: number;
  precipitationProbabilityPercent?: number;
  highlighted?: boolean;
}

interface HourlyForecastColumnView extends HourlyForecastColumn {
  amountPercent: number;
  chancePercent: number;
  amountLabel?: string;
}

/**
 * Hourly forecast as one scrollable row of hour cards with a precipitation
 * bar above each card on a shared scale, so the bars read as a chart that
 * scrolls together with the hours. The faint column is the chance of
 * precipitation, the solid bar the forecast amount. Bars are hidden when no
 * hour is meaningfully wet.
 */
@Component({
  selector: "app-hourly-forecast-strip",
  imports: [MatIcon],
  templateUrl: "./hourly-forecast-strip.component.html",
  styleUrl: "./hourly-forecast-strip.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HourlyForecastStripComponent {
  private readonly locale = inject(LOCALE_ID);

  readonly hours = input.required<readonly HourlyForecastColumn[]>();

  private readonly maxAmountMm = computed(() =>
    Math.max(0, ...this.hours().map((hour) => hour.precipitationMm ?? 0)),
  );
  protected readonly showBars = computed(() =>
    this.hours().some((hour) => hasMeaningfulPrecipitation(hour)),
  );
  /** The mm row only exists when some hour has a measurable amount. */
  protected readonly showAmounts = computed(() =>
    this.columns().some((column) => !!column.amountLabel),
  );
  protected readonly columns = computed<HourlyForecastColumnView[]>(() => {
    const scale = Math.max(MIN_SCALE_MM, this.maxAmountMm());
    return this.hours().map((hour) => {
      const amount = Math.max(0, hour.precipitationMm ?? 0);
      return {
        ...hour,
        amountPercent:
          amount >= MEASURABLE_PRECIPITATION_MM
            ? Math.max(MIN_AMOUNT_PERCENT, Math.min(100, (amount / scale) * 100))
            : 0,
        chancePercent: clampPercent(hour.precipitationProbabilityPercent),
        amountLabel: formatPrecipitationMm(hour.precipitationMm, this.locale),
      };
    });
  });
  protected readonly summary = computed(() => {
    const max = this.maxAmountMm();
    if (max < MEASURABLE_PRECIPITATION_MM) {
      return $localize`:@@precipitationChart.dry:No precipitation expected`;
    }
    const peak = this.hours().find((hour) => (hour.precipitationMm ?? 0) === max);
    const amount = formatPrecipitationMm(max, this.locale) ?? "";
    const time = peak?.time ?? "";
    return $localize`:@@precipitationChart.peak:Up to ${amount}:amount: per hour, heaviest around ${time}:time:`;
  });
}

function clampPercent(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, Math.round(value)));
}
