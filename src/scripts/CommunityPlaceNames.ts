import type { CommunityPageSchema, CommunityPlaceLocalization } from "../db/schemas/CommunityPageSchema";

// Data coverage is intentionally broader than the app's enabled UI languages.
export const COMMUNITY_NAME_LOCALES = [
  "en", "de", "de-CH", "fr", "it", "es", "nl", "pt", "pt-BR", "pt-PT",
  "zh", "zh-Hans", "zh-Hant", "ru", "ko", "ja", "pl", "cs", "tr",
] as const;

// Stable, non-secret identity shared with readers so stale enrichment is ignored.
export function communityPlaceFingerprint(page: CommunityPageSchema): string {
  return JSON.stringify([
    page.communityKey, page.scope, page.geography.countryCode,
    page.geography.regionCode, page.geography.regionName,
    page.geography.localityName, page.geography.localityLocalName,
  ]);
}

export function currentPlaceLocalization(page: CommunityPageSchema) {
  return page.place_localization?.fingerprint === communityPlaceFingerprint(page)
    ? page.place_localization : undefined;
}

export function localizedPlaceName(
  localization: CommunityPlaceLocalization | undefined,
  overrides: Record<string, string> | undefined,
  locale: string,
  fallback: string,
): string {
  const language = locale.split("-")[0];
  return overrides?.[locale] || overrides?.[language] ||
    localization?.names[locale] || localization?.names[language] || fallback;
}

export function localizedCountryName(code: string | undefined, locale: string, fallback: string): string {
  if (!code || !/^[a-z]{2}$/i.test(code)) return fallback;
  try {
    return new Intl.DisplayNames([locale], { type: "region", fallback: "none" })
      .of(code.toUpperCase()) || fallback;
  } catch { return fallback; }
}

// Inflection belongs to presentation, not GeoNames or the community identity.
// Explicit phrase overrides cover names with exceptional articles or local usage.
export function communityLocationPhrase(
  name: string,
  scope: CommunityPageSchema["scope"],
  countryCode: string | undefined,
  locale: string,
  overrides?: Record<string, string>,
): string {
  const language = locale.split("-")[0];
  const override = overrides?.[locale] || overrides?.[language];
  if (override) return override;
  const code = countryCode?.toUpperCase() ?? "";
  if (scope !== "country") {
    if (language === "fr") {
      if (name.startsWith("Le ")) return `au ${name.slice(3)}`;
      if (name.startsWith("Les ")) return `aux ${name.slice(4)}`;
      return `à ${name}`;
    }
    if (language === "it") {
      if (name.startsWith("Il ")) return `al ${name.slice(3)}`;
      if (/^L['’]/.test(name)) return `all’${name.slice(2)}`;
      return `a ${name}`;
    }
    return `${language === "es" ? "en" : "in"} ${name}`;
  }
  if (language === "fr") {
    if (["US", "NL", "PH", "AE", "BS", "KM", "MV", "SC", "MH", "SB", "TC", "VG", "VI", "CK", "FK", "FO", "PN"].includes(code)) return `aux ${name}`;
    if (["CU", "CY", "MT", "BH", "SG", "TW", "MG", "MU", "NR", "KI", "TV", "VU", "ST", "SM", "DJ"].includes(code)) return `à ${name}`;
    if (code === "HT") return `en ${name}`;
    const masculineEndingE = ["MX", "MZ", "KH", "ZW", "BZ", "SR"];
    return `${/^[aàâeéèêiîoôuû]/i.test(name) || (/e$/i.test(name) && !masculineEndingE.includes(code)) ? "en" : "au"} ${name}`;
  }
  if (language === "de") {
    const inflected: Record<string, string> = {
      GB: "im Vereinigten Königreich", US: "in den Vereinigten Staaten",
      AE: "in den Vereinigten Arabischen Emiraten", NL: "in den Niederlanden",
      DO: "in der Dominikanischen Republik", CF: "in der Zentralafrikanischen Republik",
    };
    if (inflected[code]) return inflected[code];
    if (["CH", "TR", "UA", "SK", "DO", "CF", "MN"].includes(code)) return `in der ${name}`;
    if (["US", "NL", "PH", "AE", "BS", "MV", "SC", "KM", "MH", "SB"].includes(code)) return `in den ${name}`;
    if (["IR", "IQ", "LB", "SD", "SS", "TD", "YE", "VA"].includes(code)) return `im ${name}`;
    return `in ${name}`;
  }
  if (language === "it") {
    if (code === "US" || code === "AE") return `negli ${name}`;
    if (code === "NL") return `nei ${name}`;
    if (["PH", "SC", "MV", "BS", "KM", "MH", "SB"].includes(code)) return `nelle ${name}`;
    if (["CU", "MT", "CY", "SG", "SM", "ST", "TW"].includes(code)) return `a ${name}`;
    return `in ${name}`;
  }
  if (language === "es") return `en ${name}`;
  if (language === "nl" && code === "GB") return `in het ${name}`;
  if (language === "nl") return `in ${["US", "AE", "GB", "PH", "BS", "MV", "SC", "KM", "MH", "SB"].includes(code) ? "de " : ""}${name}`;
  return `in ${["US", "GB", "NL", "PH", "AE", "BS", "MV", "SC", "KM", "MH", "SB", "DO", "CF", "GM"].includes(code) ? "the " : ""}${name}`;
}
