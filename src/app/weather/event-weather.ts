import {
  getDailyWeatherForecastIconTone,
  getWeatherForecastIconTone,
  getWeatherForecastState,
  getWeatherForecastStateIcon,
  type WeatherCondition,
  type WeatherForecastIconTone,
} from "./weather-display";
import type { WeatherVisualStatus } from "./weather-warnings";
import type { DailyWeatherPoint, WeatherPoint } from "./weather.models";

export interface EventProgramWeatherIconData {
  condition: WeatherCondition;
  isDay?: boolean;
  temperatureC?: number;
  minTemperatureC?: number;
  maxTemperatureC?: number;
  status: WeatherVisualStatus;
}

export interface EventProgramDayWeather {
  data: EventProgramWeatherIconData;
  icon: string;
  label: string;
  tone: WeatherForecastIconTone;
}

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

export function singleEventDateKey(
  start: Date,
  end: Date,
  timeZone?: string,
): string | undefined {
  const dates = enumerateEventDateKeys(start, end, timeZone);
  return dates.length === 1 ? dates[0] : undefined;
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

export function eventProgramHourWeather(
  point: WeatherPoint | undefined,
): EventProgramWeatherIconData | undefined {
  if (!point) return undefined;
  const condition = point.condition ?? "unknown";
  return {
    condition,
    isDay: point.isDay,
    temperatureC: point.temperatureC,
    status: weatherStatusFromTone(
      getWeatherForecastIconTone({
        condition,
        temperatureC: point.temperatureC,
        uvIndex: point.uvIndex,
        precipitationMm: point.precipitationMm,
        precipitationProbabilityPercent:
          point.precipitationProbabilityPercent,
        isDay: point.isDay,
      }),
    ),
  };
}

export function eventProgramDayWeather(
  point: DailyWeatherPoint | undefined,
): EventProgramDayWeather | undefined {
  if (!point) return undefined;
  const condition = point.condition ?? "unknown";
  const context = { ...point, condition };
  const tone = getDailyWeatherForecastIconTone({
    ...context,
    temperatureC: point.maxTemperatureC,
  });
  const state = getWeatherForecastState({
    ...context,
    temperatureC: point.maxTemperatureC,
  });
  return {
    data: {
      condition,
      minTemperatureC: point.minTemperatureC,
      maxTemperatureC: point.maxTemperatureC,
      status: weatherStatusFromTone(tone),
    },
    icon: getWeatherForecastStateIcon({
      ...context,
      temperatureC: point.maxTemperatureC,
    }),
    label: state.label,
    tone,
  };
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

function weatherStatusFromTone(
  tone: WeatherForecastIconTone,
): WeatherVisualStatus {
  if (tone === "wet") return "wet";
  return tone === "warning" ? "warning" : "neutral";
}
