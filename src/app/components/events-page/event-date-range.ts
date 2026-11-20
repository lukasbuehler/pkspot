/** Date windows for the upcoming-events list. */
export const EVENT_DATE_RANGES = ["weekend", "week", "month"] as const;
export type EventDateRange = (typeof EVENT_DATE_RANGES)[number];

export function isEventDateRange(value: unknown): value is EventDateRange {
  return EVENT_DATE_RANGES.includes(value as EventDateRange);
}

export function eventDateRangeLabel(range: EventDateRange): string {
  switch (range) {
    case "weekend":
      return $localize`:@@events.date_range.weekend:This weekend`;
    case "week":
      return $localize`:@@events.date_range.week:Next 7 days`;
    case "month":
      return $localize`:@@events.date_range.month:Next 30 days`;
  }
}

/**
 * The search window for a date range, in epoch seconds and local time: events
 * that are still running at `endsAfterSeconds` and start by `startsBeforeSeconds`.
 * "This weekend" is the coming Saturday and Sunday, or the rest of the
 * weekend when it has already started.
 */
export function eventDateRangeWindow(
  range: EventDateRange,
  now: Date,
): { endsAfterSeconds: number; startsBeforeSeconds: number } {
  const nowSeconds = Math.floor(now.getTime() / 1000);
  const endOfDay = (date: Date) => {
    const end = new Date(date);
    end.setHours(23, 59, 59, 0);
    return Math.floor(end.getTime() / 1000);
  };
  const addDays = (date: Date, days: number) => {
    const next = new Date(date);
    next.setDate(next.getDate() + days);
    return next;
  };

  if (range === "weekend") {
    const day = now.getDay(); // 0 Sunday … 6 Saturday
    const daysToSunday = day === 0 ? 0 : 7 - day;
    const sunday = addDays(now, daysToSunday);
    const saturday = addDays(sunday, -1);
    saturday.setHours(0, 0, 0, 0);
    return {
      endsAfterSeconds: Math.max(nowSeconds, Math.floor(saturday.getTime() / 1000)),
      startsBeforeSeconds: endOfDay(sunday),
    };
  }
  const days = range === "week" ? 7 : 30;
  return { endsAfterSeconds: nowSeconds, startsBeforeSeconds: endOfDay(addDays(now, days - 1)) };
}
