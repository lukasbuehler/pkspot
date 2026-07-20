import { LOCALE_ID, signal } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { By } from "@angular/platform-browser";
import { MapWeatherChipComponent } from "./map-weather-chip.component";
import type { WeatherResponse } from "../../../weather/weather.models";
import { AccountPreferencesService } from "../../../services/account-preferences.service";

describe("MapWeatherChipComponent", () => {
  const temperatureUnit = signal<"celsius" | "fahrenheit">("celsius");
  const response: WeatherResponse = {
    provider: "google",
    mode: "current-and-near-future",
    location: { lat: 47.37, lng: 8.57 },
    generatedAt: "2026-07-19T10:00:00Z",
    expiresAt: "2026-07-19T10:45:00Z",
    timeZone: "Europe/Zurich",
    current: {
      time: "2026-07-19T10:00:00Z",
      condition: "partly-cloudy",
      temperatureC: 22.4,
      isDay: true,
      sunset: "2026-07-19T19:00:00Z",
    },
    forecast: [
      {
        time: "2026-07-19T11:00:00Z",
        condition: "rain",
        precipitationProbabilityPercent: 60,
      },
    ],
    insights: {
      summary: "Rain possible",
      rainStartsAt: "2026-07-19T11:00:00Z",
      precipitationRisk: "medium",
      sunExposure: "moderate",
      surfaceDrying: {
        status: "likely_dry",
        confidence: "low",
        factors: [],
      },
    },
  };

  beforeEach(() => {
    temperatureUnit.set("celsius");
    TestBed.configureTestingModule({
      providers: [
        { provide: LOCALE_ID, useValue: "de" },
        {
          provide: AccountPreferencesService,
          useValue: { temperatureUnit },
        },
      ],
    });
  });

  it("shows current weather and the next local-time change", async () => {
    const fixture = TestBed.createComponent(MapWeatherChipComponent);
    fixture.componentRef.setInput("response", response);
    await fixture.whenStable();

    expect(fixture.nativeElement.textContent).toContain("22°");
    expect(fixture.nativeElement.textContent).toContain("Rain at 13:00");
    expect(
      fixture.debugElement.query(By.css("button")).attributes["aria-label"],
    ).toContain("Weather near map center");
  });

  it("emits when opened", async () => {
    const fixture = TestBed.createComponent(MapWeatherChipComponent);
    const pressed = vi.fn();
    fixture.componentRef.setInput("response", response);
    fixture.componentInstance.pressed.subscribe(pressed);
    await fixture.whenStable();

    fixture.nativeElement.querySelector("button").click();
    expect(pressed).toHaveBeenCalledOnce();
  });

  it("uses the preferred temperature unit", async () => {
    temperatureUnit.set("fahrenheit");
    const fixture = TestBed.createComponent(MapWeatherChipComponent);
    fixture.componentRef.setInput("response", response);
    await fixture.whenStable();

    expect(fixture.nativeElement.textContent).toContain("72°");
    expect(
      fixture.debugElement.query(By.css("button")).attributes["aria-label"],
    ).toContain("72 °F");
  });

  it("supports a full-width area overview appearance", async () => {
    const fixture = TestBed.createComponent(MapWeatherChipComponent);
    fixture.componentRef.setInput("response", response);
    fixture.componentRef.setInput("appearance", "overview");
    await fixture.whenStable();

    expect(fixture.nativeElement.classList).toContain("is-overview");
    expect(
      fixture.nativeElement.querySelector("button").classList,
    ).toContain("is-overview");
  });

  it("targets wet and warning colors at the icon and temperature only", async () => {
    const wetFixture = TestBed.createComponent(MapWeatherChipComponent);
    wetFixture.componentRef.setInput("response", {
      ...response,
      current: {
        ...response.current!,
        condition: "rain",
      },
      insights: {
        ...response.insights,
        surfaceDrying: {
          status: "wet",
          confidence: "medium",
          factors: [],
        },
      },
    });
    await wetFixture.whenStable();

    const wetButton = wetFixture.nativeElement.querySelector("button");
    expect(wetButton.classList).toContain("is-wet");
    expect(wetButton.querySelector(".temperature")).not.toBeNull();
    expect(wetButton.querySelector(".change-summary")).not.toBeNull();

    const warningFixture = TestBed.createComponent(MapWeatherChipComponent);
    warningFixture.componentRef.setInput("response", {
      ...response,
      current: {
        ...response.current!,
        temperatureC: 31,
        uvIndex: 7,
      },
    });
    await warningFixture.whenStable();

    const warningButton =
      warningFixture.nativeElement.querySelector("button");
    expect(warningButton.classList).toContain("has-warning");
    expect(warningButton.classList).not.toContain("is-wet");
  });
});
