import { describe, expect, it } from "vitest";
import { getGooglePlaceOpeningHoursStatus } from "./google-place-opening-hours";

describe("getGooglePlaceOpeningHoursStatus", () => {
  it("reads the public Google Maps opening hours fields", () => {
    const status = getGooglePlaceOpeningHoursStatus(
      openingHours([
        period({ day: 2, hour: 10, minute: 0 }, { day: 2, hour: 17, minute: 0 }),
      ]),
      "en-US",
      new Date(2026, 5, 23, 13, 30),
    );

    expect(status.isOpenNow).toBe(true);
    expect(status.openStatusText).toBe("Open now until 5:00 PM");
    expect(status.todayHoursText).toBe("Open 10:00 AM-5:00 PM");
  });

  it("shows upcoming hours later today", () => {
    const status = getGooglePlaceOpeningHoursStatus(
      openingHours([
        period({ day: 2, hour: 15, minute: 0 }, { day: 2, hour: 18, minute: 0 }),
      ]),
      "en-US",
      new Date(2026, 5, 23, 13, 30),
    );

    expect(status.isOpenNow).toBe(false);
    expect(status.openStatusText).toBe("Opens at 3:00 PM");
    expect(status.todayHoursText).toBe("Open 3:00 PM-6:00 PM");
  });

  it("shows the next opening when today's hours are already over", () => {
    const status = getGooglePlaceOpeningHoursStatus(
      openingHours([
        period({ day: 2, hour: 10, minute: 0 }, { day: 2, hour: 12, minute: 0 }),
        period({ day: 3, hour: 8, minute: 0 }, { day: 3, hour: 17, minute: 0 }),
      ]),
      "en-US",
      new Date(2026, 5, 23, 13, 30),
    );

    expect(status.isOpenNow).toBe(false);
    expect(status.openStatusText).toBeNull();
    expect(status.todayHoursText).toBe("Closed · Opens Wed. 8:00 AM");
  });

  it("handles overnight periods that close after midnight", () => {
    const status = getGooglePlaceOpeningHoursStatus(
      openingHours([
        period({ day: 6, hour: 22, minute: 0 }, { day: 0, hour: 2, minute: 0 }),
      ]),
      "en-US",
      new Date(2026, 5, 28, 1, 0),
    );

    expect(status.isOpenNow).toBe(true);
    expect(status.openStatusText).toBe("Open now until 2:00 AM");
    expect(status.todayHoursText).toBeNull();
  });

  it("handles always-open places", () => {
    const status = getGooglePlaceOpeningHoursStatus(
      openingHours([period({ day: 0, hour: 0, minute: 0 }, null)]),
      "en-US",
      new Date(2026, 5, 23, 13, 30),
    );

    expect(status.isOpenNow).toBe(true);
    expect(status.openStatusText).toBe("Open 24 hours");
    expect(status.todayHoursText).toBeNull();
  });
});

function openingHours(periods: OpeningHoursPeriodTestDouble[]) {
  return { periods };
}

function period(
  open: OpeningHoursPointTestDouble,
  close: OpeningHoursPointTestDouble | null,
): OpeningHoursPeriodTestDouble {
  return { open, close };
}

type OpeningHoursPeriodTestDouble = {
  readonly open: OpeningHoursPointTestDouble;
  readonly close: OpeningHoursPointTestDouble | null;
};

type OpeningHoursPointTestDouble = {
  readonly day: number;
  readonly hour: number;
  readonly minute: number;
};
