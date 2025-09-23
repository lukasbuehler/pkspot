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
  if (availableLocales.includes(locale)) {
    return locale;
  } else if (availableLocales.length > 0) {
    // try to get a locale with the same language (first two letters)
    const language = locale.substring(0, 2);
    const bestLocale = availableLocales.find((loc) => loc.startsWith(language));
    if (bestLocale) {
      return bestLocale;
    }
    // if no locale with the same language is found, return the first available locale
    return availableLocales[0];
  } else {
    // No available locales: fall back to requested locale to let callers handle missing values
    return locale;
  }
}
