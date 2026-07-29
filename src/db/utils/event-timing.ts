import type {
  EventTimingMode,
  EventTimingSchema,
} from "../schemas/EventSchema";

const DATE_KEY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/u;
const TIME_KEY_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/u;

export interface EventCompatibilityWindow {
  start: Date;
  end: Date;
}

export interface EventTimingValidation {
  valid: boolean;
  field?: keyof EventTimingSchema | "time_zone" | "active_until";
  reason?: string;
}

export function isDateKey(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const match = DATE_KEY_PATTERN.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

export function isTimeKey(value: unknown): value is string {
  return typeof value === "string" && TIME_KEY_PATTERN.test(value);
}

export function isIanaTimeZone(value: unknown): value is string {
  if (typeof value !== "string" || !value) return false;
  try {
    new Intl.DateTimeFormat("en", { timeZone: value }).format(0);
    return true;
  } catch {
    return false;
  }
}

export function normalizedEndDate(timing: EventTimingSchema): string {
  return timing.end_date ?? timing.start_date;
}

export function validateEventTiming(
  timing: EventTimingSchema,
  timeZone?: string,
  activeUntil?: Date,
): EventTimingValidation {
  if (!isDateKey(timing.start_date)) {
    return { valid: false, field: "start_date", reason: "invalid_date" };
  }
  if (timing.end_date && !isDateKey(timing.end_date)) {
    return { valid: false, field: "end_date", reason: "invalid_date" };
  }
  if (normalizedEndDate(timing) < timing.start_date) {
    return { valid: false, field: "end_date", reason: "before_start" };
  }
  if (
    timing.mode !== "date_only" &&
    timing.mode !== "exact" &&
    timing.mode !== "open_end"
  ) {
    return { valid: false, field: "mode", reason: "invalid_mode" };
  }
  if (timing.mode === "date_only") {
    return !timing.start_time && !timing.end_time
      ? { valid: true }
      : { valid: false, field: "start_time", reason: "unexpected_time" };
  }
  if (!isTimeKey(timing.start_time)) {
    return { valid: false, field: "start_time", reason: "required" };
  }
  if (!isIanaTimeZone(timeZone)) {
    return { valid: false, field: "time_zone", reason: "required" };
  }
  if (timing.mode === "exact") {
    if (!isTimeKey(timing.end_time)) {
      return { valid: false, field: "end_time", reason: "required" };
    }
    try {
      const start = eventWallClockToDate(
        timing.start_date,
        timing.start_time,
        timeZone,
      );
      const end = eventWallClockToDate(
        normalizedEndDate(timing),
        timing.end_time,
        timeZone,
      );
      return end > start
        ? { valid: true }
        : { valid: false, field: "end_time", reason: "not_after_start" };
    } catch {
      return { valid: false, field: "start_time", reason: "invalid_wall_time" };
    }
  }
  if (timing.end_time) {
    return { valid: false, field: "end_time", reason: "unexpected_time" };
  }
  if (!activeUntil || !Number.isFinite(activeUntil.getTime())) {
    return { valid: false, field: "active_until", reason: "required" };
  }
  try {
    const start = eventWallClockToDate(
      timing.start_date,
      timing.start_time,
      timeZone,
    );
    return activeUntil > start
      ? { valid: true }
      : { valid: false, field: "active_until", reason: "not_after_start" };
  } catch {
    return { valid: false, field: "start_time", reason: "invalid_wall_time" };
  }
}

export function eventCompatibilityWindow(
  timing: EventTimingSchema,
  timeZone?: string,
  activeUntil?: Date,
): EventCompatibilityWindow {
  const validation = validateEventTiming(timing, timeZone, activeUntil);
  if (!validation.valid) {
    throw new Error(
      `Invalid event timing: ${validation.field ?? "timing"}:${validation.reason ?? "invalid"}`,
    );
  }

  if (timing.mode === "date_only") {
    return {
      start: utcDateBoundary(timing.start_date, false),
      end: utcDateBoundary(normalizedEndDate(timing), true),
    };
  }

  const start = eventWallClockToDate(
    timing.start_date,
    timing.start_time!,
    timeZone!,
  );
  if (timing.mode === "open_end") {
    return { start, end: new Date(activeUntil!.getTime()) };
  }
  return {
    start,
    end: eventWallClockToDate(
      normalizedEndDate(timing),
      timing.end_time!,
      timeZone!,
    ),
  };
}

/**
 * Convert an event-local wall clock to an instant without using the editor's
 * device zone. Ambiguous DST times resolve to the earliest matching instant;
 * nonexistent spring-forward times are rejected.
 */
export function eventWallClockToDate(
  dateKey: string,
  timeKey: string,
  timeZone: string,
): Date {
  if (!isDateKey(dateKey) || !isTimeKey(timeKey) || !isIanaTimeZone(timeZone)) {
    throw new Error("Invalid event wall-clock input");
  }
  const [year, month, day] = dateKey.split("-").map(Number);
  const [hour, minute] = timeKey.split(":").map(Number);
  const nominal = Date.UTC(year, month - 1, day, hour, minute);
  let candidate = nominal - zoneOffsetMillis(timeZone, nominal);
  candidate = nominal - zoneOffsetMillis(timeZone, candidate);

  const matches: number[] = [];
  for (let deltaMinutes = -180; deltaMinutes <= 180; deltaMinutes += 15) {
    const instant = candidate + deltaMinutes * 60_000;
    if (
      formattedWallClock(instant, timeZone) ===
      `${dateKey}T${timeKey}`
    ) {
      matches.push(instant);
    }
  }
  if (matches.length === 0) {
    throw new Error(`The local time ${dateKey} ${timeKey} does not exist`);
  }
  return new Date(Math.min(...matches));
}

export function dateKeyFromDate(date: Date): string {
  return [
    date.getFullYear().toString().padStart(4, "0"),
    (date.getMonth() + 1).toString().padStart(2, "0"),
    date.getDate().toString().padStart(2, "0"),
  ].join("-");
}

export function timeKeyFromDate(date: Date): string {
  return [
    date.getHours().toString().padStart(2, "0"),
    date.getMinutes().toString().padStart(2, "0"),
  ].join(":");
}

export function legacyExactTiming(
  start: Date,
  end: Date,
  timeZone: string,
): EventTimingSchema {
  return {
    start_date: zonedKey(start, timeZone, "date"),
    end_date: zonedKey(end, timeZone, "date"),
    start_time: zonedKey(start, timeZone, "time"),
    end_time: zonedKey(end, timeZone, "time"),
    mode: "exact",
  };
}

function utcDateBoundary(dateKey: string, end: boolean): Date {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(
    Date.UTC(
      year,
      month - 1,
      day,
      end ? 23 : 0,
      end ? 59 : 0,
      end ? 59 : 0,
      end ? 999 : 0,
    ),
  );
}

function zoneOffsetMillis(timeZone: string, instant: number): number {
  const parts = wallClockParts(instant, timeZone);
  const asUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
  );
  return asUtc - Math.floor(instant / 60_000) * 60_000;
}

function formattedWallClock(instant: number, timeZone: string): string {
  const parts = wallClockParts(instant, timeZone);
  return `${parts.year.toString().padStart(4, "0")}-${parts.month
    .toString()
    .padStart(2, "0")}-${parts.day.toString().padStart(2, "0")}T${parts.hour
    .toString()
    .padStart(2, "0")}:${parts.minute.toString().padStart(2, "0")}`;
}

function wallClockParts(instant: number, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);
  const value = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((part) => part.type === type)?.value);
  return {
    year: value("year"),
    month: value("month"),
    day: value("day"),
    hour: value("hour"),
    minute: value("minute"),
  };
}

function zonedKey(
  date: Date,
  timeZone: string,
  kind: "date" | "time",
): string {
  const parts = wallClockParts(date.getTime(), timeZone);
  return kind === "date"
    ? `${parts.year.toString().padStart(4, "0")}-${parts.month
        .toString()
        .padStart(2, "0")}-${parts.day.toString().padStart(2, "0")}`
    : `${parts.hour.toString().padStart(2, "0")}:${parts.minute
        .toString()
        .padStart(2, "0")}`;
}

export function isEventTimingMode(value: unknown): value is EventTimingMode {
  return value === "date_only" || value === "exact" || value === "open_end";
}
