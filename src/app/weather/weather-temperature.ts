export type TemperatureUnit = "celsius" | "fahrenheit";

const FAHRENHEIT_REGIONS = new Set(["US"]);

export function getExplicitTemperatureUnit(
  locale: string | undefined,
): TemperatureUnit | undefined {
  if (!locale) {
    return undefined;
  }

  try {
    const subtags = new Intl.Locale(locale)
      .toString()
      .toLowerCase()
      .split("-");
    const unicodeExtensionIndex = subtags.indexOf("u");
    if (unicodeExtensionIndex < 0) {
      return undefined;
    }

    const extensions = new Map<string, string>();
    for (
      let index = unicodeExtensionIndex + 1;
      index < subtags.length;
      index++
    ) {
      const key = subtags[index];
      if (key.length === 1) {
        break;
      }
      if (key.length === 2 && subtags[index + 1]?.length >= 3) {
        extensions.set(key, subtags[index + 1]);
      }
    }

    const unit = extensions.get("mu");
    if (unit === "celsius") return "celsius";
    if (unit === "fahrenhe") return "fahrenheit";

    const system = extensions.get("ms");
    if (system === "ussystem") return "fahrenheit";
    if (system === "metric" || system === "uksystem") return "celsius";
  } catch {
    return undefined;
  }

  return undefined;
}

export function getDefaultTemperatureUnit(
  locale: string | undefined,
): TemperatureUnit {
  if (!locale) {
    return "celsius";
  }
  try {
    const region = new Intl.Locale(locale).maximize().region;
    return region && FAHRENHEIT_REGIONS.has(region)
      ? "fahrenheit"
      : "celsius";
  } catch {
    return "celsius";
  }
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
