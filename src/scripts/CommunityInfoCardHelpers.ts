import type { LocaleMap } from "../db/models/Interfaces";
import type { CommunityLocalizedTextSchema } from "../db/schemas/CommunityPageSchema";
import { getBestLocale, makeLocaleMapFromObject } from "./LanguageHelpers";

export function communityLocalizedText(
  value: CommunityLocalizedTextSchema | null | undefined,
  locale: string,
): string {
  if (!value) {
    return "";
  }

  const localeMap = makeLocaleMapFromObject(
    value as Record<string, string> | LocaleMap,
  );
  const availableLocales = Object.keys(localeMap).filter((key) => {
    const text = localeMap[key]?.text;
    return typeof text === "string" && text.trim().length > 0;
  });

  if (availableLocales.length === 0) {
    return "";
  }

  const bestLocale = getBestLocale(availableLocales, locale);
  return localeMap[bestLocale]?.text.trim() ?? "";
}
