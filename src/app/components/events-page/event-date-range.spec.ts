// @vitest-environment node
import { describe, expect, it } from "vitest";
import { eventDateRangeWindow } from "./event-date-range";

const seconds = (date: Date) => Math.floor(date.getTime() / 1000);

describe("eventDateRangeWindow", () => {
  it("covers the coming Saturday and Sunday on a weekday", () => {
    const wednesday = new Date(2026, 10, 18, 10, 0);
    expect(eventDateRangeWindow("weekend", wednesday)).toEqual({
      endsAfterSeconds: seconds(new Date(2026, 10, 21, 0, 0)),
      startsBeforeSeconds: seconds(new Date(2026, 10, 22, 23, 59, 59)),
    });
  });

  it("covers the rest of the weekend once it has started", () => {
    const sunday = new Date(2026, 10, 22, 15, 30);
    expect(eventDateRangeWindow("weekend", sunday)).toEqual({
      endsAfterSeconds: seconds(sunday),
      startsBeforeSeconds: seconds(new Date(2026, 10, 22, 23, 59, 59)),
    });
  });

  it("counts today as the first of the next 7 days", () => {
    const now = new Date(2026, 10, 30, 9, 0);
    expect(eventDateRangeWindow("week", now)).toEqual({
      endsAfterSeconds: seconds(now),
      startsBeforeSeconds: seconds(new Date(2026, 11, 6, 23, 59, 59)),
    });
  });
});
