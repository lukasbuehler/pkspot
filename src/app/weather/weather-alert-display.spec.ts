import { describe, expect, it } from "vitest";
import type { WeatherAlert } from "./weather.models";
import { getWeatherAlertDisplay } from "./weather-alert-display";

function alert(
  type: string,
  severity: WeatherAlert["severity"] = "severe",
): Pick<WeatherAlert, "severity" | "title" | "type"> {
  return { type, severity, title: "Official source title" };
}

describe("weather alert display", () => {
  it("uses the requested distinct icons for heat and wildfire alerts", () => {
    expect(getWeatherAlertDisplay(alert("HEAT", "extreme"))).toEqual({
      icon: "thermometer_alert",
      label: "Extreme heat",
    });
    expect(getWeatherAlertDisplay(alert("WILDFIRE"))).toEqual({
      icon: "emergency_heat",
      label: "Wildfire",
    });
    expect(getWeatherAlertDisplay(alert("FIRE_WEATHER"))).toEqual({
      icon: "emergency_heat",
      label: "Fire danger",
    });
  });

  it.each([
    ["SEVERE_THUNDERSTORM_WARNING", "thunderstorm", "Thunderstorm"],
    ["TORNADO_WARNING", "tornado", "Tornado"],
    ["HURRICANE", "cyclone", "Tropical storm"],
    ["FLASH_FLOOD", "flood", "Flooding"],
    ["WINTER_STORM", "snowing_heavy", "Snow and ice"],
    ["FOG", "foggy", "Reduced visibility"],
    ["EARTHQUAKE", "earthquake", "Earthquake"],
    ["LANDSLIDE", "landslide", "Landslide"],
    ["VOLCANIC_ERUPTION", "volcano", "Volcanic hazard"],
    ["TSUNAMI", "tsunami", "Tsunami"],
  ])("maps %s to a useful category", (type, icon, label) => {
    expect(getWeatherAlertDisplay(alert(type))).toEqual({ icon, label });
  });

  it("falls back to the official title for an unknown event type", () => {
    expect(getWeatherAlertDisplay(alert("NEW_PROVIDER_EVENT"))).toEqual({
      icon: "warning",
      label: "Official source title",
    });
  });
});
