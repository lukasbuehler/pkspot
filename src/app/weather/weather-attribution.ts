import { WeatherProvider } from "./weather.models";

/** Localized "Weather: <provider>" credit; provider names stay untranslated. */
export function weatherAttribution(provider: WeatherProvider): string {
  const name = provider === "open-meteo" ? "Open-Meteo" : "Google Weather";
  return $localize`:@@weather.attribution:Weather: ${name}:PROVIDER:`;
}
