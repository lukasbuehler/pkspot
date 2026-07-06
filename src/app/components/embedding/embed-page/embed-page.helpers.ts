import { ParamMap } from "@angular/router";

export type EmbedType = "map" | "event" | "event-map";

export type SupportedEmbedLanguage =
  | "en"
  | "de"
  | "de-CH"
  | "fr"
  | "it"
  | "nl"
  | "es";

export type EmbedLanguage = SupportedEmbedLanguage | "auto";

export interface EmbedCreditText {
  iframeTitle: string;
  interactiveLabel: string;
  dataByLabel: string;
}

export const defaultEmbedType: EmbedType = "event";

export const supportedEmbedLanguageCodes: SupportedEmbedLanguage[] = [
  "en",
  "de",
  "de-CH",
  "fr",
  "it",
  "nl",
  "es",
];

export const embedCreditTextByLanguage: Record<
  SupportedEmbedLanguage,
  EmbedCreditText
> = {
  en: {
    iframeTitle: "PK Spot embedded event",
    interactiveLabel: "Interactive event embed",
    dataByLabel: "Event data by",
  },
  de: {
    iframeTitle: "Eingebetteter PK Spot Event",
    interactiveLabel: "Interaktiver Event-Embed",
    dataByLabel: "Eventdaten von",
  },
  "de-CH": {
    iframeTitle: "Eingebetteter PK Spot Event",
    interactiveLabel: "Interaktiver Event-Embed",
    dataByLabel: "Eventdaten von",
  },
  fr: {
    iframeTitle: "Événement PK Spot intégré",
    interactiveLabel: "Événement interactif intégré",
    dataByLabel: "Données d'événement par",
  },
  it: {
    iframeTitle: "Evento PK Spot incorporato",
    interactiveLabel: "Evento interattivo incorporato",
    dataByLabel: "Dati evento da",
  },
  nl: {
    iframeTitle: "Ingesloten PK Spot-evenement",
    interactiveLabel: "Interactieve evenementembed",
    dataByLabel: "Evenementgegevens door",
  },
  es: {
    iframeTitle: "Evento PK Spot insertado",
    interactiveLabel: "Evento interactivo insertado",
    dataByLabel: "Datos del evento de",
  },
};

export function coerceEmbedType(value: string | null): EmbedType | null {
  if (value === "map" || value === "event" || value === "event-map") {
    return value;
  }

  return null;
}

export function coerceEmbedLanguage(value: string | null): EmbedLanguage | null {
  if (value === "auto") return "auto";
  if (supportedEmbedLanguageCodes.includes(value as SupportedEmbedLanguage)) {
    return value as SupportedEmbedLanguage;
  }

  return null;
}

export function normalizeEmbedLanguage(
  value: string | null | undefined,
): SupportedEmbedLanguage {
  if (value === "de-CH") return "de-CH";

  const language = value?.split("-")[0];
  const supported = supportedEmbedLanguageCodes.find(
    (code) => code === language,
  );

  return supported ?? "en";
}

export function embedCreditTextForLanguage(
  value: string | null | undefined,
): EmbedCreditText {
  return embedCreditTextByLanguage[normalizeEmbedLanguage(value)];
}

export function readEmbedPageEventId(paramMap: ParamMap): string | null {
  const eventId = paramMap.get("eventId")?.trim();
  return eventId || null;
}

export function readEmbedPageType(paramMap: ParamMap): EmbedType | null {
  return coerceEmbedType(paramMap.get("embedType") ?? paramMap.get("type"));
}

export function readEmbedPageLanguage(
  paramMap: ParamMap,
): EmbedLanguage | null {
  return coerceEmbedLanguage(
    paramMap.get("language") ?? paramMap.get("lang"),
  );
}

export function buildEmbedPageQueryParams(input: {
  eventId: string;
  embedType: EmbedType;
  language: EmbedLanguage;
}): Record<string, string | null> {
  const eventId = input.eventId.trim();

  return {
    eventId: eventId || null,
    embedType: input.embedType,
    language: input.language === "auto" ? null : input.language,
  };
}
