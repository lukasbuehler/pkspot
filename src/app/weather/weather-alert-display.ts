import type { WeatherAlert } from "./weather.models";

export interface WeatherAlertDisplay {
  icon: string;
  label: string;
}

type WeatherAlertCategory =
  | "cold"
  | "coastal"
  | "dangerous-waters"
  | "drought"
  | "earthquake"
  | "fire"
  | "fire-weather"
  | "flood"
  | "hail"
  | "heat"
  | "landslide"
  | "precipitation"
  | "radiation"
  | "snow-ice"
  | "storm"
  | "tornado"
  | "tropical-storm"
  | "tsunami"
  | "visibility"
  | "volcano"
  | "wind";

const EVENT_CATEGORIES: Readonly<Record<string, WeatherAlertCategory>> = {
  ACID_RAIN: "precipitation",
  AFTERSHOCK: "earthquake",
  BLIZZARD: "snow-ice",
  BLOWING_SNOW: "snow-ice",
  BUSHFIRE: "fire",
  COASTAL_FLOOD: "coastal",
  COASTAL_HAZARD: "coastal",
  COLD: "cold",
  CYCLONE: "tropical-storm",
  DROUGHT: "drought",
  DUST_STORM: "visibility",
  EARTHQUAKE: "earthquake",
  EXTRATROPICAL_CYCLONE: "storm",
  FIRE: "fire",
  FIRE_WEATHER: "fire-weather",
  FLASH_FLOOD: "flood",
  FLOOD: "flood",
  FOG: "visibility",
  FREEZING: "snow-ice",
  FREEZING_AIR_TEMPERATURE: "snow-ice",
  FREEZING_DRIZZLE: "snow-ice",
  FREEZING_RAIN: "snow-ice",
  FROST: "snow-ice",
  GALE: "wind",
  GLAZE: "snow-ice",
  HAIL: "hail",
  HAZARDOUS_SEAS: "dangerous-waters",
  HEAT: "heat",
  HUMIDITY: "heat",
  HURRICANE: "tropical-storm",
  ICE_STORM: "snow-ice",
  LAKE_EFFECT_SNOW: "snow-ice",
  LANDSLIDE: "landslide",
  MONSOON: "precipitation",
  MUDDY_FLOOD: "flood",
  OUTFLOW: "wind",
  RADIATION: "radiation",
  RAIN: "precipitation",
  RIVER_FLOODING: "flood",
  SEVERE_THUNDERSTORM_WARNING: "storm",
  SNOW: "snow-ice",
  SNOWSQUALL: "snow-ice",
  STORM: "storm",
  STORM_SURGE: "coastal",
  THUNDER: "storm",
  THUNDERSTORM: "storm",
  TORNADO: "tornado",
  TORNADO_WARNING: "tornado",
  TROPICAL_CYCLONE: "tropical-storm",
  TROPICAL_CYCLONE_WARNINGS_AND_WATCHES: "tropical-storm",
  TROPICAL_DISTURBANCE: "tropical-storm",
  TROPICAL_STORM: "tropical-storm",
  TSUNAMI: "tsunami",
  TYPHOON: "tropical-storm",
  VOLCANIC_ASH: "volcano",
  VOLCANIC_ERUPTION: "volcano",
  WILDFIRE: "fire",
  WIND: "wind",
  WIND_CHILL: "cold",
  WIND_WAVE: "dangerous-waters",
  WINTER_STORM: "snow-ice",
};

export function isHeatWeatherAlert(
  alert: Pick<WeatherAlert, "type">,
): boolean {
  return EVENT_CATEGORIES[alert.type.toUpperCase()] === "heat";
}

export function getWeatherAlertDisplay(
  alert: Pick<WeatherAlert, "severity" | "title" | "type">,
): WeatherAlertDisplay {
  const category = EVENT_CATEGORIES[alert.type.toUpperCase()];
  if (!category) {
    return {
      icon: "warning",
      label:
        alert.title ||
        $localize`:@@weather.alert.category.general:Official alert`,
    };
  }

  switch (category) {
    case "heat":
      return {
        icon: "thermometer_alert",
        label:
          alert.severity === "extreme"
            ? $localize`:@@weather.alert.category.extreme_heat:Extreme heat`
            : $localize`:@@weather.alert.category.heat:Heat warning`,
      };
    case "cold":
      return {
        icon: "severe_cold",
        label:
          alert.severity === "extreme"
            ? $localize`:@@weather.alert.category.extreme_cold:Extreme cold`
            : $localize`:@@weather.alert.category.cold:Cold warning`,
      };
    case "fire":
      return {
        icon: "emergency_heat",
        label: $localize`:@@weather.alert.category.wildfire:Wildfire`,
      };
    case "fire-weather":
      return {
        icon: "emergency_heat",
        label: $localize`:@@weather.alert.category.fire_danger:Fire danger`,
      };
    case "storm":
      return {
        icon: "thunderstorm",
        label: $localize`:@@weather.alert.category.thunderstorm:Thunderstorm`,
      };
    case "tornado":
      return {
        icon: "tornado",
        label: $localize`:@@weather.alert.category.tornado:Tornado`,
      };
    case "tropical-storm":
      return {
        icon: "cyclone",
        label: $localize`:@@weather.alert.category.tropical_storm:Tropical storm`,
      };
    case "wind":
      return {
        icon: "air",
        label: $localize`:@@weather.alert.category.wind:Strong wind`,
      };
    case "flood":
      return {
        icon: "flood",
        label: $localize`:@@weather.alert.category.flood:Flooding`,
      };
    case "precipitation":
      return {
        icon: "water",
        label: $localize`:@@weather.alert.category.precipitation:Heavy rain`,
      };
    case "hail":
      return {
        icon: "weather_hail",
        label: $localize`:@@weather.alert.category.hail:Hail`,
      };
    case "snow-ice":
      return {
        icon: "severe_cold",
        label: $localize`:@@weather.alert.category.snow_ice:Snow and ice`,
      };
    case "drought":
      return {
        icon: "format_color_reset",
        label: $localize`:@@weather.alert.category.drought:Drought`,
      };
    case "visibility":
      return {
        icon: "foggy",
        label: $localize`:@@weather.alert.category.visibility:Reduced visibility`,
      };
    case "coastal":
      return {
        icon: "waves",
        label: $localize`:@@weather.alert.category.coastal:Coastal hazard`,
      };
    case "dangerous-waters":
      return {
        icon: "waves",
        label: $localize`:@@weather.alert.category.dangerous_waters:Dangerous waters`,
      };
    case "earthquake":
      return {
        icon: "earthquake",
        label: $localize`:@@weather.alert.category.earthquake:Earthquake`,
      };
    case "landslide":
      return {
        icon: "landslide",
        label: $localize`:@@weather.alert.category.landslide:Landslide`,
      };
    case "volcano":
      return {
        icon: "volcano",
        label: $localize`:@@weather.alert.category.volcano:Volcanic hazard`,
      };
    case "tsunami":
      return {
        icon: "tsunami",
        label: $localize`:@@weather.alert.category.tsunami:Tsunami`,
      };
    case "radiation":
      return {
        icon: "warning",
        label: $localize`:@@weather.alert.category.radiation:Radiation hazard`,
      };
  }
}
