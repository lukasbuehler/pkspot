import { LOCALE_ID } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import {
  DateTimeFormatService,
  createDateTimeFormatter,
  regionalizeLocale,
} from "./date-time-format.service";

describe("DateTimeFormatService", () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [{ provide: LOCALE_ID, useValue: "en" }],
    });
  });

  it("combines the UI language with the system region", () => {
    expect(regionalizeLocale("en", "de-CH")).toBe("en-CH");
    expect(regionalizeLocale("de-CH", "en-US")).toBe("de-CH");
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
});
