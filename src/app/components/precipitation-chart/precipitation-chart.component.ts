import {
  ChangeDetectionStrategy,
  Component,
  LOCALE_ID,
  computed,
  inject,
  input,
} from "@angular/core";
import { DateTimeFormatService } from "../../services/date-time-format.service";
import { hasMeaningfulPrecipitation } from "../../weather/weather-display";
import {
  MEASURABLE_PRECIPITATION_MM,
  formatPrecipitationMm,
  type PrecipitationPoint,
} from "../../weather/weather-precipitation";

/** SVG user units; the chart stretches horizontally to its container. */
const SLOT_WIDTH = 10;
const BAR_WIDTH = 7;
const CHART_HEIGHT = 48;
/** Smallest bar visible for any measurable amount. */
const MIN_BAR_HEIGHT = 2;
/**
 * Keep drizzle visually small: the y-axis never tops out below this amount,
 * so 0.3 mm/h does not fill the chart like a downpour would.
 */
const MIN_SCALE_MM = 2;

interface PrecipitationBar {
  key: string;
  x: number;
  width: number;
  amountY: number;
  amountHeight: number;
  chanceY: number;
  chanceHeight: number;
  label: string;
}

interface PrecipitationAxisLabel {
  key: string;
  label: string;
}

/**
 * Hourly precipitation as bars: the solid bar is the forecast amount in mm,
 * the faint column behind it is the chance of precipitation. Angular Material
 * has no chart component, so this is a small token-styled SVG that renders on
 * the server as well as in the browser.
 */
@Component({
  selector: "app-precipitation-chart",
  templateUrl: "./precipitation-chart.component.html",
  styleUrl: "./precipitation-chart.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PrecipitationChartComponent {
  private readonly dateTime = inject(DateTimeFormatService);
  private readonly locale = inject(LOCALE_ID);

  readonly points = input.required<readonly PrecipitationPoint[]>();
  /** IANA zone for the hour labels; defaults to the viewer's zone. */
  readonly timeZone = input<string>();

  protected readonly chartHeight = CHART_HEIGHT;
  protected readonly validPoints = computed(() =>
    this.points().filter((point) =>
      Number.isFinite(new Date(point.time).getTime()),
    ),
  );
  protected readonly viewBox = computed(
    () =>
      `0 0 ${Math.max(1, this.validPoints().length) * SLOT_WIDTH} ${CHART_HEIGHT}`,
  );
  /** A dry forecast is stated in words; empty bars would only add noise. */
  protected readonly showBars = computed(() =>
    this.validPoints().some((point) => hasMeaningfulPrecipitation(point)),
  );
  private readonly maxAmountMm = computed(() =>
    Math.max(0, ...this.validPoints().map((point) => point.precipitationMm ?? 0)),
  );
  protected readonly bars = computed<PrecipitationBar[]>(() => {
    const scale = Math.max(MIN_SCALE_MM, this.maxAmountMm());
    return this.validPoints().map((point, index) => {
      const amount = Math.max(0, point.precipitationMm ?? 0);
      const amountHeight =
        amount >= MEASURABLE_PRECIPITATION_MM
          ? Math.max(MIN_BAR_HEIGHT, (amount / scale) * CHART_HEIGHT)
          : 0;
      const chance = clampPercent(point.precipitationProbabilityPercent);
      const chanceHeight = (chance / 100) * CHART_HEIGHT;
      return {
        key: point.time,
        x: index * SLOT_WIDTH + (SLOT_WIDTH - BAR_WIDTH) / 2,
        width: BAR_WIDTH,
        amountY: CHART_HEIGHT - amountHeight,
        amountHeight,
        chanceY: CHART_HEIGHT - chanceHeight,
        chanceHeight,
        label: this.barLabel(point, amount, chance),
      };
    });
  });
  /** First, middle and last hour, so the axis stays readable at any width. */
  protected readonly axisLabels = computed<PrecipitationAxisLabel[]>(() => {
    const points = this.validPoints();
    if (points.length === 0) return [];
    const indexes = [
      ...new Set([0, Math.floor((points.length - 1) / 2), points.length - 1]),
    ];
    return indexes.map((index) => ({
      key: points[index].time,
      label: this.formatHour(points[index].time),
    }));
  });
  readonly summary = computed(() => {
    const points = this.validPoints();
    const max = this.maxAmountMm();
    if (max < MEASURABLE_PRECIPITATION_MM) {
      return $localize`:@@precipitationChart.dry:No precipitation expected`;
    }
    const peak = points.find((point) => (point.precipitationMm ?? 0) === max);
    const amount = formatPrecipitationMm(max, this.locale) ?? "";
    const time = peak ? this.formatHour(peak.time) : "";
    return $localize`:@@precipitationChart.peak:Up to ${amount}:amount: per hour, heaviest around ${time}:time:`;
  });

  private barLabel(
    point: PrecipitationPoint,
    amount: number,
    chance: number,
  ): string {
    const time = this.formatHour(point.time);
    const formattedAmount =
      formatPrecipitationMm(amount, this.locale) ?? "0 mm";
    return point.precipitationProbabilityPercent === undefined
      ? `${time}: ${formattedAmount}`
      : `${time}: ${formattedAmount}, ${chance}%`;
  }

  private formatHour(value: string): string {
    return this.dateTime.format(new Date(value), {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: this.timeZone(),
    });
  }
}

function clampPercent(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, Math.round(value)));
}
