import { ComponentFixture, TestBed } from "@angular/core/testing";
import {
  MAT_DIALOG_DATA,
  MatDialogRef,
} from "@angular/material/dialog";
import {
  WeatherForecastDialogComponent,
  WeatherForecastDialogData,
} from "./weather-forecast-dialog.component";

describe("WeatherForecastDialogComponent", () => {
  let fixture: ComponentFixture<WeatherForecastDialogComponent>;
  let dialogData: WeatherForecastDialogData;

  beforeEach(() => {
    dialogData = {
      spotName: "Josefhalle",
      response: {
        provider: "google",
        mode: "current-and-near-future",
        location: { lat: 47.37, lng: 8.54 },
        generatedAt: "2026-07-19T10:00:00Z",
        expiresAt: "2026-07-19T10:45:00Z",
        timeZone: "Europe/Zurich",
        attribution: "Weather: Google Weather",
        current: {
          time: "2026-07-19T10:00:00Z",
          condition: "clear",
          temperatureC: 24,
          apparentTemperatureC: 25,
          relativeHumidityPercent: 48,
          precipitationProbabilityPercent: 60,
          uvIndex: 6,
          cloudCoverPercent: 55,
          windSpeedKmh: 8,
          isDay: true,
          sunset: "2026-07-19T19:00:00Z",
        },
        forecast: [
          {
            time: "2026-07-19T11:00:00Z",
            condition: "rain",
            temperatureC: 22,
            precipitationProbabilityPercent: 60,
            isDay: true,
          },
          {
            time: "2026-07-19T22:00:00Z",
            condition: "clear",
            temperatureC: 18,
            precipitationProbabilityPercent: 0,
            uvIndex: 0,
            isDay: false,
          },
        ],
        dailyForecast: [
          {
            date: "2026-07-19",
            condition: "rain",
            maxTemperatureC: 24.4,
            minTemperatureC: 16.2,
            precipitationProbabilityPercent: 65,
          },
          {
            date: "2026-07-20",
            condition: "partly-cloudy",
            maxTemperatureC: 30,
            minTemperatureC: 15.7,
            precipitationProbabilityPercent: 20,
          },
        ],
        insights: {
          summary: "Rain possible later",
          rainStartsAt: "2026-07-19T11:00:00Z",
          likelyDryUntil: "2026-07-19T11:00:00Z",
          precipitationRisk: "medium",
          sunExposure: "moderate",
          surfaceDrying: {
            status: "likely_dry",
            confidence: "low",
            factors: [],
          },
        },
      },
    };
    TestBed.configureTestingModule({
      providers: [
        {
          provide: MAT_DIALOG_DATA,
          useFactory: () => dialogData,
        },
        { provide: MatDialogRef, useValue: { close: vi.fn() } },
      ],
    });
  });

  it("explains the current and upcoming weather", async () => {
    fixture = TestBed.createComponent(WeatherForecastDialogComponent);
    await fixture.whenStable();

    const text = fixture.nativeElement.textContent;
    expect(text).toContain("Weather at");
    expect(text).toContain("Josefhalle");
    expect(text).toContain("24 °C");
    expect(text).toContain("Conditions should stay dry until around");
    expect(text).toContain("Sunset at");
    expect(text).toContain("Current cloud cover: 55%");
    expect(text).toContain("60%");
    expect(text).toContain("Next 7 days");
    expect(text).toContain("24°");
    expect(text).toContain("16°");
    expect(text).toContain("65%");
    expect(text).toContain("Weather: Google Weather");
    expect(
      fixture.nativeElement.querySelector(".current-icon").classList,
    ).toContain("has-warning");
    expect(
      fixture.nativeElement.querySelector(".weather-warning").classList,
    ).not.toContain("high");
    expect(
      fixture.nativeElement.querySelector(
        ".weather-warning-icon mat-icon",
      ).textContent,
    ).toContain("sunny");
    expect(
      fixture.nativeElement.querySelector(".weather-hour .forecast-icon")
        .classList,
    ).toContain("is-wet");
    expect(
      fixture.nativeElement.querySelectorAll(".weather-hour .forecast-icon")[1]
        .classList,
    ).toContain("is-night");
    expect(
      fixture.nativeElement.querySelectorAll(".weather-day .forecast-icon")[0]
        .classList,
    ).toContain("is-wet");
    expect(
      fixture.nativeElement.querySelectorAll(".weather-day .forecast-icon")[1]
        .classList,
    ).toContain("has-warning");
  });

  it("does not claim surfaces will dry after the next rain starts", async () => {
    dialogData.response.insights.surfaceDrying = {
      status: "drying",
      estimatedDryAt: "2026-07-19T12:00:00Z",
      confidence: "low",
      factors: [],
    };
    fixture = TestBed.createComponent(WeatherForecastDialogComponent);
    await fixture.whenStable();

    expect(fixture.nativeElement.textContent).not.toContain(
      "Exposed surfaces may dry around",
    );
  });

  it("groups heat and UV warnings into one warning card", async () => {
    dialogData.response.current = {
      ...dialogData.response.current!,
      temperatureC: 31,
      apparentTemperatureC: 32,
      uvIndex: 7,
      isDay: true,
    };
    fixture = TestBed.createComponent(WeatherForecastDialogComponent);
    await fixture.whenStable();

    const warningCards =
      fixture.nativeElement.querySelectorAll(".weather-warning");
    const warningItems =
      warningCards[0].querySelectorAll(".weather-warning-item");

    expect(warningCards).toHaveLength(1);
    expect(warningItems).toHaveLength(2);
    expect(warningCards[0].textContent).toContain("High UV");
    expect(warningCards[0].textContent).toContain("Hot conditions");
  });

  it("keeps raw weather details visible for covered spots", async () => {
    dialogData.covered = true;
    fixture = TestBed.createComponent(WeatherForecastDialogComponent);
    await fixture.whenStable();

    const text = fixture.nativeElement.textContent;
    expect(text).toContain("Covered spot");
    expect(text).toContain("surrounding outdoor conditions");
    expect(text).toContain("UV index");
    expect(text).toContain("60%");
    expect(text).toContain("65%");
    expect(text).toContain("Conditions should stay dry until around");
    expect(fixture.nativeElement.querySelector(".weather-warning")).toBeNull();
  });

  it("uses a region title for map weather", async () => {
    dialogData.context = "map-region";
    dialogData.spotName = "";
    fixture = TestBed.createComponent(WeatherForecastDialogComponent);
    await fixture.whenStable();

    expect(fixture.nativeElement.textContent).toContain("Weather in the area");
    expect(fixture.nativeElement.textContent).not.toContain(
      "Weather at Josefhalle",
    );
  });
});
