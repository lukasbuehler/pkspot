import { signal } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { AccountPreferencesService } from "../../services/account-preferences.service";
import type { WeatherResponse } from "../../weather/weather.models";
import { EventWeatherHoursComponent } from "./event-weather-hours.component";

describe("EventWeatherHoursComponent", () => {
  let fixture: ComponentFixture<EventWeatherHoursComponent>;
  const response: WeatherResponse = {
    provider: "google",
    mode: "event-forecast",
    location: { lat: 47.37, lng: 8.54 },
    generatedAt: "2026-07-22T06:00:00Z",
    expiresAt: "2026-07-22T06:45:00Z",
    attribution: "Weather: Google Weather",
    forecast: [
      { time: "2026-07-23T08:00:00Z", condition: "clear", temperatureC: 17 },
      {
        time: "2026-07-23T09:00:00Z",
        condition: "rain",
        temperatureC: 18,
        precipitationProbabilityPercent: 70,
      },
      { time: "2026-07-24T09:00:00Z", condition: "cloudy", temperatureC: 19 },
    ],
    insights: {
      summary: "Rain likely",
      precipitationRisk: "high",
      sunExposure: "low",
      surfaceDrying: { status: "wet", confidence: "medium", factors: [] },
    },
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        {
          provide: AccountPreferencesService,
          useValue: { temperatureUnit: signal("celsius") },
        },
      ],
    });
    fixture = TestBed.createComponent(EventWeatherHoursComponent);
    fixture.componentRef.setInput("response", response);
    fixture.componentRef.setInput("date", "2026-07-23");
    fixture.componentRef.setInput(
      "eventStart",
      new Date("2026-07-23T08:30:00Z"),
    );
    fixture.componentRef.setInput(
      "eventEnd",
      new Date("2026-07-23T18:00:00Z"),
    );
    fixture.componentRef.setInput("timeZone", "UTC");
    fixture.componentRef.setInput(
      "highlightedTime",
      new Date("2026-07-23T09:30:00Z"),
    );
  });

  it("clips hourly weather to the event and highlights the selected hour", async () => {
    await fixture.whenStable();

    const hours = fixture.nativeElement.querySelectorAll(".weather-hour");
    expect(hours).toHaveLength(2);
    expect(hours[1].classList).toContain("highlighted");
    expect(hours[1].textContent).toContain("18°");
    expect(hours[1].textContent).toContain("70%");
    expect(fixture.nativeElement.textContent).toContain(
      "Weather: Google Weather",
    );
  });
});
