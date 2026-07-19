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
          uvIndex: 6,
          windSpeedKmh: 8,
          isDay: true,
        },
        forecast: [
          {
            time: "2026-07-19T11:00:00Z",
            condition: "rain",
            temperatureC: 22,
            precipitationProbabilityPercent: 60,
            isDay: true,
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
            maxTemperatureC: 25.6,
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
});
