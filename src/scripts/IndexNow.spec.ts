import { describe, expect, it } from "vitest";
import {
  INDEXNOW_KEY,
  INDEXNOW_KEY_LOCATION,
  buildLocalizedIndexNowUrls,
} from "../../functions/src/indexNow";
import { BASE_URL, SUPPORTED_LOCALES } from "../../functions/src/sitemapXml";

describe("indexNow", () => {
  it("builds one URL per localized public route", () => {
    expect(buildLocalizedIndexNowUrls("/map/spots/spot-dame-du-lac")).toEqual(
      SUPPORTED_LOCALES.map(
        (locale) => `${BASE_URL}/${locale}/map/spots/spot-dame-du-lac`
      )
    );
  });

  it("uses a root key file location matching the submitted key", () => {
    expect(INDEXNOW_KEY).toMatch(/^[a-f0-9]{32}$/u);
    expect(INDEXNOW_KEY_LOCATION).toBe(`${BASE_URL}/${INDEXNOW_KEY}.txt`);
  });
});
