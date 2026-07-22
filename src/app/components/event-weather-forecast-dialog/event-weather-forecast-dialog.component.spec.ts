import { signal } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { MAT_DIALOG_DATA } from "@angular/material/dialog";
import { AccountPreferencesService } from "../../services/account-preferences.service";
import type { WeatherResponse } from "../../weather/weather.models";
import {
  EventWeatherForecastDialogComponent,
  type EventWeatherForecastDialogData,
} from "./event-weather-forecast-dialog.component";

describe("EventWeatherForecastDialogComponent", () => {
  let fixture: ComponentFixture<EventWeatherForecastDialogComponent>;
  const response: WeatherResponse = {
    provider: "google",
    mode: "event-forecast",
    location: { lat: 47.37, lng: 8.54 },
    generatedAt: "2026-07-22T06:00:00Z",
    expiresAt: "2026-07-22T06:45:00Z",
    attribution: "Weather: Google Weather",
    forecast: [
      { time: "2026-07-23T08:00:00Z", condition: "clear", temperatureC: 17 },
      { time: "2026-07-23T09:00:00Z", condition: "rain", temperatureC: 18 },
      { time: "2026-07-23T10:00:00Z", condition: "cloudy", temperatureC: 19 },
      { time: "2026-07-24T09:00:00Z", condition: "clear", temperatureC: 22 },
    ],
    dailyForecast: [
      {
        date: "2026-07-23",
        condition: "rain",
        maxTemperatureC: 20,
        minTemperatureC: 14,
        precipitationProbabilityPercent: 70,
      },
      {
        date: "2026-07-24",
        condition: "clear",
        maxTemperatureC: 25,
        minTemperatureC: 16,
      },
    ],
    insights: {
      summary: "Rain likely",
      precipitationRisk: "high",
      sunExposure: "low",
      surfaceDrying: {
        status: "wet",
        confidence: "medium",
        factors: [],
      },
    },
  };
  const data: EventWeatherForecastDialogData = {
    eventName: "WPF Camp",
    eventStart: new Date("2026-07-23T08:30:00Z"),
    eventEnd: new Date("2026-07-25T18:00:00Z"),
    timeZone: "UTC",
    response,
    selection: {
      date: "2026-07-23",
      time: new Date("2026-07-23T09:30:00Z"),
    },
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        { provide: MAT_DIALOG_DATA, useValue: data },
        {
          provide: AccountPreferencesService,
          useValue: { temperatureUnit: signal("celsius") },
        },
      ],
    });
    fixture = TestBed.createComponent(EventWeatherForecastDialogComponent);
  });

  it("lists all event days and marks missing forecast days", async () => {
    await fixture.whenStable();

    expect(fixture.nativeElement.querySelectorAll(".event-day")).toHaveLength(3);
    expect(fixture.nativeElement.textContent).toContain("Forecast not available yet");
    expect(fixture.nativeElement.textContent).toContain("20°");
    expect(fixture.nativeElement.textContent).toContain("14°");
  });

  it("clips the selected day hours and highlights the containing hour", async () => {
    await fixture.whenStable();

    const hours = fixture.nativeElement.querySelectorAll(".weather-hour");
    expect(hours).toHaveLength(3);
    expect(hours[1].classList).toContain("highlighted");
    expect(hours[1].textContent).toContain("18°");
  });

  it("shows an unavailable hourly state when selecting an uncovered day", async () => {
    await fixture.whenStable();

    const days = fixture.nativeElement.querySelectorAll(
      ".event-day",
    ) as NodeListOf<HTMLButtonElement>;
    days[2].click();
    await fixture.whenStable();

    expect(fixture.nativeElement.querySelectorAll(".weather-hour")).toHaveLength(0);
    expect(fixture.nativeElement.textContent).toContain(
      "Hourly forecast is not available for this event day yet.",
    );
  });
});
