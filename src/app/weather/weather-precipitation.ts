import type { WeatherPoint } from "./weather.models";

/** Hourly amounts below this are rounding noise, not rain a rider would notice. */
export const MEASURABLE_PRECIPITATION_MM = 0.1;

export type PrecipitationPoint = Pick<
  WeatherPoint,
  "time" | "precipitationMm" | "precipitationProbabilityPercent"
>;

/**
 * Formats a precipitation amount in millimetres. Amounts under 0.1 mm are
 * omitted so dry hours do not show a misleading "0 mm" label.
 */
export function formatPrecipitationMm(
  value: number | undefined,
  locale: string,
): string | undefined {
  if (value === undefined || !Number.isFinite(value)) return undefined;
  if (value < MEASURABLE_PRECIPITATION_MM) return undefined;
  const amount = new Intl.NumberFormat(locale, {
    maximumFractionDigits: value < 10 ? 1 : 0,
  }).format(value);
  return `${amount} mm`;
}
