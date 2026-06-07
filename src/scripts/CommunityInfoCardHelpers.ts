import type { LocaleMap } from "../db/models/Interfaces";
import type {
  CommunityInfoCardCategory,
  CommunityLocalizedTextSchema,
} from "../db/schemas/CommunityPageSchema";
import { getBestLocale, makeLocaleMapFromObject } from "./LanguageHelpers";

export function communityInfoCardCategoryIcon(
  category: CommunityInfoCardCategory | null | undefined,
): string {
  switch (category) {
    case "jams":
      return "person_celebrate";
    case "chat":
      return "forum";
    case "classes":
      return "school";
    case "spots":
      return "place";
    case "events":
      return "person_celebrate";
    case "safety":
      return "health_and_safety";
    case "other":
    default:
      return "info";
  }
}

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
