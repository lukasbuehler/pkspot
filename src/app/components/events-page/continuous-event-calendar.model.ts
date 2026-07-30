import type { EventDiscoveryItem } from "../../services/search.service";
import {
  buildEventCalendarMonth,
  isMonthKey,
  shiftMonthKey,
  type EventCalendarDay,
  type EventCalendarWeek,
} from "./event-calendar.model";

export interface ContinuousEventCalendar {
  monthKeys: string[];
  weeks: EventCalendarWeek[];
  days: EventCalendarDay[];
  nowSeconds: number;
  queryStartSeconds: number;
  queryEndSeconds: number;
}

export function calendarMonthsAround(
  anchorMonth: string,
  monthsBefore = 2,
  monthsAfter = 3,
): string[] {
  const normalizedAnchor = isMonthKey(anchorMonth)
    ? anchorMonth
    : currentMonthKey();
  return Array.from(
    { length: monthsBefore + monthsAfter + 1 },
    (_, index) => shiftMonthKey(normalizedAnchor, index - monthsBefore),
  );
}

export function prependCalendarMonths(
  monthKeys: readonly string[],
  count: number,
): string[] {
  const first = monthKeys[0] ?? currentMonthKey();
  return [
    ...Array.from({ length: count }, (_, index) =>
      shiftMonthKey(first, index - count),
    ),
    ...monthKeys,
  ];
}

export function appendCalendarMonths(
  monthKeys: readonly string[],
  count: number,
): string[] {
  const last = monthKeys.at(-1) ?? currentMonthKey();
  return [
    ...monthKeys,
    ...Array.from({ length: count }, (_, index) =>
      shiftMonthKey(last, index + 1),
    ),
  ];
}

export function buildContinuousEventCalendar(
  monthKeys: readonly string[],
  locale: string,
  events: readonly EventDiscoveryItem[],
  now: Date = new Date(),
): ContinuousEventCalendar {
  const normalizedMonths = [
    ...new Set(monthKeys.filter((monthKey) => isMonthKey(monthKey))),
  ].sort();
  const months = (
    normalizedMonths.length > 0 ? normalizedMonths : [currentMonthKey(now)]
  ).map((monthKey) =>
    buildEventCalendarMonth(monthKey, locale, events, now),
  );
  const weeksByKey = new Map<string, EventCalendarWeek>();

  for (const month of months) {
    for (const week of month.weeks) {
      if (!weeksByKey.has(week.key)) weeksByKey.set(week.key, week);
    }
  }

  const weeks = [...weeksByKey.values()].sort((left, right) =>
    left.key.localeCompare(right.key),
  );
  return {
    monthKeys: months.map((month) => month.monthKey),
    weeks,
    days: weeks.flatMap((week) => week.days),
    nowSeconds: now.getTime() / 1000,
    queryStartSeconds: Math.min(
      ...months.map((month) => month.queryStartSeconds),
    ),
    queryEndSeconds: Math.max(
      ...months.map((month) => month.queryEndSeconds),
    ),
  };
}

function currentMonthKey(now: Date = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}
