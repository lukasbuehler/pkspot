import {
  formatTemperature,
  resolveTemperatureUnit,
} from "./weather-temperature";

describe("weather temperature display", () => {
  it("uses Fahrenheit locally in the US and Celsius elsewhere", () => {
    expect(resolveTemperatureUnit("local", "US")).toBe("fahrenheit");
    expect(resolveTemperatureUnit("local", "us")).toBe("fahrenheit");
    expect(resolveTemperatureUnit("local", "CH")).toBe("celsius");
    expect(resolveTemperatureUnit("local")).toBe("celsius");
  });

  it("keeps explicit overrides independent of the weather location", () => {
    expect(resolveTemperatureUnit("celsius", "US")).toBe("celsius");
    expect(resolveTemperatureUnit("fahrenheit", "CH")).toBe(
      "fahrenheit",
    );
  });

  it("converts Celsius values for full and compact displays", () => {
    expect(formatTemperature(30, "celsius")).toBe("30 °C");
    expect(formatTemperature(30, "fahrenheit")).toBe("86 °F");
    expect(formatTemperature(22.4, "fahrenheit", false)).toBe("72°");
  });
});
