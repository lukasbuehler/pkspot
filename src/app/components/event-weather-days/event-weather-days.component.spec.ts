import { signal } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { AccountPreferencesService } from "../../services/account-preferences.service";
import type { WeatherResponse } from "../../weather/weather.models";
import { EventWeatherDaysComponent } from "./event-weather-days.component";

describe("EventWeatherDaysComponent", () => {
  let fixture: ComponentFixture<EventWeatherDaysComponent>;
  const response: WeatherResponse = {
    provider: "google",
    mode: "event-forecast",
    location: { lat: 47.37, lng: 8.54 },
    generatedAt: "2026-07-22T06:00:00Z",
    expiresAt: "2026-07-22T06:45:00Z",
    dailyForecast: [
      {
        date: "2026-07-23",
        condition: "rain",
        maxTemperatureC: 20,
        minTemperatureC: 14,
        precipitationProbabilityPercent: 80,
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

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        {
          provide: AccountPreferencesService,
          useValue: { temperatureUnit: signal("celsius") },
        },
      ],
    });
    fixture = TestBed.createComponent(EventWeatherDaysComponent);
    fixture.componentRef.setInput(
      "eventStart",
      new Date("2026-07-23T08:00:00Z"),
    );
    fixture.componentRef.setInput(
      "eventEnd",
      new Date("2026-07-25T18:00:00Z"),
    );
    fixture.componentRef.setInput("timeZone", "UTC");
    fixture.componentRef.setInput("response", response);
  });

  it("shows every event day and emits the selected date", async () => {
    const selected = vi.fn();
    fixture.componentInstance.dateSelected.subscribe(selected);
    await fixture.whenStable();

    const days = fixture.nativeElement.querySelectorAll(
      ".event-day",
    ) as NodeListOf<HTMLButtonElement>;
    expect(days).toHaveLength(3);
    expect(days[0].textContent).toContain("20°");
    expect(days[1].textContent).toContain("Forecast not available yet");

    days[0].click();
    expect(selected).toHaveBeenCalledWith("2026-07-23");
  });
});
