/**
 * Formats a straight-line distance in kilometres with locale-aware units.
 * Short distances keep one decimal so "1.2 km" stays distinguishable from
 * "1.8 km"; longer ones are rounded.
 */
export function formatDistanceKm(
  distanceKm: number | null | undefined,
  locale: string,
): string | null {
  if (distanceKm === null || distanceKm === undefined) return null;
  if (!Number.isFinite(distanceKm) || distanceKm < 0) return null;
  return new Intl.NumberFormat(locale, {
    style: "unit",
    unit: "kilometer",
    maximumFractionDigits: distanceKm < 10 ? 1 : 0,
  }).format(distanceKm);
}
