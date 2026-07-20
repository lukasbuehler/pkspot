export type TemperatureUnit = "celsius" | "fahrenheit";
export type TemperatureUnitPreference = "local" | TemperatureUnit;

const FAHRENHEIT_COUNTRY_CODES = new Set(["US"]);

export function resolveTemperatureUnit(
  preference: TemperatureUnitPreference,
  countryCode?: string,
): TemperatureUnit {
  if (preference !== "local") {
    return preference;
  }
  return countryCode &&
    FAHRENHEIT_COUNTRY_CODES.has(countryCode.toUpperCase())
    ? "fahrenheit"
    : "celsius";
}

export function formatTemperature(
  temperatureC: number,
  unit: TemperatureUnit,
  includeUnit = true,
): string {
  const value =
    unit === "fahrenheit" ? (temperatureC * 9) / 5 + 32 : temperatureC;
  const suffix = unit === "fahrenheit" ? "F" : "C";
  return includeUnit
    ? `${Math.round(value)} °${suffix}`
    : `${Math.round(value)}°`;
}
