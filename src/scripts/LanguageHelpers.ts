import { LocaleCode, LocaleMap } from "../db/models/Interfaces";

export function makeLocaleMapFromObject(
  obj: Record<string, string> | LocaleMap
): LocaleMap {
  const localeMap: LocaleMap = {};
  for (const key of Object.keys(obj) as LocaleCode[]) {
    const textOrObj = obj[key];
    if (typeof textOrObj === "string") {
      localeMap[key] = {
        text: textOrObj,
        provider: "user",
        timestamp: new Date(),
      };
    } else {
      localeMap[key] = textOrObj;
    }
  }

  return localeMap;
}

export function getBestLocale(
  availableLocales: LocaleCode[],
  locale: LocaleCode
): string {
  const requested = locale.replace(/_/g, "-").toLowerCase();
  const language = requested.split("-")[0];
  const locales = [...availableLocales].sort();
  const exact = (value: string) => locales.find((key) => key.toLowerCase().replace(/_/g, "-") === value);
  return exact(requested) ?? exact(language) ??
    locales.find((key) => key.toLowerCase().split(/[-_]/)[0] === language) ??
    exact("en") ?? locales[0] ?? locale;
}
