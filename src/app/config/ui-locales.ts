import { LocaleCode } from "../../db/models/Interfaces";

export const SUPPORTED_UI_LOCALES = [
  "en",
  "de",
  "fr",
  "it",
  "es",
  "nl",
] as const satisfies readonly LocaleCode[];

export type SupportedUiLocale = (typeof SUPPORTED_UI_LOCALES)[number];

export const LEGACY_UI_LOCALE_REDIRECTS = {
  "de-CH": "de",
} as const satisfies Readonly<Record<string, SupportedUiLocale>>;

const supportedUiLocaleSet = new Set<string>(SUPPORTED_UI_LOCALES);

export function isKnownUiLocalePrefix(
  locale: string | null | undefined,
): boolean {
  return Boolean(
    locale &&
      (supportedUiLocaleSet.has(locale) ||
        Object.hasOwn(LEGACY_UI_LOCALE_REDIRECTS, locale)),
  );
}

export function normalizeUiLocale(
  locale: string | null | undefined,
): SupportedUiLocale {
  const localeValue = locale?.trim().replace("_", "-");
  if (!localeValue) {
    return "en";
  }
  const [languagePart, regionPart] = localeValue.split("-");
  const language = languagePart.toLowerCase();
  const region = regionPart?.toUpperCase();
  const normalized = region ? `${language}-${region}` : language;

  if (supportedUiLocaleSet.has(normalized)) {
    return normalized as SupportedUiLocale;
  }

  if (Object.hasOwn(LEGACY_UI_LOCALE_REDIRECTS, normalized)) {
    return LEGACY_UI_LOCALE_REDIRECTS[
      normalized as keyof typeof LEGACY_UI_LOCALE_REDIRECTS
    ];
  }

  const baseLocale = normalized.split("-")[0];
  return supportedUiLocaleSet.has(baseLocale)
    ? (baseLocale as SupportedUiLocale)
    : "en";
}
