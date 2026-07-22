import { signal } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { AccountPreferencesService } from "../../services/account-preferences.service";
import type { WeatherResponse } from "../../weather/weather.models";
import { EventProgramTimelineComponent } from "./event-program-timeline.component";

describe("EventProgramTimelineComponent", () => {
  let fixture: ComponentFixture<EventProgramTimelineComponent>;
  const response: WeatherResponse = {
    provider: "google",
    mode: "event-forecast",
    location: { lat: 47.37, lng: 8.54 },
    generatedAt: "2026-07-22T06:00:00Z",
    expiresAt: "2026-07-22T06:45:00Z",
    forecast: [
      {
        time: "2026-07-23T08:00:00Z",
        condition: "rain",
        temperatureC: 18,
        precipitationProbabilityPercent: 80,
        isDay: true,
      },
    ],
    dailyForecast: [
      {
        date: "2026-07-23",
        condition: "rain",
        maxTemperatureC: 20,
        minTemperatureC: 14,
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
    fixture = TestBed.createComponent(EventProgramTimelineComponent);
    fixture.componentRef.setInput("items", [
      {
        id: "training",
        title: "Training",
        category: "workshop",
        start: new Date("2026-07-23T08:30:00Z"),
        end: new Date("2026-07-23T10:00:00Z"),
      },
      {
        id: "later",
        title: "Later",
        category: "social",
        start: new Date("2026-07-24T08:30:00Z"),
      },
    ]);
    fixture.componentRef.setInput("timeZone", "UTC");
    fixture.componentRef.setInput("eventStart", new Date("2026-07-23T08:00:00Z"));
    fixture.componentRef.setInput("eventEnd", new Date("2026-07-24T18:00:00Z"));
    fixture.componentRef.setInput("weather", response);
  });

  it("shows tab, day, and itinerary weather only where forecasts exist", async () => {
    await fixture.whenStable();

    expect(fixture.nativeElement.querySelectorAll(".day-tab-weather")).toHaveLength(1);
    expect(
      fixture.nativeElement.querySelectorAll("app-weather-icon-button"),
    ).toHaveLength(2);
    expect(fixture.nativeElement.textContent).toContain("20° / 14°");
    expect(fixture.nativeElement.textContent).toContain("18°");
  });

  it("renders the schedule before optional weather bounds are available", async () => {
    fixture.componentRef.setInput("eventStart", undefined);
    fixture.componentRef.setInput("eventEnd", undefined);
    fixture.componentRef.setInput("weather", undefined);

    await fixture.whenStable();

    expect(fixture.nativeElement.querySelectorAll("[role='tab']")).toHaveLength(2);
    expect(fixture.nativeElement.textContent).toContain("Training");
  });

  it("emits the day and exact itinerary start selections", async () => {
    const selected = vi.fn();
    fixture.componentInstance.weatherSelected.subscribe(selected);
    await fixture.whenStable();

    const controls = fixture.nativeElement.querySelectorAll(
      "app-weather-icon-button button",
    ) as NodeListOf<HTMLButtonElement>;
    controls[0].click();
    controls[1].click();

    expect(selected).toHaveBeenNthCalledWith(1, { date: "2026-07-23" });
    expect(selected).toHaveBeenNthCalledWith(2, {
      date: "2026-07-23",
      time: new Date("2026-07-23T08:30:00Z"),
    });
  });
});
