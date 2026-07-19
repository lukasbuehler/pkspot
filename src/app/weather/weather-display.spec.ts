import {
  WEATHER_STATES,
  WEATHER_WARNINGS,
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
    }
  });

  it("uses the night icon when one is configured", () => {
    expect(getWeatherStateIcon("clear", false)).toBe("moon_stars");
    expect(getWeatherStateIcon("rain", false)).toBe("rainy");
  });
});
