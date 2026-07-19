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

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        {
          provide: MAT_DIALOG_DATA,
          useValue: {
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
          } satisfies WeatherForecastDialogData,
        },
        { provide: MatDialogRef, useValue: { close: vi.fn() } },
      ],
    });
    fixture = TestBed.createComponent(WeatherForecastDialogComponent);
  });

  it("explains the current and upcoming weather", async () => {
    await fixture.whenStable();

    const text = fixture.nativeElement.textContent;
    expect(text).toContain("Weather at");
    expect(text).toContain("Josefhalle");
    expect(text).toContain("24 °C");
    expect(text).toContain("Conditions should stay dry until around");
    expect(text).toContain("60%");
    expect(text).toContain("Weather: Google Weather");
  });
});
