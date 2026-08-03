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

export type WeatherTone = "neutral" | "sun" | "wet" | "cold" | "severe";
export type WeatherForecastIconTone =
  | "neutral"
  | "wet"
  | "warning"
  | "night";

export interface WeatherForecastIconContext {
  condition: WeatherCondition;
  temperatureC?: number;
  uvIndex?: number;
  precipitationMm?: number;
  precipitationProbabilityPercent?: number;
  isDay?: boolean;
}

export interface WeatherStateDefinition {
  dayIcon: string;
  nightIcon?: string;
  label: string;
  tone: WeatherTone;
}

export const WEATHER_STATES = {
  clear: {
    dayIcon: "sunny",
    nightIcon: "moon_stars",
    label: $localize`:@@weather.state.clear:Clear`,
    tone: "sun",
  },
  "mostly-clear": {
    dayIcon: "sunny",
    nightIcon: "moon_stars",
    label: $localize`:@@weather.state.mostly_clear:Mostly clear`,
    tone: "sun",
  },
  "partly-cloudy": {
    dayIcon: "cloud",
    label: $localize`:@@weather.state.partly_cloudy:Partly cloudy`,
    tone: "neutral",
  },
  cloudy: {
    dayIcon: "cloud",
    label: $localize`:@@weather.state.cloudy:Cloudy`,
    tone: "neutral",
  },
  fog: {
    dayIcon: "cloud",
    label: $localize`:@@weather.state.fog:Foggy`,
    tone: "neutral",
  },
  drizzle: {
    dayIcon: "rainy",
    label: $localize`:@@weather.state.drizzle:Drizzle`,
    tone: "wet",
  },
  rain: {
    dayIcon: "rainy",
    label: $localize`:@@weather.state.rain:Rain`,
    tone: "wet",
  },
  "heavy-rain": {
    dayIcon: "umbrella",
    label: $localize`:@@weather.state.heavy_rain:Heavy rain`,
    tone: "severe",
  },
  "freezing-rain": {
    dayIcon: "ac_unit",
    label: $localize`:@@weather.state.freezing_rain:Freezing rain`,
    tone: "severe",
  },
  sleet: {
    dayIcon: "ac_unit",
    label: $localize`:@@weather.state.sleet:Sleet`,
    tone: "cold",
  },
  snow: {
    dayIcon: "ac_unit",
    label: $localize`:@@weather.state.snow:Snow`,
    tone: "cold",
  },
  "heavy-snow": {
    dayIcon: "ac_unit",
    label: $localize`:@@weather.state.heavy_snow:Heavy snow`,
    tone: "severe",
  },
  thunderstorm: {
    dayIcon: "rainy",
    label: $localize`:@@weather.state.thunderstorm:Thunderstorm`,
    tone: "severe",
  },
  hail: {
    dayIcon: "ac_unit",
    label: $localize`:@@weather.state.hail:Hail`,
    tone: "severe",
  },
  windy: {
    dayIcon: "cloud",
    label: $localize`:@@weather.state.windy:Windy`,
    tone: "neutral",
  },
  unknown: {
    dayIcon: "cloud",
    label: $localize`:@@weather.state.unknown:Weather unavailable`,
    tone: "neutral",
  },
} satisfies Record<WeatherCondition, WeatherStateDefinition>;

export type WeatherWarning =
  | "rain-expected"
  | "heavy-rain"
  | "thunderstorm"
  | "hail"
  | "ice-risk"
  | "harsh-sun"
  | "high-uv"
  | "high-temperature"
  | "strong-wind"
  | "poor-air-quality"
  | "wet-surface";

export type WeatherWarningSeverity = "info" | "caution" | "high";
export type WeatherWarningTone = "primary" | "error";

export interface WeatherWarningDefinition {
  icon: string;
  label: string;
  message: string;
  severity: WeatherWarningSeverity;
  tone: WeatherWarningTone;
}

export const WEATHER_WARNINGS = {
  "rain-expected": {
    icon: "rainy",
    label: $localize`:@@weather.warning.rain_expected.label:Rain expected`,
    message: $localize`:@@weather.warning.rain_expected.message:Rain is expected during this forecast.`,
    severity: "caution",
    tone: "primary",
  },
  "heavy-rain": {
    icon: "umbrella",
    label: $localize`:@@weather.warning.heavy_rain.label:Heavy rain`,
    message: $localize`:@@weather.warning.heavy_rain.message:Heavy rain could make training surfaces unsafe.`,
    severity: "high",
    tone: "error",
  },
  thunderstorm: {
    icon: "warning",
    label: $localize`:@@weather.warning.thunderstorm.label:Thunderstorm risk`,
    message: $localize`:@@weather.warning.thunderstorm.message:Avoid exposed structures while thunderstorms are possible.`,
    severity: "high",
    tone: "error",
  },
  hail: {
    icon: "warning",
    label: $localize`:@@weather.warning.hail.label:Hail risk`,
    message: $localize`:@@weather.warning.hail.message:Hail is possible during this forecast.`,
    severity: "high",
    tone: "error",
  },
  "ice-risk": {
    icon: "ac_unit",
    label: $localize`:@@weather.warning.ice_risk.label:Ice risk`,
    message: $localize`:@@weather.warning.ice_risk.message:Surfaces may be icy or freezing.`,
    severity: "high",
    tone: "error",
  },
  "harsh-sun": {
    icon: "sunny",
    label: $localize`:@@weather.warning.harsh_sun.label:Harsh sunlight`,
    message: $localize`:@@weather.warning.harsh_sun.message:Exposed obstacles may become very hot in direct sunlight.`,
    severity: "caution",
    tone: "error",
  },
  "high-uv": {
    icon: "brightness_alert",
    label: $localize`:@@weather.warning.high_uv.label:High UV`,
    message: $localize`:@@weather.warning.high_uv.message:UV exposure is high. Consider sun protection.`,
    severity: "caution",
    tone: "error",
  },
  "high-temperature": {
    icon: "thermostat",
    label: $localize`:@@weather.warning.high_temperature.label:Hot conditions`,
    message: $localize`:@@weather.warning.high_temperature.message:Current heat may make intense training more demanding. Take breaks and stay hydrated.`,
    severity: "caution",
    tone: "error",
  },
  "strong-wind": {
    icon: "warning",
    label: $localize`:@@weather.warning.strong_wind.label:Strong wind`,
    message: $localize`:@@weather.warning.strong_wind.message:Strong wind may affect balance and exposed training.`,
    severity: "caution",
    tone: "error",
  },
  "poor-air-quality": {
    icon: "warning",
    label: $localize`:@@weather.warning.poor_air_quality.label:Poor air quality`,
    message: $localize`:@@weather.warning.poor_air_quality.message:Air quality may be unsuitable for intense outdoor exercise.`,
    severity: "high",
    tone: "error",
  },
  "wet-surface": {
    icon: "water_drop",
    label: $localize`:@@weather.warning.wet_surface.label:Wet surfaces`,
    message: $localize`:@@weather.warning.wet_surface.message:Training surfaces are likely to be wet or slippery.`,
    severity: "caution",
    tone: "primary",
  },
} satisfies Record<WeatherWarning, WeatherWarningDefinition>;

export function getWeatherStateIcon(
  condition: WeatherCondition,
  isDay = true,
): string {
  const state: WeatherStateDefinition = WEATHER_STATES[condition];
  return isDay ? state.dayIcon : state.nightIcon ?? state.dayIcon;
}

const WET_FORECAST_CONDITIONS = new Set<WeatherCondition>([
  "drizzle",
  "rain",
  "heavy-rain",
  "freezing-rain",
  "sleet",
  "snow",
  "heavy-snow",
  "thunderstorm",
  "hail",
]);

export const HIGH_UV_INDEX_THRESHOLD = 8;

export function getWeatherForecastIconTone(
  point: WeatherForecastIconContext,
): WeatherForecastIconTone {
  if (
    WET_FORECAST_CONDITIONS.has(point.condition) ||
    (point.precipitationProbabilityPercent ?? 0) >= 40 ||
    (point.precipitationMm ?? 0) >= 0.2
  ) {
    return "wet";
  }
  if (
    (point.temperatureC ?? -Infinity) >= 30 ||
    (point.uvIndex ?? 0) >= HIGH_UV_INDEX_THRESHOLD
  ) {
    return "warning";
  }
  return point.isDay === false ? "night" : "neutral";
}

export function getDailyWeatherForecastIconTone(
  point: Pick<WeatherForecastIconContext, "condition" | "temperatureC">,
): WeatherForecastIconTone {
  if (WET_FORECAST_CONDITIONS.has(point.condition)) {
    return "wet";
  }
  return (point.temperatureC ?? -Infinity) >= 30 ? "warning" : "neutral";
}
