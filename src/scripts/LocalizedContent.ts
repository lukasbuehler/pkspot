import type { LocaleMap } from "../db/models/Interfaces";

export type LocalizedContent = LocaleMap | Record<string, string> | undefined;
export interface SelectedContent { text: string; locale?: string }
const normalize = (locale: string) => locale.replace(/_/g, "-").toLowerCase();

/** Preserve the source language instead of claiming that fallback text was translated. */
export function selectLocalizedContent(
  values: LocalizedContent, locale: string, legacy = "", originalLocale?: string,
): SelectedContent {
  const entries = Object.entries(values ?? {}).map(([key, value]) => ({
    locale: key, text: typeof value === "string" ? value : value?.text ?? "",
  })).filter((entry) => entry.text.trim()).sort((a, b) => a.locale.localeCompare(b.locale));
  const requested = normalize(locale), base = requested.split("-")[0];
  const exact = (key: string) => entries.find((entry) => normalize(entry.locale) === normalize(key));
  const translated = exact(requested) ?? exact(base) ?? entries.find((entry) => normalize(entry.locale).split("-")[0] === base);
  if (translated) return translated;
  const original = originalLocale ? exact(originalLocale) : undefined;
  if (original) return original;
  if (legacy.trim()) return { text: legacy, locale: originalLocale };
  return exact("en") ?? entries[0] ?? { text: "" };
}

export function contentLanguageLabel(contentLocale: string | undefined, uiLocale: string): string {
  if (!contentLocale || normalize(contentLocale).split("-")[0] === normalize(uiLocale).split("-")[0]) return "";
  try {
    const language = new Intl.DisplayNames([uiLocale], { type: "language" }).of(contentLocale) ?? contentLocale;
    return $localize`:@@content.original_language:Original language: ${language}:LANGUAGE:`;
  } catch { return ""; }
}
