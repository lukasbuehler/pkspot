import {
  eventCalendarFilterParams,
  eventCalendarTypesenseFilters,
  eventCountryFlag,
  eventCountryName,
  eventCountryTypesenseFilter,
  mergeEventCountryFacets,
  readEventCalendarFilters,
} from "./event-calendar-filters";
import { eventCalendarFeedName } from "./event-calendar-feed-name";
import { eventCalendarSubscribeLinks } from "./event-calendar-subscribe";

const read = (query: string) => {
  const params = new URLSearchParams(query);
  return readEventCalendarFilters((key) => params.getAll(key));
};

describe("event calendar filters", () => {
  it("reads, validates and de-duplicates URL filters", () => {
    expect(
      read(
        "country=ch,DE,xx,ch&country=fr&region=europe,mars&category=jam,unknown&tier=formal,secret&series=swiss-tour,bad%20id",
      ),
    ).toEqual({
      countries: ["CH", "DE", "FR"],
      regions: ["europe"],
      categories: ["jam"],
      listingTiers: ["formal"],
      seriesIds: ["swiss-tour"],
    });
  });

  it("serializes filters back to canonical lowercase country parameters", () => {
    expect(eventCalendarFilterParams(read("country=CH,de&region=europe"))).toEqual({
      country: "ch,de",
      region: "europe",
    });
  });

  it("matches a country through either the community key or country_code", () => {
    expect(eventCountryTypesenseFilter(["ch", "DE"])).toBe(
      "(community_keys:=[`country:ch`,`country:de`] || country_code:=[`CH`,`DE`])",
    );
    expect(eventCountryTypesenseFilter([])).toBeUndefined();
    expect(eventCalendarTypesenseFilters(read("region=europe&category=jam")).filter(Boolean)).toEqual([
      "region_keys:=[`europe`]",
      "event_categories:=[`jam`]",
    ]);
  });

  it("merges country facets without double counting", () => {
    expect(
      mergeEventCountryFacets(
        [
          { value: "country:ch", count: 10 },
          { value: "locality:ch:zh:zurich", count: 4 },
          { value: "country:es", count: 1 },
        ],
        [
          { value: "ES", count: 2 },
          { value: "JP", count: 1 },
          { value: "??", count: 3 },
        ],
      ),
    ).toEqual([
      { value: "CH", count: 10 },
      { value: "ES", count: 2 },
      { value: "JP", count: 1 },
    ]);
  });

  it("labels countries with a flag and a localized name", () => {
    expect(eventCountryFlag("ch")).toBe("🇨🇭");
    expect(eventCountryName("CH", "de")).toBe("Schweiz");
    expect(eventCountryName("CH", "en")).toBe("Switzerland");
  });

  it("names the feed after the selected places", () => {
    expect(eventCalendarFeedName(read("country=ch"), "en")).toBe(
      "PK Spot events · Switzerland",
    );
    expect(eventCalendarFeedName(read("region=europe"), "en")).toBe(
      "PK Spot events · Europe",
    );
    expect(eventCalendarFeedName(read(""), "en")).toBe("PK Spot events");
  });

  it("builds subscription links for the feed", () => {
    const links = eventCalendarSubscribeLinks(
      "https://pkspot.app",
      read("country=ch&category=jam"),
      "PK Spot events · Switzerland",
      "de",
    );
    expect(links.feedUrl).toBe(
      "https://pkspot.app/calendar/events.ics?country=ch&category=jam&lang=de",
    );
    expect(links.webcalUrl).toBe(
      "webcal://pkspot.app/calendar/events.ics?country=ch&category=jam&lang=de",
    );
    expect(new URL(links.googleUrl).searchParams.get("cid")).toBe(links.webcalUrl);
    expect(new URL(links.outlookUrl).searchParams.get("url")).toBe(links.feedUrl);
    expect(new URL(links.outlookUrl).searchParams.get("name")).toBe(
      "PK Spot events · Switzerland",
    );
  });
});
