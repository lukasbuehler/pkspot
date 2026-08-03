import { LOCALE_ID } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import {
  DateTimeFormatService,
  createDateTimeFormatter,
  inferRegionFromTimeZone,
  regionalizeLocale,
  resolveHourCycle,
} from "./date-time-format.service";
import { AppSettingsService } from "./app-settings.service";

describe("DateTimeFormatService", () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [{ provide: LOCALE_ID, useValue: "en" }],
    });
  });

  it("combines the UI language with the system region", () => {
    expect(regionalizeLocale("en", "de-CH")).toBe("en-CH");
    expect(regionalizeLocale("de-CH", "en-US")).toBe("de-CH");
    expect(regionalizeLocale("en", "en-US-u-hc-h23")).toBe(
      "en-US-u-hc-h23",
    );
  });

  it("honors a 24-hour preference independently of an en-US locale", () => {
    const formatter = createDateTimeFormatter(
      { locale: "en-US", hourCycle: "h23" },
      {
        dateStyle: "short",
        timeStyle: "short",
        timeZone: "UTC",
      },
    );

    const parts = formatter.formatToParts(new Date("2026-07-21T18:05:00Z"));
    expect(parts.find((part) => part.type === "hour")?.value).toBe("18");
    expect(parts.some((part) => part.type === "dayPeriod")).toBe(false);
    expect(parts.findIndex((part) => part.type === "month")).toBeLessThan(
      parts.findIndex((part) => part.type === "day"),
    );
  });

  it("maps IANA time zones to their CLDR territory", () => {
    expect(inferRegionFromTimeZone("Europe/Zurich")).toBe("CH");
    expect(inferRegionFromTimeZone("Asia/Kolkata")).toBe("IN");
  });

  it("uses territory-specific 24-hour conventions across regions", () => {
    expect(resolveHourCycle("en-US", "Europe/Zurich", "h12")).toBe("h23");
    expect(resolveHourCycle("en-US", "Africa/Johannesburg", "h12")).toBe("h23");
    expect(resolveHourCycle("en-US", "Asia/Tokyo", "h12")).toBe("h23");
  });

  it("honors language-specific territory conventions", () => {
    expect(resolveHourCycle("fr-US", "America/Toronto", "h12")).toBe("h23");
  });

  it("keeps 12-hour regional conventions and browser 24-hour overrides", () => {
    expect(resolveHourCycle("en-US", "America/New_York", "h12")).toBe("h12");
    expect(resolveHourCycle("en-US", "America/New_York", "h23")).toBe("h23");
    expect(resolveHourCycle("en-US-u-hc-h12", "Europe/Zurich", "h12")).toBe(
      "h12",
    );
  });

  it("allows an explicit time format to override automatic detection", () => {
    const settings = TestBed.inject(AppSettingsService);
    const service = TestBed.inject(DateTimeFormatService);

    settings.timeFormat.set("24-hour");
    expect(service.preferences().hourCycle).toBe("h23");

    settings.timeFormat.set("12-hour");
    expect(service.preferences().hourCycle).toBe("h12");
  });

  it("uses the regional locale for date order", () => {
    const formatter = createDateTimeFormatter(
      { locale: "en-GB", hourCycle: "h23" },
      { dateStyle: "short", timeZone: "UTC" },
    );
    const parts = formatter.formatToParts(new Date("2026-07-21T18:05:00Z"));

    expect(parts.findIndex((part) => part.type === "day")).toBeLessThan(
      parts.findIndex((part) => part.type === "month"),
    );
  });

  it("formats app presets through the resolved preferences", () => {
    const service = TestBed.inject(DateTimeFormatService);
    expect(service.formatPreset(new Date("2026-07-21T18:05:00Z"), "longDate"))
      .toContain("2026");
  });

  it("formats date ranges in an explicitly supplied event time zone", () => {
    const service = TestBed.inject(DateTimeFormatService);
    const instant = new Date("2026-01-01T00:30:00.000Z");

    const zurich = service.formatDateRange(
      instant,
      instant,
      "long",
      "Europe/Zurich",
    );
    const losAngeles = service.formatDateRange(
      instant,
      instant,
      "long",
      "America/Los_Angeles",
    );

    expect(zurich).toContain("2026");
    expect(losAngeles).toContain("2025");
    expect(zurich).not.toBe(losAngeles);
  });
});
