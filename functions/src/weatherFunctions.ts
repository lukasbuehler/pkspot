/* eslint-disable max-len, object-curly-spacing, operator-linebreak, require-jsdoc */
import * as admin from "firebase-admin";
import { Timestamp } from "firebase-admin/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { CallableRequest, HttpsError, onCall } from "firebase-functions/v2/https";
import { googleAPIKey } from "./secrets";

export type WeatherProvider = "google" | "open-meteo";
export type WeatherCondition =
  | "clear"
  | "mostly-clear"
  | "partly-cloudy"
  | "cloudy"
  | "fog"
  | "drizzle"
  | "rain"
  | "heavy-rain"
  | "freezing-rain"
  | "sleet"
  | "snow"
  | "heavy-snow"
  | "thunderstorm"
  | "hail"
  | "windy"
  | "unknown";
export type WeatherMode =
  | "current-and-near-future"
  | "forecast-at"
  | "event-forecast";
export type WeatherAlertSeverity =
  | "unknown"
  | "minor"
  | "moderate"
  | "severe"
  | "extreme";
export type WeatherAlertCertainty =
  | "unknown"
  | "observed"
  | "very-likely"
  | "likely"
  | "possible"
  | "unlikely";
export type WeatherAlertUrgency =
  | "unknown"
  | "immediate"
  | "expected"
  | "future"
  | "past";

export interface WeatherLocation {
  lat: number;
  lng: number;
}

export interface WeatherTileScope {
  type: "mercator-tile";
  zoom: number;
  x: number;
  y: number;
}

export interface WeatherScheduleItem {
  id?: string;
  title?: string;
  start: string;
  end: string;
}

export type WeatherRequest =
  | {
      mode: "current-and-near-future";
      location: WeatherLocation;
      nearFutureHours?: number;
      providerOverride?: WeatherProvider;
      spatialScope?: WeatherTileScope;
      languageCode?: string;
    }
  | {
      mode: "forecast-at";
      location: WeatherLocation;
      targetTime: string;
      providerOverride?: WeatherProvider;
    }
  | {
      mode: "event-forecast";
      location: WeatherLocation;
      eventStart: string;
      eventEnd: string;
      scheduleItems?: WeatherScheduleItem[];
      providerOverride?: WeatherProvider;
      spatialScope?: WeatherTileScope;
    };

export interface WeatherPoint {
  time: string;
  temperatureC?: number;
  apparentTemperatureC?: number;
  relativeHumidityPercent?: number;
  precipitationMm?: number;
  precipitationProbabilityPercent?: number;
  uvIndex?: number;
  solarRadiationWm2?: number;
  cloudCoverPercent?: number;
  windSpeedKmh?: number;
  weatherCode?: string;
  condition?: WeatherCondition;
  sunrise?: string;
  sunset?: string;
  isDay?: boolean;
}

export interface DailyWeatherPoint {
  date: string;
  maxTemperatureC?: number;
  minTemperatureC?: number;
  precipitationMm?: number;
  precipitationProbabilityPercent?: number;
  uvIndex?: number;
  weatherCode?: string;
  condition?: WeatherCondition;
  sunrise?: string;
  sunset?: string;
}

export interface WeatherInsights {
  summary: string;
  rainStartsAt?: string;
  rainStopsAt?: string;
  likelyDryUntil?: string;
  precipitationRisk: "none" | "low" | "medium" | "high";
  sunExposure: "dark" | "low" | "moderate" | "harsh";
  surfaceDrying: {
    status: "unknown" | "wet" | "drying" | "likely_dry";
    estimatedDryAt?: string;
    confidence: "low" | "medium";
    factors: string[];
  };
}

export interface WeatherEventInsights extends WeatherInsights {
  wettestHour?: WeatherPoint;
  hottestHour?: WeatherPoint;
  harshestSunHour?: WeatherPoint;
  likelyDryWindows: Array<{ start: string; end: string }>;
  rainPeriods: Array<{ start: string; end: string }>;
}

export interface WeatherScheduleForecast {
  id?: string;
  title?: string;
  start: string;
  end: string;
  forecast: WeatherPoint[];
  insights: WeatherInsights;
}

export interface WeatherAlert {
  id: string;
  type: string;
  title: string;
  severity: WeatherAlertSeverity;
  certainty: WeatherAlertCertainty;
  urgency: WeatherAlertUrgency;
  areaName: string;
  startsAt?: string;
  expiresAt?: string;
  description?: string;
  instructions: string[];
  safetyRecommendations: Array<{
    directive: string;
    subtext?: string;
  }>;
  source: {
    name: string;
    url: string;
  };
}

export interface WeatherResponse {
  provider: WeatherProvider;
  mode: WeatherMode;
  location: WeatherLocation;
  countryCode?: string;
  generatedAt: string;
  expiresAt: string;
  attribution?: string;
  timeZone?: string;
  current?: WeatherPoint;
  forecast?: WeatherPoint[];
  dailyForecast?: DailyWeatherPoint[];
  target?: WeatherPoint;
  schedule?: WeatherScheduleForecast[];
  alerts?: WeatherAlert[];
  alertsStatus?: "available" | "unavailable";
  alertsExpiresAt?: string;
  insights: WeatherInsights | WeatherEventInsights;
}

interface ProviderFetchRequest {
  mode: WeatherMode;
  location: WeatherLocation;
  startTime: Date;
  endTime: Date;
  includeCurrent: boolean;
}

interface ProviderFetchResult {
  current?: WeatherPoint;
  forecast: WeatherPoint[];
  dailyForecast: DailyWeatherPoint[];
  attribution?: string;
  timeZone?: string;
}

interface CacheDocument {
  provider: WeatherProvider;
  mode: WeatherMode;
  expires_at: Timestamp;
  fetched_at: Timestamp;
  response: WeatherResponse;
}

interface AlertCacheDocument {
  expires_at: Timestamp;
  fetched_at: Timestamp;
  alerts: WeatherAlert[];
  countryCode?: string;
}

interface WeatherAlertResult {
  alerts: WeatherAlert[];
  countryCode?: string;
  status: "available" | "unavailable";
  expiresAt: string;
}

interface WeatherAlertFetchResult {
  alerts: WeatherAlert[];
  countryCode?: string;
}

interface DailySunWindow {
  startTime: string;
  endTime: string;
  sunrise?: string;
  sunset?: string;
}

const WEATHER_CACHE_COLLECTION = "weather_cache";
const WEATHER_ALERT_CACHE_COLLECTION = "weather_alert_cache";
const DEFAULT_NEAR_FUTURE_HOURS = 12;
const DEFAULT_DAILY_FORECAST_DAYS = 8;
const MAX_NEAR_FUTURE_HOURS = 24;
const GOOGLE_MAX_FORECAST_HOURS = 240;
const OPEN_METEO_MAX_FORECAST_HOURS = 16 * 24;
const GOOGLE_HOURLY_CACHE_MS = 45 * 60 * 1000;
const OPEN_METEO_HOURLY_CACHE_MS = 60 * 60 * 1000;
const OPEN_METEO_SUMMARY_CACHE_MS = 6 * 60 * 60 * 1000;
const GOOGLE_DAILY_SUMMARY_CACHE_MS = 23.5 * 60 * 60 * 1000;
const GOOGLE_ALERT_CACHE_MS = 10 * 60 * 1000;
const GOOGLE_ALERT_FAILURE_RETRY_MS = 2 * 60 * 1000;
const RAIN_PROBABILITY_THRESHOLD = 40;
const RAIN_MM_THRESHOLD = 0.2;

export const getWeather = onCall(
  { enforceAppCheck: true, secrets: [googleAPIKey] },
  async (request: CallableRequest<unknown>) => {
    const now = new Date();
    const parsedRequest = parseWeatherRequest(request.data);
    const provider = resolveWeatherProvider(
      parsedRequest.providerOverride,
      request.auth?.token?.admin === true
    );
    const window = resolveRequestWindow(parsedRequest, provider, now);
    const cacheKey = buildWeatherCacheKey(parsedRequest, provider, window);
    const cacheRef = admin
      .firestore()
      .collection(WEATHER_CACHE_COLLECTION)
      .doc(cacheKey);
    const cached = await cacheRef.get();

    if (cached.exists) {
      const data = cached.data() as Partial<CacheDocument> | undefined;
      const expiresAt = data?.expires_at?.toDate();
      if (expiresAt && expiresAt.getTime() > now.getTime() && data?.response) {
        return attachWeatherAlerts(data.response, parsedRequest, now);
      }
      await cacheRef.delete();
    }

    const response = await fetchWeatherResponse(
      parsedRequest,
      provider,
      window,
      now
    );
    await cacheRef.set({
      provider,
      mode: parsedRequest.mode,
      expires_at: Timestamp.fromDate(new Date(response.expiresAt)),
      fetched_at: Timestamp.fromDate(now),
      response,
    } satisfies CacheDocument);

    return attachWeatherAlerts(response, parsedRequest, now);
  }
);

export const cleanupExpiredWeatherCache = onSchedule(
  "every 5 minutes",
  async () => {
    const now = Timestamp.now();
    const snapshots = await Promise.all(
      [WEATHER_CACHE_COLLECTION, WEATHER_ALERT_CACHE_COLLECTION].map(
        (collection) =>
          admin
            .firestore()
            .collection(collection)
            .where("expires_at", "<=", now)
            .limit(150)
            .get()
      )
    );
    const expiredDocs = snapshots.flatMap((snapshot) => snapshot.docs);

    if (expiredDocs.length === 0) {
      return;
    }

    const batch = admin.firestore().batch();
    expiredDocs.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
  }
);

export function parseWeatherRequest(value: unknown): WeatherRequest {
  if (!isRecord(value)) {
    throw new HttpsError("invalid-argument", "request must be an object");
  }

  const mode = value["mode"];
  if (
    mode !== "current-and-near-future" &&
    mode !== "forecast-at" &&
    mode !== "event-forecast"
  ) {
    throw new HttpsError("invalid-argument", "invalid weather mode");
  }

  if (mode === "forecast-at" && value["spatialScope"] !== undefined) {
    throw new HttpsError(
      "invalid-argument",
      "spatialScope is not supported for forecast-at weather"
    );
  }
  const spatialScope =
    mode === "current-and-near-future" || mode === "event-forecast"
      ? parseWeatherTileScope(value["spatialScope"])
      : undefined;
  const location = spatialScope
    ? getWeatherTileCenter(spatialScope)
    : parseLocation(value["location"]);
  const providerOverride = parseProviderOverride(value["providerOverride"]);

  if (mode === "current-and-near-future") {
    const nearFutureHours =
      value["nearFutureHours"] === undefined
        ? undefined
        : parseIntegerInRange(
          value["nearFutureHours"],
          1,
          MAX_NEAR_FUTURE_HOURS,
          "nearFutureHours"
        );
    return {
      mode,
      location,
      nearFutureHours,
      providerOverride,
      spatialScope,
      languageCode: parseLanguageCode(value["languageCode"]),
    };
  }

  if (mode === "forecast-at") {
    return {
      mode,
      location,
      targetTime: parseIsoDate(value["targetTime"], "targetTime").toISOString(),
      providerOverride,
    };
  }

  const eventStart = parseIsoDate(value["eventStart"], "eventStart");
  const eventEnd = parseIsoDate(value["eventEnd"], "eventEnd");
  if (eventEnd.getTime() <= eventStart.getTime()) {
    throw new HttpsError("invalid-argument", "eventEnd must be after eventStart");
  }

  const scheduleItems = parseScheduleItems(value["scheduleItems"]);
  return {
    mode,
    location,
    eventStart: eventStart.toISOString(),
    eventEnd: eventEnd.toISOString(),
    scheduleItems,
    providerOverride,
    spatialScope,
  };
}

export function resolveWeatherProvider(
  override: WeatherProvider | undefined,
  isAdmin: boolean
): WeatherProvider {
  if (override) {
    if (!isAdmin) {
      throw new HttpsError(
        "permission-denied",
        "providerOverride requires admin privileges"
      );
    }
    return override;
  }

  return process.env.WEATHER_PROVIDER === "open-meteo" ? "open-meteo" : "google";
}

export function resolveRequestWindow(
  request: WeatherRequest,
  provider: WeatherProvider,
  now: Date
): { startTime: Date; endTime: Date; includeCurrent: boolean } {
  if (request.mode === "current-and-near-future") {
    const hours = request.nearFutureHours ?? DEFAULT_NEAR_FUTURE_HOURS;
    return {
      startTime: floorToHour(now),
      endTime: addHours(floorToHour(now), hours),
      includeCurrent: true,
    };
  }

  if (request.mode === "forecast-at") {
    const target = new Date(request.targetTime);
    if (target.getTime() < floorToHour(now).getTime()) {
      throw new HttpsError("invalid-argument", "targetTime is in the past");
    }
    const startTime = addHours(floorToHour(target), -2);
    const endTime = addHours(floorToHour(target), 4);
    assertForecastWindowSupported(startTime, endTime, provider, now);
    return { startTime, endTime, includeCurrent: false };
  }

  const requestedStart = floorToHour(new Date(request.eventStart));
  const requestedEnd = ceilToHour(new Date(request.eventEnd));
  const availableStart = floorToHour(now);
  const maxHours =
    provider === "google"
      ? GOOGLE_MAX_FORECAST_HOURS
      : OPEN_METEO_MAX_FORECAST_HOURS;
  const availableEnd = addHours(availableStart, maxHours);

  if (requestedEnd.getTime() <= availableStart.getTime()) {
    throw new HttpsError(
      "invalid-argument",
      "weather forecast window is in the past"
    );
  }
  if (requestedStart.getTime() > availableEnd.getTime()) {
    throw new HttpsError(
      "invalid-argument",
      `weather forecast window exceeds ${provider} forecast range`
    );
  }

  return {
    startTime: new Date(
      Math.max(requestedStart.getTime(), availableStart.getTime())
    ),
    endTime: new Date(
      Math.min(requestedEnd.getTime(), availableEnd.getTime())
    ),
    includeCurrent: false,
  };
}

export function buildWeatherCacheKey(
  request: WeatherRequest,
  provider: WeatherProvider,
  window: { startTime: Date; endTime: Date }
): string {
  const locationKey =
    "spatialScope" in request && request.spatialScope
      ? [
        request.spatialScope.type,
        request.spatialScope.zoom,
        request.spatialScope.x,
        request.spatialScope.y,
      ].join(":")
      : [
        roundCoordinate(request.location.lat),
        roundCoordinate(request.location.lng),
      ].join(":");
  const scheduleFingerprint =
    request.mode === "event-forecast" && request.scheduleItems?.length
      ? request.scheduleItems
        .map((item) => `${item.id ?? ""}:${item.start}:${item.end}`)
        .join(",")
      : "no-schedule";
  const raw = [
    provider,
    request.mode,
    locationKey,
    window.startTime.toISOString(),
    window.endTime.toISOString(),
    "metric",
    "v2",
    scheduleFingerprint,
  ].join("|");

  return Buffer.from(raw).toString("base64url").slice(0, 180);
}

export function buildWeatherAlertCacheKey(
  request: Extract<WeatherRequest, { mode: "current-and-near-future" }>
): string {
  const locationKey = request.spatialScope
    ? [
      request.spatialScope.type,
      request.spatialScope.zoom,
      request.spatialScope.x,
      request.spatialScope.y,
    ].join(":")
    : [
      roundCoordinate(request.location.lat),
      roundCoordinate(request.location.lng),
    ].join(":");
  const raw = [
    "google-public-alerts",
    locationKey,
    request.languageCode ?? "en",
    "v1",
  ].join("|");

  return Buffer.from(raw).toString("base64url").slice(0, 180);
}

export function getProviderCacheDurationMs(
  provider: WeatherProvider,
  mode: WeatherMode
): number {
  if (provider === "google") {
    return mode === "current-and-near-future"
      ? GOOGLE_HOURLY_CACHE_MS
      : Math.min(GOOGLE_DAILY_SUMMARY_CACHE_MS, GOOGLE_HOURLY_CACHE_MS);
  }

  return mode === "current-and-near-future"
    ? OPEN_METEO_HOURLY_CACHE_MS
    : OPEN_METEO_SUMMARY_CACHE_MS;
}

export function getWeatherAlertCacheDurationMs(): number {
  return GOOGLE_ALERT_CACHE_MS;
}

export function buildWeatherInsights(points: WeatherPoint[]): WeatherInsights {
  const ordered = points
    .slice()
    .sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
  const current = ordered[0];
  const rainPeriods = findRainPeriods(ordered);
  const firstFutureRain = ordered.find(isMeaningfulRain);
  const firstDryAfterRain = firstFutureRain
    ? ordered
      .filter((point) => new Date(point.time) > new Date(firstFutureRain.time))
      .find((point) => !isMeaningfulRain(point))
    : undefined;
  const maxRainRisk = Math.max(
    0,
    ...ordered.map((point) => point.precipitationProbabilityPercent ?? 0)
  );
  const precipitationRisk = classifyPrecipitationRisk(ordered, maxRainRisk);
  const sunExposure = classifySunExposure(current);
  const summary = buildSummary(current, precipitationRisk, sunExposure);

  return removeUndefinedValues({
    summary,
    rainStartsAt: rainPeriods[0]?.start,
    rainStopsAt: rainPeriods[0]?.end,
    likelyDryUntil: firstFutureRain?.time,
    precipitationRisk,
    sunExposure,
    surfaceDrying: estimateSurfaceDrying(ordered, firstDryAfterRain),
  });
}

export function buildEventInsights(points: WeatherPoint[]): WeatherEventInsights {
  const base = buildWeatherInsights(points);
  const ordered = points
    .slice()
    .sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
  const wettestHour = maxBy(
    ordered,
    (point) =>
      (point.precipitationMm ?? 0) * 100 +
      (point.precipitationProbabilityPercent ?? 0)
  );
  const hottestHour = maxBy(ordered, (point) => point.temperatureC ?? -Infinity);
  const harshestSunHour = maxBy(
    ordered,
    (point) => sunExposureScore(point)
  );

  return {
    ...base,
    wettestHour,
    hottestHour,
    harshestSunHour,
    likelyDryWindows: findDryWindows(ordered),
    rainPeriods: findRainPeriods(ordered),
  };
}

async function attachWeatherAlerts(
  response: WeatherResponse,
  request: WeatherRequest,
  now: Date
): Promise<WeatherResponse> {
  if (request.mode !== "current-and-near-future") {
    return response;
  }

  const result = await getCachedGoogleWeatherAlerts(request, now);
  return {
    ...response,
    alerts: result.alerts,
    countryCode: result.countryCode,
    alertsStatus: result.status,
    alertsExpiresAt: result.expiresAt,
    expiresAt: earlierIsoTime(response.expiresAt, result.expiresAt),
  };
}

async function getCachedGoogleWeatherAlerts(
  request: Extract<WeatherRequest, { mode: "current-and-near-future" }>,
  now: Date
): Promise<WeatherAlertResult> {
  const cacheRef = admin
    .firestore()
    .collection(WEATHER_ALERT_CACHE_COLLECTION)
    .doc(buildWeatherAlertCacheKey(request));
  const cached = await cacheRef.get();

  if (cached.exists) {
    const data = cached.data() as Partial<AlertCacheDocument> | undefined;
    const expiresAt = data?.expires_at?.toDate();
    if (expiresAt && expiresAt.getTime() > now.getTime() && data?.alerts) {
      return {
        alerts: data.alerts,
        countryCode: data.countryCode,
        status: "available",
        expiresAt: expiresAt.toISOString(),
      };
    }
    await cacheRef.delete();
  }

  try {
    const result = await fetchGoogleWeatherAlerts(
      request.location,
      request.languageCode,
      now
    );
    const expiresAt = resolveWeatherAlertExpiry(result.alerts, now);
    await cacheRef.set({
      expires_at: Timestamp.fromDate(expiresAt),
      fetched_at: Timestamp.fromDate(now),
      alerts: result.alerts,
      ...(result.countryCode ? { countryCode: result.countryCode } : {}),
    } satisfies AlertCacheDocument);
    return {
      alerts: result.alerts,
      countryCode: result.countryCode,
      status: "available",
      expiresAt: expiresAt.toISOString(),
    };
  } catch (error) {
    console.error("Google weather alerts request failed", error);
    return {
      alerts: [],
      status: "unavailable",
      expiresAt: new Date(
        now.getTime() + GOOGLE_ALERT_FAILURE_RETRY_MS
      ).toISOString(),
    };
  }
}

function resolveWeatherAlertExpiry(
  alerts: WeatherAlert[],
  now: Date
): Date {
  const defaultExpiry = now.getTime() + GOOGLE_ALERT_CACHE_MS;
  const earliestAlertExpiry = Math.min(
    defaultExpiry,
    ...alerts
      .map((alert) => Date.parse(alert.expiresAt ?? ""))
      .filter((time) => Number.isFinite(time) && time > now.getTime())
  );
  return new Date(earliestAlertExpiry);
}

function earlierIsoTime(left: string, right: string): string {
  return new Date(Math.min(Date.parse(left), Date.parse(right))).toISOString();
}

async function fetchWeatherResponse(
  request: WeatherRequest,
  provider: WeatherProvider,
  window: { startTime: Date; endTime: Date; includeCurrent: boolean },
  now: Date
): Promise<WeatherResponse> {
  const providerRequest: ProviderFetchRequest = {
    mode: request.mode,
    location: request.location,
    startTime: window.startTime,
    endTime: window.endTime,
    includeCurrent: window.includeCurrent,
  };
  const result =
    provider === "google"
      ? await fetchGoogleWeather(providerRequest)
      : await fetchOpenMeteoWeather(providerRequest);
  const forecast = filterForecastWindow(
    result.forecast,
    window.startTime,
    window.endTime
  );
  const expiresAt = new Date(
    now.getTime() + getProviderCacheDurationMs(provider, request.mode)
  ).toISOString();
  const baseResponse = {
    provider,
    mode: request.mode,
    location: request.location,
    generatedAt: now.toISOString(),
    expiresAt,
    attribution: result.attribution,
    timeZone: result.timeZone,
    dailyForecast: result.dailyForecast,
  };

  if (request.mode === "current-and-near-future") {
    const insightPoints = [result.current, ...forecast].filter(
      (point): point is WeatherPoint => point !== undefined
    );
    return removeUndefinedValues({
      ...baseResponse,
      current: result.current,
      forecast,
      insights: buildWeatherInsights(insightPoints),
    });
  }

  if (request.mode === "forecast-at") {
    const target = nearestPoint(forecast, new Date(request.targetTime));
    return removeUndefinedValues({
      ...baseResponse,
      target,
      forecast,
      insights: buildWeatherInsights(forecast),
    });
  }

  return removeUndefinedValues({
    ...baseResponse,
    forecast,
    schedule: buildScheduleForecasts(request.scheduleItems, forecast),
    insights: buildEventInsights(forecast),
  });
}

async function fetchGoogleWeather(
  request: ProviderFetchRequest
): Promise<ProviderFetchResult> {
  const apiKey = googleAPIKey.value();
  if (!apiKey) {
    throw new HttpsError("failed-precondition", "GOOGLE_API_KEY is not set");
  }

  const currentPromise = request.includeCurrent
    ? fetchGoogleJson<GoogleCurrentResponse>(
      "https://weather.googleapis.com/v1/currentConditions:lookup",
      apiKey,
      request.location
    )
    : Promise.resolve(undefined);
  const hours = clamp(
    Math.ceil(
      (request.endTime.getTime() - new Date().getTime()) / (60 * 60 * 1000)
    ) + 2,
    1,
    GOOGLE_MAX_FORECAST_HOURS
  );
  const forecastPromise = fetchGoogleJson<GoogleHourlyResponse>(
    "https://weather.googleapis.com/v1/forecast/hours:lookup",
    apiKey,
    request.location,
    { hours: String(hours), pageSize: String(Math.min(hours, 240)) }
  );
  const days = clamp(
    request.mode === "current-and-near-future"
      ? DEFAULT_DAILY_FORECAST_DAYS
      : Math.ceil(
        (request.endTime.getTime() - new Date().getTime()) /
          (24 * 60 * 60 * 1000)
      ) + 2,
    1,
    10
  );
  const dailyPromise = fetchGoogleJson<GoogleDailyResponse>(
    "https://weather.googleapis.com/v1/forecast/days:lookup",
    apiKey,
    request.location,
    { days: String(days), pageSize: String(days) }
  );
  const [current, forecast, daily] = await Promise.all([
    currentPromise,
    forecastPromise,
    dailyPromise,
  ]);
  const sunWindows = normalizeGoogleSunWindows(daily);
  const normalizedForecast = (forecast.forecastHours ?? []).map((hour) =>
    attachSunWindow(normalizeGoogleWeatherPoint(hour), sunWindows)
  );

  return {
    current: current
      ? attachSunWindow(normalizeGoogleCurrentPoint(current), sunWindows)
      : undefined,
    forecast: normalizedForecast,
    dailyForecast: normalizeGoogleDailyPoints(daily),
    attribution: "Weather: Google Weather",
    timeZone: forecast.timeZone?.id ?? current?.timeZone?.id,
  };
}

async function fetchOpenMeteoWeather(
  request: ProviderFetchRequest
): Promise<ProviderFetchResult> {
  const baseUrl =
    process.env.OPEN_METEO_BASE_URL ?? "https://api.open-meteo.com/v1/forecast";
  const url = new URL(baseUrl);
  const forecastHours = clamp(
    Math.ceil(
      (request.endTime.getTime() - new Date().getTime()) / (60 * 60 * 1000)
    ) + 2,
    1,
    OPEN_METEO_MAX_FORECAST_HOURS
  );
  url.searchParams.set("latitude", String(request.location.lat));
  url.searchParams.set("longitude", String(request.location.lng));
  url.searchParams.set("timezone", "auto");
  url.searchParams.set("forecast_hours", String(forecastHours));
  url.searchParams.set(
    "forecast_days",
    String(
      request.mode === "current-and-near-future"
        ? DEFAULT_DAILY_FORECAST_DAYS
        : clamp(Math.ceil(forecastHours / 24) + 1, 1, 16)
    )
  );
  url.searchParams.set(
    "current",
    [
      "temperature_2m",
      "relative_humidity_2m",
      "apparent_temperature",
      "is_day",
      "precipitation",
      "weather_code",
      "cloud_cover",
      "wind_speed_10m",
    ].join(",")
  );
  url.searchParams.set(
    "hourly",
    [
      "temperature_2m",
      "relative_humidity_2m",
      "apparent_temperature",
      "precipitation_probability",
      "precipitation",
      "weather_code",
      "cloud_cover",
      "wind_speed_10m",
      "uv_index",
      "shortwave_radiation",
      "is_day",
    ].join(",")
  );
  url.searchParams.set(
    "daily",
    [
      "weather_code",
      "temperature_2m_max",
      "temperature_2m_min",
      "precipitation_sum",
      "precipitation_probability_max",
      "uv_index_max",
      "sunrise",
      "sunset",
    ].join(",")
  );

  const apiKey = process.env.OPEN_METEO_API_KEY;
  if (apiKey) {
    url.searchParams.set("apikey", apiKey);
  }

  const response = await fetch(url);
  if (!response.ok) {
    throw new HttpsError(
      "unavailable",
      `Open-Meteo request failed: ${response.status} ${response.statusText}`
    );
  }

  const data = (await response.json()) as OpenMeteoResponse;
  const utcOffsetSeconds = data.utc_offset_seconds ?? 0;
  const sunByDate = new Map<string, { sunrise?: string; sunset?: string }>();
  data.daily?.time?.forEach((date, index) => {
    sunByDate.set(date, {
      sunrise: data.daily?.sunrise?.[index],
      sunset: data.daily?.sunset?.[index],
    });
  });

  return {
    current: data.current
      ? normalizeOpenMeteoCurrentPoint(
        data.current,
        sunByDate,
        utcOffsetSeconds
      )
      : undefined,
    forecast: normalizeOpenMeteoHourlyPoints(
      data,
      sunByDate,
      utcOffsetSeconds
    ),
    dailyForecast: normalizeOpenMeteoDailyPoints(data, utcOffsetSeconds),
    attribution: "Weather: Open-Meteo",
    timeZone: data.timezone,
  };
}

async function fetchGoogleJson<T>(
  endpoint: string,
  apiKey: string,
  location: WeatherLocation,
  extraParams: Record<string, string> = {}
): Promise<T> {
  const url = new URL(endpoint);
  url.searchParams.set("key", apiKey);
  url.searchParams.set("location.latitude", String(location.lat));
  url.searchParams.set("location.longitude", String(location.lng));
  url.searchParams.set("unitsSystem", "METRIC");
  for (const [key, value] of Object.entries(extraParams)) {
    url.searchParams.set(key, value);
  }

  const response = await fetch(url);
  if (!response.ok) {
    throw new HttpsError(
      "unavailable",
      `Google Weather request failed: ${response.status} ${response.statusText}`
    );
  }

  return (await response.json()) as T;
}

async function fetchGoogleWeatherAlerts(
  location: WeatherLocation,
  languageCode: string | undefined,
  now: Date
): Promise<WeatherAlertFetchResult> {
  const apiKey = googleAPIKey.value();
  if (!apiKey) {
    throw new HttpsError("failed-precondition", "GOOGLE_API_KEY is not set");
  }

  const url = new URL(
    "https://weather.googleapis.com/v1/publicAlerts:lookup"
  );
  url.searchParams.set("key", apiKey);
  url.searchParams.set("location.latitude", String(location.lat));
  url.searchParams.set("location.longitude", String(location.lng));
  url.searchParams.set("pageSize", "100");
  if (languageCode) {
    url.searchParams.set("languageCode", languageCode);
  }

  const response = await fetch(url);
  if (!response.ok) {
    throw new HttpsError(
      "unavailable",
      `Google Weather alerts request failed: ${response.status} ${response.statusText}`
    );
  }

  const data = (await response.json()) as GoogleWeatherAlertsResponse;
  return {
    alerts: normalizeGoogleWeatherAlerts(data, now),
    countryCode: normalizeCountryCode(data.regionCode),
  };
}

export function normalizeCountryCode(
  value: string | undefined
): string | undefined {
  const normalized = value?.trim().toUpperCase();
  return normalized && /^[A-Z]{2}$/.test(normalized) ? normalized : undefined;
}

export function normalizeGoogleWeatherAlerts(
  value: GoogleWeatherAlertsResponse,
  now: Date
): WeatherAlert[] {
  return (value.weatherAlerts ?? [])
    .flatMap((alert): WeatherAlert[] => {
      const id = truncateText(alert.alertId, 500);
      const title = truncateText(alert.alertTitle?.text, 300);
      const sourceName = truncateText(alert.dataSource?.name, 300);
      const sourceUrl = normalizeHttpUrl(alert.dataSource?.authorityUri);
      const type =
        truncateText(alert.eventType, 100) ??
        "WEATHER_EVENT_TYPE_UNSPECIFIED";
      if (!id || !title || !sourceName || !sourceUrl) {
        return [];
      }

      const normalized = removeUndefinedValues({
        id,
        type,
        title,
        severity: normalizeAlertSeverity(alert.severity),
        certainty: normalizeAlertCertainty(alert.certainty),
        urgency: normalizeAlertUrgency(alert.urgency),
        areaName: truncateText(alert.areaName, 500) ?? "",
        startsAt: normalizeIsoTime(alert.startTime),
        expiresAt: normalizeIsoTime(alert.expirationTime),
        description: truncateText(alert.description, 5000),
        instructions: (alert.instruction ?? [])
          .map((instruction) => truncateText(instruction, 2000))
          .filter((instruction): instruction is string => Boolean(instruction))
          .slice(0, 10),
        safetyRecommendations: (alert.safetyRecommendations ?? [])
          .flatMap((recommendation) => {
            const directive = truncateText(recommendation.directive, 1000);
            if (!directive) {
              return [];
            }
            return [
              removeUndefinedValues({
                directive,
                subtext: truncateText(recommendation.subtext, 2000),
              }),
            ];
          })
          .slice(0, 10),
        source: {
          name: sourceName,
          url: sourceUrl,
        },
      }) as WeatherAlert;

      return isMeaningfulWeatherAlert(normalized, now) ? [normalized] : [];
    })
    .sort(compareWeatherAlerts)
    .slice(0, 20);
}

export function isMeaningfulWeatherAlert(
  alert: WeatherAlert,
  now: Date
): boolean {
  if (
    alert.expiresAt &&
    Date.parse(alert.expiresAt) <= now.getTime()
  ) {
    return false;
  }
  if (alert.urgency === "past" || alert.certainty === "unlikely") {
    return false;
  }
  return !(
    alert.severity === "minor" &&
    alert.urgency !== "immediate" &&
    alert.urgency !== "expected"
  );
}

function compareWeatherAlerts(left: WeatherAlert, right: WeatherAlert): number {
  const severityScore: Record<WeatherAlertSeverity, number> = {
    unknown: 2,
    minor: 1,
    moderate: 3,
    severe: 4,
    extreme: 5,
  };
  const urgencyScore: Record<WeatherAlertUrgency, number> = {
    unknown: 1,
    immediate: 4,
    expected: 3,
    future: 2,
    past: 0,
  };
  return (
    severityScore[right.severity] - severityScore[left.severity] ||
    urgencyScore[right.urgency] - urgencyScore[left.urgency] ||
    left.title.localeCompare(right.title)
  );
}

function normalizeAlertSeverity(
  value: string | undefined
): WeatherAlertSeverity {
  if (value === "MINOR") return "minor";
  if (value === "MODERATE") return "moderate";
  if (value === "SEVERE") return "severe";
  if (value === "EXTREME") return "extreme";
  return "unknown";
}

function normalizeAlertCertainty(
  value: string | undefined
): WeatherAlertCertainty {
  if (value === "OBSERVED") return "observed";
  if (value === "VERY_LIKELY") return "very-likely";
  if (value === "LIKELY") return "likely";
  if (value === "POSSIBLE") return "possible";
  if (value === "UNLIKELY") return "unlikely";
  return "unknown";
}

function normalizeAlertUrgency(
  value: string | undefined
): WeatherAlertUrgency {
  if (value === "IMMEDIATE") return "immediate";
  if (value === "EXPECTED") return "expected";
  if (value === "FUTURE") return "future";
  if (value === "PAST") return "past";
  return "unknown";
}

function normalizeGoogleCurrentPoint(value: GoogleCurrentResponse): WeatherPoint {
  return removeUndefinedValues({
    time: value.currentTime,
    temperatureC: value.temperature?.degrees,
    apparentTemperatureC: value.feelsLikeTemperature?.degrees,
    relativeHumidityPercent: value.relativeHumidity,
    precipitationMm: value.precipitation?.qpf?.quantity,
    precipitationProbabilityPercent: value.precipitation?.probability?.percent,
    uvIndex: value.uvIndex,
    cloudCoverPercent: value.cloudCover,
    windSpeedKmh: value.wind?.speed?.value,
    weatherCode: value.weatherCondition?.type,
    condition: normalizeWeatherCondition(
      "google",
      value.weatherCondition?.type
    ),
    isDay: value.isDaytime,
  });
}

function normalizeGoogleWeatherPoint(value: GoogleHour): WeatherPoint {
  const time = value.interval?.startTime;
  if (!time) {
    throw new HttpsError("internal", "Google hourly forecast missing startTime");
  }

  return removeUndefinedValues({
    time,
    temperatureC: value.temperature?.degrees,
    apparentTemperatureC: value.feelsLikeTemperature?.degrees,
    relativeHumidityPercent: value.relativeHumidity,
    precipitationMm: value.precipitation?.qpf?.quantity,
    precipitationProbabilityPercent: value.precipitation?.probability?.percent,
    uvIndex: value.uvIndex,
    cloudCoverPercent: value.cloudCover,
    windSpeedKmh: value.wind?.speed?.value,
    weatherCode: value.weatherCondition?.type,
    condition: normalizeWeatherCondition(
      "google",
      value.weatherCondition?.type
    ),
    isDay: value.isDaytime,
  });
}

function normalizeGoogleSunWindows(value: GoogleDailyResponse): DailySunWindow[] {
  return (value.forecastDays ?? []).flatMap((day) => {
    const startTime = day.interval?.startTime;
    const endTime = day.interval?.endTime;
    if (!startTime || !endTime) {
      return [];
    }
    return [
      {
        startTime,
        endTime,
        sunrise: day.sunEvents?.sunriseTime,
        sunset: day.sunEvents?.sunsetTime,
      },
    ];
  });
}

export function normalizeGoogleDailyPoints(
  value: GoogleDailyResponse
): DailyWeatherPoint[] {
  return (value.forecastDays ?? []).flatMap((day) => {
    const date = formatGoogleDisplayDate(day.displayDate);
    if (!date) {
      return [];
    }
    const daytime = day.daytimeForecast;
    const nighttime = day.nighttimeForecast;
    const weatherCode =
      daytime?.weatherCondition?.type ?? nighttime?.weatherCondition?.type;

    return [
      removeUndefinedValues({
        date,
        maxTemperatureC: day.maxTemperature?.degrees,
        minTemperatureC: day.minTemperature?.degrees,
        precipitationMm: sumDefined(
          daytime?.precipitation?.qpf?.quantity,
          nighttime?.precipitation?.qpf?.quantity
        ),
        precipitationProbabilityPercent: maxDefined(
          daytime?.precipitation?.probability?.percent,
          nighttime?.precipitation?.probability?.percent
        ),
        uvIndex: daytime?.uvIndex,
        weatherCode,
        condition: normalizeWeatherCondition("google", weatherCode),
        sunrise: day.sunEvents?.sunriseTime,
        sunset: day.sunEvents?.sunsetTime,
      }),
    ];
  });
}

function normalizeOpenMeteoCurrentPoint(
  value: OpenMeteoCurrent,
  sunByDate: Map<string, { sunrise?: string; sunset?: string }>,
  utcOffsetSeconds: number
): WeatherPoint {
  const sun = sunByDate.get(value.time.slice(0, 10));
  return removeUndefinedValues({
    time: normalizeOpenMeteoTime(value.time, utcOffsetSeconds),
    temperatureC: value.temperature_2m,
    apparentTemperatureC: value.apparent_temperature,
    relativeHumidityPercent: value.relative_humidity_2m,
    precipitationMm: value.precipitation,
    cloudCoverPercent: value.cloud_cover,
    windSpeedKmh: value.wind_speed_10m,
    weatherCode: value.weather_code?.toString(),
    condition: normalizeWeatherCondition("open-meteo", value.weather_code),
    sunrise: sun?.sunrise
      ? normalizeOpenMeteoTime(sun.sunrise, utcOffsetSeconds)
      : undefined,
    sunset: sun?.sunset
      ? normalizeOpenMeteoTime(sun.sunset, utcOffsetSeconds)
      : undefined,
    isDay: value.is_day === undefined ? undefined : value.is_day === 1,
  });
}

function normalizeOpenMeteoHourlyPoints(
  data: OpenMeteoResponse,
  sunByDate: Map<string, { sunrise?: string; sunset?: string }>,
  utcOffsetSeconds: number
): WeatherPoint[] {
  const hourly = data.hourly;
  if (!hourly?.time?.length) {
    return [];
  }

  return hourly.time.map((time, index) => {
    const sun = sunByDate.get(time.slice(0, 10));
    return removeUndefinedValues({
      time: normalizeOpenMeteoTime(time, utcOffsetSeconds),
      temperatureC: hourly.temperature_2m?.[index],
      apparentTemperatureC: hourly.apparent_temperature?.[index],
      relativeHumidityPercent: hourly.relative_humidity_2m?.[index],
      precipitationMm: hourly.precipitation?.[index],
      precipitationProbabilityPercent: hourly.precipitation_probability?.[index],
      uvIndex: hourly.uv_index?.[index],
      solarRadiationWm2: hourly.shortwave_radiation?.[index],
      cloudCoverPercent: hourly.cloud_cover?.[index],
      windSpeedKmh: hourly.wind_speed_10m?.[index],
      weatherCode: hourly.weather_code?.[index]?.toString(),
      condition: normalizeWeatherCondition(
        "open-meteo",
        hourly.weather_code?.[index]
      ),
      sunrise: sun?.sunrise
        ? normalizeOpenMeteoTime(sun.sunrise, utcOffsetSeconds)
        : undefined,
      sunset: sun?.sunset
        ? normalizeOpenMeteoTime(sun.sunset, utcOffsetSeconds)
        : undefined,
      isDay: hourly.is_day?.[index] === undefined ? undefined : hourly.is_day[index] === 1,
    });
  });
}

export function normalizeOpenMeteoDailyPoints(
  data: OpenMeteoResponse,
  utcOffsetSeconds: number
): DailyWeatherPoint[] {
  const daily = data.daily;
  if (!daily?.time?.length) {
    return [];
  }

  return daily.time.map((date, index) => {
    const weatherCode = daily.weather_code?.[index];
    return removeUndefinedValues({
      date,
      maxTemperatureC: daily.temperature_2m_max?.[index],
      minTemperatureC: daily.temperature_2m_min?.[index],
      precipitationMm: daily.precipitation_sum?.[index],
      precipitationProbabilityPercent:
        daily.precipitation_probability_max?.[index],
      uvIndex: daily.uv_index_max?.[index],
      weatherCode: weatherCode?.toString(),
      condition: normalizeWeatherCondition("open-meteo", weatherCode),
      sunrise: daily.sunrise?.[index]
        ? normalizeOpenMeteoTime(daily.sunrise[index], utcOffsetSeconds)
        : undefined,
      sunset: daily.sunset?.[index]
        ? normalizeOpenMeteoTime(daily.sunset[index], utcOffsetSeconds)
        : undefined,
    });
  });
}

function buildScheduleForecasts(
  scheduleItems: WeatherScheduleItem[] | undefined,
  forecast: WeatherPoint[]
): WeatherScheduleForecast[] | undefined {
  if (!scheduleItems?.length) {
    return undefined;
  }

  return scheduleItems.map((item) => {
    const start = new Date(item.start);
    const end = new Date(item.end);
    const itemForecast = forecast.filter((point) => {
      const time = new Date(point.time);
      return time.getTime() < end.getTime() && addHours(time, 1).getTime() > start.getTime();
    });

    return removeUndefinedValues({
      id: item.id,
      title: item.title,
      start: item.start,
      end: item.end,
      forecast: itemForecast,
      insights: buildWeatherInsights(itemForecast),
    });
  });
}

function normalizeOpenMeteoTime(
  value: string,
  utcOffsetSeconds = 0
): string {
  if (/[zZ]$|[+-]\d\d:?\d\d$/.test(value)) {
    return new Date(value).toISOString();
  }
  return new Date(
    new Date(`${value}Z`).getTime() - utcOffsetSeconds * 1000
  ).toISOString();
}

export function normalizeWeatherCondition(
  provider: WeatherProvider,
  value: string | number | undefined
): WeatherCondition {
  if (value === undefined) {
    return "unknown";
  }

  return provider === "google"
    ? normalizeGoogleCondition(String(value))
    : normalizeOpenMeteoCondition(Number(value));
}

function normalizeGoogleCondition(value: string): WeatherCondition {
  if (value === "CLEAR") return "clear";
  if (value === "MOSTLY_CLEAR") return "mostly-clear";
  if (value === "PARTLY_CLOUDY") return "partly-cloudy";
  if (value === "MOSTLY_CLOUDY" || value === "CLOUDY") return "cloudy";
  if (value === "WINDY") return "windy";
  if (value === "RAIN_AND_SNOW") return "sleet";
  if (value === "HAIL" || value === "HAIL_SHOWERS") return "hail";
  if (value.includes("THUNDER") || value.includes("SNOWSTORM")) {
    return "thunderstorm";
  }
  if (value.includes("HEAVY_RAIN") || value === "RAIN_PERIODICALLY_HEAVY") {
    return "heavy-rain";
  }
  if (
    value.includes("RAIN") ||
    value.includes("SHOWERS") ||
    value === "WIND_AND_RAIN"
  ) {
    return "rain";
  }
  if (
    value.includes("HEAVY_SNOW") ||
    value === "SNOW_PERIODICALLY_HEAVY" ||
    value === "BLOWING_SNOW"
  ) {
    return "heavy-snow";
  }
  if (value.includes("SNOW")) return "snow";
  return "unknown";
}

function normalizeOpenMeteoCondition(value: number): WeatherCondition {
  if (value === 0) return "clear";
  if (value === 1) return "mostly-clear";
  if (value === 2) return "partly-cloudy";
  if (value === 3) return "cloudy";
  if (value === 45 || value === 48) return "fog";
  if ([51, 53, 55].includes(value)) return "drizzle";
  if ([56, 57, 66, 67].includes(value)) return "freezing-rain";
  if ([61, 63, 80, 81].includes(value)) return "rain";
  if (value === 65 || value === 82) return "heavy-rain";
  if ([71, 73, 77, 85].includes(value)) return "snow";
  if (value === 75 || value === 86) return "heavy-snow";
  if (value === 95) return "thunderstorm";
  if (value === 96 || value === 99) return "hail";
  return "unknown";
}

function filterForecastWindow(
  forecast: WeatherPoint[],
  startTime: Date,
  endTime: Date
): WeatherPoint[] {
  return forecast.filter((point) => {
    const time = new Date(point.time).getTime();
    return time >= startTime.getTime() && time <= endTime.getTime();
  });
}

function nearestPoint(
  points: WeatherPoint[],
  target: Date
): WeatherPoint | undefined {
  return minBy(points, (point) =>
    Math.abs(new Date(point.time).getTime() - target.getTime())
  );
}

function attachSunWindow(
  point: WeatherPoint,
  sunWindows: DailySunWindow[]
): WeatherPoint {
  const time = new Date(point.time).getTime();
  const match = sunWindows.find(
    (window) =>
      time >= new Date(window.startTime).getTime() &&
      time < new Date(window.endTime).getTime()
  );

  return removeUndefinedValues({
    ...point,
    sunrise: match?.sunrise,
    sunset: match?.sunset,
  });
}

function isMeaningfulRain(point: WeatherPoint): boolean {
  return (
    (point.precipitationProbabilityPercent ?? 0) >= RAIN_PROBABILITY_THRESHOLD ||
    (point.precipitationMm ?? 0) >= RAIN_MM_THRESHOLD
  );
}

function findRainPeriods(points: WeatherPoint[]): Array<{ start: string; end: string }> {
  const periods: Array<{ start: string; end: string }> = [];
  let activeStart: string | undefined;
  let lastRainTime: string | undefined;

  for (const point of points) {
    if (isMeaningfulRain(point)) {
      activeStart ??= point.time;
      lastRainTime = point.time;
    } else if (activeStart && lastRainTime) {
      periods.push({ start: activeStart, end: addHours(new Date(lastRainTime), 1).toISOString() });
      activeStart = undefined;
      lastRainTime = undefined;
    }
  }

  if (activeStart && lastRainTime) {
    periods.push({ start: activeStart, end: addHours(new Date(lastRainTime), 1).toISOString() });
  }

  return periods;
}

function findDryWindows(points: WeatherPoint[]): Array<{ start: string; end: string }> {
  const windows: Array<{ start: string; end: string }> = [];
  let activeStart: string | undefined;
  let lastDryTime: string | undefined;

  for (const point of points) {
    if (!isMeaningfulRain(point)) {
      activeStart ??= point.time;
      lastDryTime = point.time;
    } else if (activeStart && lastDryTime) {
      windows.push({ start: activeStart, end: addHours(new Date(lastDryTime), 1).toISOString() });
      activeStart = undefined;
      lastDryTime = undefined;
    }
  }

  if (activeStart && lastDryTime) {
    windows.push({ start: activeStart, end: addHours(new Date(lastDryTime), 1).toISOString() });
  }

  return windows;
}

function estimateSurfaceDrying(
  points: WeatherPoint[],
  firstDryAfterRain: WeatherPoint | undefined
): WeatherInsights["surfaceDrying"] {
  const current = points[0];
  if (!current) {
    return { status: "unknown", confidence: "low", factors: ["no forecast data"] };
  }

  const factors: string[] = [];
  if ((current.temperatureC ?? 10) <= 0) {
    factors.push("freezing risk");
    return { status: "wet", confidence: "low", factors };
  }

  if (isMeaningfulRain(current)) {
    factors.push("active precipitation");
    return { status: "wet", confidence: "medium", factors };
  }

  if (!firstDryAfterRain) {
    factors.push("no recent forecast rain in window");
    return { status: "likely_dry", confidence: "low", factors };
  }

  const dryingScore =
    Math.max(0, (firstDryAfterRain.temperatureC ?? 10) - 5) * 0.5 +
    Math.max(0, 100 - (firstDryAfterRain.relativeHumidityPercent ?? 70)) * 0.05 +
    Math.max(0, firstDryAfterRain.windSpeedKmh ?? 0) * 0.1 +
    Math.max(0, firstDryAfterRain.solarRadiationWm2 ?? 0) * 0.005 -
    Math.max(0, firstDryAfterRain.cloudCoverPercent ?? 50) * 0.02;
  const dryingHours = dryingScore >= 8 ? 1 : dryingScore >= 4 ? 2 : 4;
  factors.push("heuristic from temperature, humidity, wind, cloud cover, and solar radiation");

  return {
    status: "drying",
    estimatedDryAt: addHours(new Date(firstDryAfterRain.time), dryingHours).toISOString(),
    confidence: "low",
    factors,
  };
}

function classifyPrecipitationRisk(
  points: WeatherPoint[],
  maxProbability: number
): WeatherInsights["precipitationRisk"] {
  if (points.some((point) => (point.precipitationMm ?? 0) >= 2 || maxProbability >= 70)) {
    return "high";
  }
  if (points.some((point) => isMeaningfulRain(point))) {
    return "medium";
  }
  if (maxProbability >= 20 || points.some((point) => (point.precipitationMm ?? 0) > 0)) {
    return "low";
  }
  return "none";
}

function classifySunExposure(point: WeatherPoint | undefined): WeatherInsights["sunExposure"] {
  if (!point?.isDay) {
    return "dark";
  }
  const score = sunExposureScore(point);
  if (score >= 8) {
    return "harsh";
  }
  if (score >= 4) {
    return "moderate";
  }
  return "low";
}

function sunExposureScore(point: WeatherPoint): number {
  const uvScore = point.uvIndex ?? 0;
  const radiationScore = (point.solarRadiationWm2 ?? 0) / 100;
  const cloudPenalty = (point.cloudCoverPercent ?? 50) / 25;
  return Math.max(0, uvScore + radiationScore - cloudPenalty);
}

function buildSummary(
  point: WeatherPoint | undefined,
  precipitationRisk: WeatherInsights["precipitationRisk"],
  sunExposure: WeatherInsights["sunExposure"]
): string {
  if (!point) {
    return "Weather forecast unavailable";
  }
  if (isMeaningfulRain(point)) {
    return "Rain likely";
  }
  if (precipitationRisk === "medium" || precipitationRisk === "high") {
    return "Rain possible later";
  }
  if (sunExposure === "harsh") {
    return "Harsh sun";
  }
  return point.weatherCode ? formatWeatherCode(point.weatherCode) : "Dry conditions";
}

function formatWeatherCode(code: string): string {
  return code
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function parseLocation(value: unknown): WeatherLocation {
  if (!isRecord(value)) {
    throw new HttpsError("invalid-argument", "location must be an object");
  }
  const lat = value["lat"];
  const lng = value["lng"];
  if (
    typeof lat !== "number" ||
    !Number.isFinite(lat) ||
    lat < -90 ||
    lat > 90 ||
    typeof lng !== "number" ||
    !Number.isFinite(lng) ||
    lng < -180 ||
    lng > 180
  ) {
    throw new HttpsError("invalid-argument", "location must contain valid lat/lng");
  }
  return { lat, lng };
}

function parseProviderOverride(value: unknown): WeatherProvider | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === "google" || value === "open-meteo") {
    return value;
  }
  throw new HttpsError("invalid-argument", "invalid providerOverride");
}

function parseLanguageCode(value: unknown): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (
    typeof value !== "string" ||
    value.length > 35 ||
    !/^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(value)
  ) {
    throw new HttpsError("invalid-argument", "invalid languageCode");
  }
  return value;
}

function parseScheduleItems(value: unknown): WeatherScheduleItem[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    throw new HttpsError("invalid-argument", "scheduleItems must be an array");
  }
  if (value.length > 50) {
    throw new HttpsError("invalid-argument", "scheduleItems may contain at most 50 items");
  }
  return value.map((item, index) => {
    if (!isRecord(item)) {
      throw new HttpsError("invalid-argument", `scheduleItems[${index}] must be an object`);
    }
    const start = parseIsoDate(item["start"], `scheduleItems[${index}].start`);
    const end = parseIsoDate(item["end"], `scheduleItems[${index}].end`);
    if (end.getTime() <= start.getTime()) {
      throw new HttpsError(
        "invalid-argument",
        `scheduleItems[${index}].end must be after start`
      );
    }
    return removeUndefinedValues({
      id: typeof item["id"] === "string" ? item["id"].slice(0, 120) : undefined,
      title: typeof item["title"] === "string" ? item["title"].slice(0, 200) : undefined,
      start: start.toISOString(),
      end: end.toISOString(),
    });
  });
}

function parseIsoDate(value: unknown, fieldName: string): Date {
  if (typeof value !== "string") {
    throw new HttpsError("invalid-argument", `${fieldName} must be an ISO timestamp`);
  }
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) {
    throw new HttpsError("invalid-argument", `${fieldName} must be a valid ISO timestamp`);
  }
  return date;
}

function parseIntegerInRange(
  value: unknown,
  min: number,
  max: number,
  fieldName: string
): number {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < min ||
    value > max
  ) {
    throw new HttpsError(
      "invalid-argument",
      `${fieldName} must be an integer from ${min} to ${max}`
    );
  }
  return value;
}

function parseWeatherTileScope(value: unknown): WeatherTileScope | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!isRecord(value) || value["type"] !== "mercator-tile") {
    throw new HttpsError(
      "invalid-argument",
      "spatialScope must be a mercator tile"
    );
  }

  const zoom = parseIntegerInRange(value["zoom"], 0, 22, "spatialScope.zoom");
  const maxTileIndex = 2 ** zoom - 1;
  const x = parseIntegerInRange(
    value["x"],
    0,
    maxTileIndex,
    "spatialScope.x"
  );
  const y = parseIntegerInRange(
    value["y"],
    0,
    maxTileIndex,
    "spatialScope.y"
  );
  return { type: "mercator-tile", zoom, x, y };
}

function getWeatherTileCenter(scope: WeatherTileScope): WeatherLocation {
  const tileCount = 2 ** scope.zoom;
  const lng = ((scope.x + 0.5) / tileCount) * 360 - 180;
  const mercatorY =
    Math.PI * (1 - (2 * (scope.y + 0.5)) / tileCount);
  const lat = (Math.atan(Math.sinh(mercatorY)) * 180) / Math.PI;
  return { lat, lng };
}

function assertForecastWindowSupported(
  startTime: Date,
  endTime: Date,
  provider: WeatherProvider,
  now: Date
): void {
  if (endTime.getTime() < floorToHour(now).getTime()) {
    throw new HttpsError("invalid-argument", "weather forecast window is in the past");
  }
  const maxHours =
    provider === "google" ? GOOGLE_MAX_FORECAST_HOURS : OPEN_METEO_MAX_FORECAST_HOURS;
  const maxEnd = addHours(floorToHour(now), maxHours);
  if (startTime.getTime() > maxEnd.getTime() || endTime.getTime() > maxEnd.getTime()) {
    throw new HttpsError(
      "invalid-argument",
      `weather forecast window exceeds ${provider} forecast range`
    );
  }
}

function roundCoordinate(value: number): string {
  return (Math.round(value * 100) / 100).toFixed(2);
}

function floorToHour(date: Date): Date {
  const next = new Date(date);
  next.setUTCMinutes(0, 0, 0);
  return next;
}

function ceilToHour(date: Date): Date {
  const floored = floorToHour(date);
  return floored.getTime() === date.getTime() ? floored : addHours(floored, 1);
}

function addHours(date: Date, hours: number): Date {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function removeUndefinedValues<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, entryValue]) => entryValue !== undefined)
  ) as T;
}

function truncateText(
  value: string | undefined,
  maxLength: number
): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed.slice(0, maxLength) : undefined;
}

function normalizeIsoTime(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }
  const time = Date.parse(value);
  return Number.isFinite(time) ? new Date(time).toISOString() : undefined;
}

function normalizeHttpUrl(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:"
      ? url.toString()
      : undefined;
  } catch {
    return undefined;
  }
}

function maxDefined(
  ...values: Array<number | undefined>
): number | undefined {
  const defined = values.filter((value): value is number => value !== undefined);
  return defined.length ? Math.max(...defined) : undefined;
}

function sumDefined(
  ...values: Array<number | undefined>
): number | undefined {
  const defined = values.filter((value): value is number => value !== undefined);
  return defined.length
    ? defined.reduce((total, value) => total + value, 0)
    : undefined;
}

function formatGoogleDisplayDate(
  value: GoogleDate | undefined
): string | undefined {
  if (
    !value?.year ||
    !value.month ||
    !value.day ||
    value.month < 1 ||
    value.month > 12 ||
    value.day < 1 ||
    value.day > 31
  ) {
    return undefined;
  }
  return [
    value.year.toString().padStart(4, "0"),
    value.month.toString().padStart(2, "0"),
    value.day.toString().padStart(2, "0"),
  ].join("-");
}

function maxBy<T>(items: T[], score: (item: T) => number): T | undefined {
  return items.reduce<T | undefined>((best, item) => {
    if (!best || score(item) > score(best)) {
      return item;
    }
    return best;
  }, undefined);
}

function minBy<T>(items: T[], score: (item: T) => number): T | undefined {
  return items.reduce<T | undefined>((best, item) => {
    if (!best || score(item) < score(best)) {
      return item;
    }
    return best;
  }, undefined);
}

interface GoogleTemperature {
  degrees?: number;
}

interface GooglePrecipitation {
  probability?: { percent?: number };
  qpf?: { quantity?: number };
}

interface GoogleWind {
  speed?: { value?: number };
}

interface GoogleWeatherCondition {
  type?: string;
}

interface GoogleDate {
  year?: number;
  month?: number;
  day?: number;
}

interface GoogleDayPart {
  weatherCondition?: GoogleWeatherCondition;
  precipitation?: GooglePrecipitation;
  uvIndex?: number;
}

interface GoogleCurrentResponse {
  currentTime: string;
  timeZone?: { id?: string };
  isDaytime?: boolean;
  weatherCondition?: GoogleWeatherCondition;
  temperature?: GoogleTemperature;
  feelsLikeTemperature?: GoogleTemperature;
  relativeHumidity?: number;
  uvIndex?: number;
  precipitation?: GooglePrecipitation;
  wind?: GoogleWind;
  cloudCover?: number;
}

interface GoogleHour {
  interval?: { startTime?: string; endTime?: string };
  isDaytime?: boolean;
  weatherCondition?: GoogleWeatherCondition;
  temperature?: GoogleTemperature;
  feelsLikeTemperature?: GoogleTemperature;
  relativeHumidity?: number;
  uvIndex?: number;
  precipitation?: GooglePrecipitation;
  wind?: GoogleWind;
  cloudCover?: number;
}

interface GoogleHourlyResponse {
  forecastHours?: GoogleHour[];
  timeZone?: { id?: string };
}

interface GoogleDailyResponse {
  forecastDays?: Array<{
    interval?: { startTime?: string; endTime?: string };
    displayDate?: GoogleDate;
    daytimeForecast?: GoogleDayPart;
    nighttimeForecast?: GoogleDayPart;
    maxTemperature?: GoogleTemperature;
    minTemperature?: GoogleTemperature;
    sunEvents?: { sunriseTime?: string; sunsetTime?: string };
  }>;
}

export interface GoogleWeatherAlertsResponse {
  weatherAlerts?: GoogleWeatherAlert[];
  regionCode?: string;
}

interface GoogleWeatherAlert {
  alertId?: string;
  alertTitle?: { text?: string; languageCode?: string };
  eventType?: string;
  areaName?: string;
  instruction?: string[];
  safetyRecommendations?: Array<{
    directive?: string;
    subtext?: string;
  }>;
  startTime?: string;
  expirationTime?: string;
  dataSource?: {
    publisher?: string;
    name?: string;
    authorityUri?: string;
  };
  description?: string;
  severity?: string;
  certainty?: string;
  urgency?: string;
}

interface OpenMeteoCurrent {
  time: string;
  temperature_2m?: number;
  relative_humidity_2m?: number;
  apparent_temperature?: number;
  is_day?: number;
  precipitation?: number;
  weather_code?: number;
  cloud_cover?: number;
  wind_speed_10m?: number;
}

interface OpenMeteoHourly {
  time?: string[];
  temperature_2m?: number[];
  relative_humidity_2m?: number[];
  apparent_temperature?: number[];
  precipitation_probability?: number[];
  precipitation?: number[];
  weather_code?: number[];
  cloud_cover?: number[];
  wind_speed_10m?: number[];
  uv_index?: number[];
  shortwave_radiation?: number[];
  is_day?: number[];
}

interface OpenMeteoResponse {
  timezone?: string;
  utc_offset_seconds?: number;
  current?: OpenMeteoCurrent;
  hourly?: OpenMeteoHourly;
  daily?: {
    time?: string[];
    weather_code?: number[];
    temperature_2m_max?: number[];
    temperature_2m_min?: number[];
    precipitation_sum?: number[];
    precipitation_probability_max?: number[];
    uv_index_max?: number[];
    sunrise?: string[];
    sunset?: string[];
  };
}
