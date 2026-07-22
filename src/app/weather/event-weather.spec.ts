import {
  dailyForecastByDate,
  enumerateEventDateKeys,
  eventDateKey,
  eventHoursForDate,
  forecastHourAt,
} from "./event-weather";
import type { WeatherPoint } from "./weather.models";

describe("event weather mapping", () => {
  const forecast: WeatherPoint[] = [
    { time: "2026-07-22T08:00:00Z", condition: "clear" },
    { time: "2026-07-22T09:00:00Z", condition: "rain" },
    { time: "2026-07-23T08:00:00Z", condition: "cloudy" },
  ];

  it("uses the event timezone for date keys and inclusive active days", () => {
    expect(
      eventDateKey(new Date("2026-07-21T22:30:00Z"), "Europe/Zurich"),
    ).toBe("2026-07-22");
    expect(
      enumerateEventDateKeys(
        new Date("2026-07-21T22:30:00Z"),
        new Date("2026-07-24T22:00:00Z"),
        "Europe/Zurich",
      ),
    ).toEqual(["2026-07-22", "2026-07-23", "2026-07-24"]);
  });

  it("finds the forecast hour containing an itinerary start", () => {
    expect(
      forecastHourAt(forecast, new Date("2026-07-22T08:45:00Z"))?.condition,
    ).toBe("clear");
    expect(
      forecastHourAt(forecast, new Date("2026-07-22T10:00:00Z")),
    ).toBeUndefined();
  });

  it("clips hourly points to the selected event day and event bounds", () => {
    expect(
      eventHoursForDate(
        forecast,
        "2026-07-22",
        new Date("2026-07-22T08:30:00Z"),
        new Date("2026-07-23T08:30:00Z"),
        "UTC",
      ).map((point) => point.time),
    ).toEqual(["2026-07-22T08:00:00Z", "2026-07-22T09:00:00Z"]);
  });

  it("indexes daily forecasts without inventing missing days", () => {
    const byDate = dailyForecastByDate([
      { date: "2026-07-22", condition: "clear" },
    ]);
    expect(byDate.get("2026-07-22")?.condition).toBe("clear");
    expect(byDate.has("2026-07-23")).toBe(false);
  });
});
