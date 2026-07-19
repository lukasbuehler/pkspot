import {
  formatTemperature,
  getDefaultTemperatureUnit,
  getExplicitTemperatureUnit,
} from "./weather-temperature";

describe("weather temperature display", () => {
  it("defaults US locales to Fahrenheit and other locales to Celsius", () => {
    expect(getDefaultTemperatureUnit("en-US")).toBe("fahrenheit");
    expect(getDefaultTemperatureUnit("de-CH")).toBe("celsius");
    expect(getDefaultTemperatureUnit("en-GB")).toBe("celsius");
  });

  it("reads explicit temperature and measurement-system locale overrides", () => {
    expect(getExplicitTemperatureUnit("en-US-u-mu-celsius")).toBe("celsius");
    expect(getExplicitTemperatureUnit("de-CH-u-mu-fahrenhe")).toBe(
      "fahrenheit",
    );
    expect(getExplicitTemperatureUnit("en-GB-u-ms-ussystem")).toBe(
      "fahrenheit",
    );
    expect(
      getExplicitTemperatureUnit("en-US-u-ms-ussystem-mu-celsius"),
    ).toBe("celsius");
    expect(getExplicitTemperatureUnit("en-US")).toBeUndefined();
  });

  it("converts Celsius values for full and compact displays", () => {
    expect(formatTemperature(30, "celsius")).toBe("30 °C");
    expect(formatTemperature(30, "fahrenheit")).toBe("86 °F");
    expect(formatTemperature(22.4, "fahrenheit", false)).toBe("72°");
  });
});
