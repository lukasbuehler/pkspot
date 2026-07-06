import { convertToParamMap } from "@angular/router";
import { describe, expect, it } from "vitest";
import {
  buildEmbedPageQueryParams,
  embedCreditTextForLanguage,
  normalizeEmbedLanguage,
  readEmbedPageEventId,
  readEmbedPageLanguage,
  readEmbedPageType,
} from "./embed-page.helpers";

describe("embed page helpers", () => {
  it("reads canonical embed page query parameters", () => {
    const paramMap = convertToParamMap({
      eventId: " swissjam26 ",
      embedType: "event-map",
      language: "de-CH",
    });

    expect(readEmbedPageEventId(paramMap)).toBe("swissjam26");
    expect(readEmbedPageType(paramMap)).toBe("event-map");
    expect(readEmbedPageLanguage(paramMap)).toBe("de-CH");
  });

  it("accepts short aliases but canonicalizes the generated query state", () => {
    const paramMap = convertToParamMap({
      type: "event",
      lang: "fr",
    });

    expect(readEmbedPageType(paramMap)).toBe("event");
    expect(readEmbedPageLanguage(paramMap)).toBe("fr");
    expect(
      buildEmbedPageQueryParams({
        eventId: " swissjam26 ",
        embedType: "event-map",
        language: "fr",
      }),
    ).toEqual({
      eventId: "swissjam26",
      embedType: "event-map",
      language: "fr",
    });
  });

  it("omits eventId and language when the default language is used", () => {
    expect(
      buildEmbedPageQueryParams({
        eventId: "",
        embedType: "event",
        language: "auto",
      }),
    ).toEqual({
      eventId: null,
      embedType: "event",
      language: null,
    });
  });

  it("normalizes locale variants for embed credit text", () => {
    expect(normalizeEmbedLanguage("fr-CH")).toBe("fr");
    expect(normalizeEmbedLanguage("pt-BR")).toBe("en");
    expect(embedCreditTextForLanguage("de-CH").dataByLabel).toBe(
      "Eventdaten von",
    );
  });
});
