import {
  WEATHER_STATES,
  WEATHER_WARNINGS,
  getDailyWeatherForecastIconTone,
  getWeatherForecastIconTone,
  getWeatherStateIcon,
} from "./weather-display";

describe("weather display definitions", () => {
  it("defines labels and icons for every weather state", () => {
    for (const state of Object.values(WEATHER_STATES)) {
      expect(state.dayIcon).toBeTruthy();
      expect(state.label).toBeTruthy();
      expect(state.tone).toBeTruthy();
    }
  });

  it("defines user-facing content for every warning", () => {
    for (const warning of Object.values(WEATHER_WARNINGS)) {
      expect(warning.icon).toBeTruthy();
      expect(warning.label).toBeTruthy();
      expect(warning.message).toBeTruthy();
      expect(warning.severity).toBeTruthy();
      expect(warning.tone).toBeTruthy();
    }
    expect(WEATHER_WARNINGS["wet-surface"].tone).toBe("primary");
    expect(WEATHER_WARNINGS["high-uv"].tone).toBe("error");
    expect(WEATHER_WARNINGS["high-uv"].icon).toBe("brightness_alert");
  });

  it("uses the night icon when one is configured", () => {
    expect(getWeatherStateIcon("clear", false)).toBe("moon_stars");
    expect(getWeatherStateIcon("rain", false)).toBe("rainy");
  });

  it("colors wet forecasts before other forecast states", () => {
    expect(
      getWeatherForecastIconTone({
        condition: "clear",
        temperatureC: 32,
        precipitationProbabilityPercent: 40,
        isDay: false,
      }),
    ).toBe("wet");
    expect(
      getWeatherForecastIconTone({
        condition: "rain",
        precipitationProbabilityPercent: 10,
      }),
    ).toBe("wet");
  });

  it("colors hot and high-UV forecasts as warnings", () => {
    expect(
      getWeatherForecastIconTone({
        condition: "clear",
        temperatureC: 30,
      }),
    ).toBe("warning");
    expect(
      getWeatherForecastIconTone({
        condition: "partly-cloudy",
        uvIndex: 6,
      }),
    ).toBe("warning");
  });

  it("uses a muted tone for nighttime forecasts", () => {
    expect(
      getWeatherForecastIconTone({
        condition: "clear",
        temperatureC: 18,
        uvIndex: 0,
        isDay: false,
      }),
    ).toBe("night");
  });

  it("colors daily icons from the daily condition without UV or rain chance", () => {
    expect(
      getDailyWeatherForecastIconTone({
        condition: "partly-cloudy",
        temperatureC: 22,
      }),
    ).toBe("neutral");
    expect(
      getDailyWeatherForecastIconTone({
        condition: "rain",
        temperatureC: 22,
      }),
    ).toBe("wet");
    expect(
      getDailyWeatherForecastIconTone({
        condition: "clear",
        temperatureC: 30,
      }),
    ).toBe("warning");
  });
});
