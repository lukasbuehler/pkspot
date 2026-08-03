import type { EventDiscoveryItem } from "../../services/search.service";

const DAY_MS = 86_400_000;
export const CALENDAR_VISIBLE_LANES = 3;
export const CALENDAR_COMPACT_ICON_LIMIT = 2;

export interface EventCalendarDay {
  key: string;
  date: Date;
  dayNumber: number;
  inSelectedMonth: boolean;
  isToday: boolean;
  isPast: boolean;
  events: EventDiscoveryItem[];
  indicatorEvents: EventDiscoveryItem[];
  allEventsPast: boolean;
  hiddenEventCount: number;
}

export interface EventCalendarSegment {
  id: string;
  event: EventDiscoveryItem;
  startColumn: number;
  span: number;
  lane: number;
  continuesBefore: boolean;
  continuesAfter: boolean;
}

export interface EventCalendarWeek {
  key: string;
  days: EventCalendarDay[];
  segments: EventCalendarSegment[];
}

export interface EventCalendarMonth {
  monthKey: string;
  nowSeconds: number;
  firstDay: Date;
  lastDay: Date;
  weeks: EventCalendarWeek[];
  days: EventCalendarDay[];
  queryStartSeconds: number;
  queryEndSeconds: number;
}

export function currentMonthKey(now: Date = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export function isMonthKey(value: string): boolean {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/u.test(value)) return false;
  const [year, month] = value.split("-").map(Number);
  return year >= 1970 && year <= 2200 && month >= 1 && month <= 12;
}

export function shiftMonthKey(monthKey: string, offset: number): string {
  const [year, month] = parseMonthKey(monthKey);
  const shifted = new Date(Date.UTC(year, month - 1 + offset, 1, 12));
  return `${shifted.getUTCFullYear()}-${String(
    shifted.getUTCMonth() + 1,
  ).padStart(2, "0")}`;
}

export function eventLocalDateKey(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone,
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

export function eventLocalDateKeys(event: EventDiscoveryItem): string[] {
  if (event.timing) {
    return dateKeysBetween(
      event.timing.start_date,
      event.timing.end_date ?? event.timing.start_date,
    );
  }
  if (!event.timeZone) return [];
  const start = new Date(event.startSeconds * 1000);
  const inclusiveEnd = new Date(
    Math.max(start.getTime(), event.endSeconds * 1000 - 1),
  );
  const first = dateFromKey(eventLocalDateKey(start, event.timeZone));
  const last = dateFromKey(eventLocalDateKey(inclusiveEnd, event.timeZone));
  const keys: string[] = [];
  for (
    let cursor = first;
    cursor.getTime() <= last.getTime();
    cursor = addDays(cursor, 1)
  ) {
    keys.push(dateKey(cursor));
  }
  return keys;
}

function dateKeysBetween(startKey: string, endKey: string): string[] {
  const first = dateFromKey(startKey);
  const last = dateFromKey(endKey);
  const keys: string[] = [];
  for (
    let cursor = first;
    cursor.getTime() <= last.getTime();
    cursor = addDays(cursor, 1)
  ) {
    keys.push(dateKey(cursor));
  }
  return keys;
}

export function buildEventCalendarMonth(
  monthKey: string,
  locale: string,
  events: readonly EventDiscoveryItem[],
  now: Date = new Date(),
): EventCalendarMonth {
  const [year, month] = parseMonthKey(monthKey);
  const monthStart = new Date(Date.UTC(year, month - 1, 1, 12));
  const monthEnd = new Date(Date.UTC(year, month, 0, 12));
  const weekStart = localeWeekStart(locale);
  const leadingDays = (monthStart.getUTCDay() - weekStart + 7) % 7;
  const firstDay = addDays(monthStart, -leadingDays);
  const trailingDays = (weekStart + 6 - monthEnd.getUTCDay() + 7) % 7;
  const lastDay = addDays(monthEnd, trailingDays);
  const todayKey = currentLocalDateKey(now);
  const nowSeconds = now.getTime() / 1000;
  const eventDays = new Map<string, EventDiscoveryItem[]>();

  for (const event of events) {
    for (const key of eventLocalDateKeys(event)) {
      if (key < dateKey(firstDay) || key > dateKey(lastDay)) continue;
      const entries = eventDays.get(key) ?? [];
      entries.push(event);
      eventDays.set(key, entries);
    }
  }

  const days: EventCalendarDay[] = [];
  for (
    let cursor = firstDay;
    cursor.getTime() <= lastDay.getTime();
    cursor = addDays(cursor, 1)
  ) {
    const key = dateKey(cursor);
    const eventsForDay = [...(eventDays.get(key) ?? [])].sort(compareEvents);
    days.push({
      key,
      date: cursor,
      dayNumber: cursor.getUTCDate(),
      inSelectedMonth: cursor.getUTCMonth() === month - 1,
      isToday: key === todayKey,
      isPast: key < todayKey,
      events: eventsForDay,
      indicatorEvents: [...eventsForDay]
        .sort((left, right) => compareIndicatorEvents(left, right, key))
        .slice(0, CALENDAR_COMPACT_ICON_LIMIT),
      allEventsPast:
        eventsForDay.length > 0 &&
        eventsForDay.every((event) => event.endSeconds < nowSeconds),
      hiddenEventCount: 0,
    });
  }

  const weeks: EventCalendarWeek[] = [];
  for (let index = 0; index < days.length; index += 7) {
    const weekDays = days.slice(index, index + 7);
    const segments = buildWeekSegments(weekDays);
    for (const day of weekDays) {
      day.hiddenEventCount = day.events.filter((event) => {
        const segment = segments.find(
          (candidate) =>
            candidate.id === event.id &&
            candidate.startColumn <= weekDays.indexOf(day) + 1 &&
            candidate.startColumn + candidate.span >
              weekDays.indexOf(day) + 1,
        );
        return !segment || segment.lane >= CALENDAR_VISIBLE_LANES;
      }).length;
    }
    weeks.push({
      key: weekDays[0]?.key ?? String(index),
      days: weekDays,
      segments: segments.filter(
        (segment) => segment.lane < CALENDAR_VISIBLE_LANES,
      ),
    });
  }

  return {
    monthKey,
    nowSeconds,
    firstDay,
    lastDay,
    weeks,
    days,
    queryStartSeconds: Math.floor(
      (utcMidnight(firstDay).getTime() - DAY_MS) / 1000,
    ),
    queryEndSeconds: Math.ceil(
      (utcMidnight(lastDay).getTime() + 2 * DAY_MS) / 1000,
    ),
  };
}

export function calendarWeekdayLabels(
  locale: string,
  dateStyle: "short" | "narrow" = "short",
): string[] {
  const start = localeWeekStart(locale);
  const sunday = new Date(Date.UTC(2026, 0, 4, 12));
  const formatter = new Intl.DateTimeFormat(locale, { weekday: dateStyle });
  return Array.from({ length: 7 }, (_, index) =>
    formatter.format(addDays(sunday, (start + index) % 7)),
  );
}

function buildWeekSegments(
  days: readonly EventCalendarDay[],
): EventCalendarSegment[] {
  if (days.length === 0) return [];
  const weekStart = days[0].key;
  const weekEnd = days.at(-1)?.key ?? weekStart;
  const events = new Map<string, EventDiscoveryItem>();
  for (const day of days) {
    for (const event of day.events) events.set(event.id, event);
  }

  const candidates = [...events.values()]
    .map((event) => {
      const keys = eventLocalDateKeys(event);
      const startKey = keys[0] ?? weekStart;
      const endKey = keys.at(-1) ?? startKey;
      const clippedStart = startKey < weekStart ? weekStart : startKey;
      const clippedEnd = endKey > weekEnd ? weekEnd : endKey;
      const startColumn =
        days.findIndex((day) => day.key === clippedStart) + 1;
      const endColumn = days.findIndex((day) => day.key === clippedEnd) + 1;
      return {
        id: event.id,
        event,
        startColumn,
        span: endColumn - startColumn + 1,
        continuesBefore: startKey < weekStart,
        continuesAfter: endKey > weekEnd,
      };
    })
    .filter((segment) => segment.startColumn > 0 && segment.span > 0)
    .sort(
      (left, right) =>
        left.startColumn - right.startColumn ||
        right.span - left.span ||
        compareEvents(left.event, right.event),
    );

  const occupiedUntil: number[] = [];
  return candidates.map((candidate) => {
    let lane = occupiedUntil.findIndex(
      (lastColumn) => lastColumn < candidate.startColumn,
    );
    if (lane < 0) lane = occupiedUntil.length;
    occupiedUntil[lane] = candidate.startColumn + candidate.span - 1;
    return { ...candidate, lane };
  });
}

function localeWeekStart(locale: string): number {
  try {
    const localeWithWeekInfo = new Intl.Locale(locale) as Intl.Locale & {
      getWeekInfo?: () => { firstDay: number };
      weekInfo?: { firstDay: number };
    };
    const firstDay =
      localeWithWeekInfo.getWeekInfo?.().firstDay ??
      localeWithWeekInfo.weekInfo?.firstDay;
    if (typeof firstDay === "number") return firstDay % 7;
  } catch {
    // Fall through to the common Monday default.
  }
  return 1;
}

function currentLocalDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function compareEvents(
  left: EventDiscoveryItem,
  right: EventDiscoveryItem,
): number {
  return (
    left.startSeconds - right.startSeconds ||
    left.name.localeCompare(right.name)
  );
}

function compareIndicatorEvents(
  left: EventDiscoveryItem,
  right: EventDiscoveryItem,
  dayKey: string,
): number {
  const cancelledDelta =
    Number(left.lifecycleStatus === "cancelled") -
    Number(right.lifecycleStatus === "cancelled");
  if (cancelledDelta !== 0) return cancelledDelta;

  const startsTodayDelta =
    Number(eventStartDateKey(right) === dayKey) -
    Number(eventStartDateKey(left) === dayKey);
  if (startsTodayDelta !== 0) return startsTodayDelta;

  const sponsoredDelta =
    Number(right.isSponsored) - Number(left.isSponsored);
  if (sponsoredDelta !== 0) return sponsoredDelta;

  const rsvpDelta = relevantRsvpCount(right) - relevantRsvpCount(left);
  return rsvpDelta || compareEvents(left, right);
}

function eventStartDateKey(event: EventDiscoveryItem): string {
  if (event.timing) return event.timing.start_date;
  if (!event.timeZone) return "";
  return eventLocalDateKey(
    new Date(event.startSeconds * 1000),
    event.timeZone,
  );
}

function relevantRsvpCount(event: EventDiscoveryItem): number {
  return event.rsvpCounts.going + event.rsvpCounts.interested;
}

function parseMonthKey(monthKey: string): [number, number] {
  if (!isMonthKey(monthKey)) {
    throw new Error(`Invalid calendar month: ${monthKey}`);
  }
  const [year, month] = monthKey.split("-").map(Number);
  return [year, month];
}

function dateFromKey(key: string): Date {
  return new Date(`${key}T12:00:00.000Z`);
}

function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, amount: number): Date {
  return new Date(date.getTime() + amount * DAY_MS);
}

function utcMidnight(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}
