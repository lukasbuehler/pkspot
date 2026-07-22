import type { DailyWeatherPoint, WeatherPoint } from "./weather.models";

export interface EventWeatherSelection {
  date: string;
  time?: Date;
}

export function eventDateKey(date: Date, timeZone?: string): string {
  const parts = new Intl.DateTimeFormat("en", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone,
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

export function enumerateEventDateKeys(
  start: Date,
  end: Date,
  timeZone?: string,
): string[] {
  const startKey = eventDateKey(start, timeZone);
  const inclusiveEnd = new Date(Math.max(start.getTime(), end.getTime() - 1));
  const endKey = eventDateKey(inclusiveEnd, timeZone);
  const cursor = new Date(`${startKey}T12:00:00Z`);
  const last = new Date(`${endKey}T12:00:00Z`);
  const keys: string[] = [];

  while (cursor.getTime() <= last.getTime()) {
    keys.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return keys;
}

export function dailyForecastByDate(
  points: DailyWeatherPoint[] | undefined,
): ReadonlyMap<string, DailyWeatherPoint> {
  return new Map((points ?? []).map((point) => [point.date, point]));
}

export function forecastHourAt(
  points: WeatherPoint[] | undefined,
  target: Date,
): WeatherPoint | undefined {
  const targetTime = target.getTime();
  return (points ?? []).find((point) => {
    const start = Date.parse(point.time);
    return targetTime >= start && targetTime < start + 60 * 60 * 1000;
  });
}

export function eventHoursForDate(
  points: WeatherPoint[] | undefined,
  date: string,
  eventStart: Date,
  eventEnd: Date,
  timeZone?: string,
): WeatherPoint[] {
  return (points ?? []).filter((point) => {
    const time = Date.parse(point.time);
    return (
      time < eventEnd.getTime() &&
      time + 60 * 60 * 1000 > eventStart.getTime() &&
      eventDateKey(new Date(time), timeZone) === date
    );
  });
}
