import { signal } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import {
  WeatherIconButtonComponent,
  WeatherIconData,
} from "./weather-icon-button.component";
import { WeatherCondition } from "../../weather/weather-display";
import { AccountPreferencesService } from "../../services/account-preferences.service";

const weather = (condition: WeatherCondition): WeatherIconData => ({
  condition,
});

describe("WeatherIconButtonComponent", () => {
  let fixture: ComponentFixture<WeatherIconButtonComponent>;
  const temperatureUnit = signal<"celsius" | "fahrenheit">("celsius");

  beforeEach(() => {
    temperatureUnit.set("celsius");
    TestBed.configureTestingModule({
      providers: [
        {
          provide: AccountPreferencesService,
          useValue: { temperatureUnit },
        },
      ],
    });
    fixture = TestBed.createComponent(WeatherIconButtonComponent);
  });

  it("renders a daytime condition with temperature context", async () => {
    fixture.componentRef.setInput("weather", {
      condition: "clear",
      isDay: true,
      temperatureC: 22.4,
    } satisfies WeatherIconData);
    fixture.componentRef.setInput("label", "Sunny");

    await fixture.whenStable();

    const button = fixture.nativeElement.querySelector(
      "button",
    ) as HTMLButtonElement;
    const icon = fixture.nativeElement.querySelector("mat-icon") as HTMLElement;
    expect(icon.textContent?.trim()).toBe("sunny");
    expect(button.getAttribute("aria-label")).toBe("Sunny, 22 °C");
  });

  it("uses a night icon for clear weather after sunset", async () => {
    fixture.componentRef.setInput("weather", {
      condition: "clear",
      isDay: false,
    } satisfies WeatherIconData);

    await fixture.whenStable();

    expect(
      fixture.nativeElement.querySelector("mat-icon").textContent?.trim(),
    ).toBe("moon_stars");
    expect(
      fixture.nativeElement.querySelector("button").getAttribute("aria-label"),
    ).toBe("Clear");
    expect(fixture.nativeElement.querySelector("button").classList).not.toContain(
      "is-wet",
    );
    expect(fixture.nativeElement.querySelector("button").classList).not.toContain(
      "has-warning",
    );
  });

  it("uses the preferred unit in the accessible label", async () => {
    temperatureUnit.set("fahrenheit");
    fixture.componentRef.setInput("weather", {
      condition: "clear",
      temperatureC: 30,
    } satisfies WeatherIconData);
    await fixture.whenStable();

    expect(
      fixture.nativeElement.querySelector("button").getAttribute("aria-label"),
    ).toBe("Clear, 86 °F");
  });

  it("applies wet and warning status colors", async () => {
    fixture.componentRef.setInput("weather", {
      condition: "rain",
      status: "wet",
    } satisfies WeatherIconData);
    await fixture.whenStable();

    const button = fixture.nativeElement.querySelector(
      "button",
    ) as HTMLButtonElement;
    expect(button.classList).toContain("is-wet");

    fixture.componentRef.setInput("weather", {
      condition: "clear",
      status: "warning",
    } satisfies WeatherIconData);
    await fixture.whenStable();

    expect(button.classList).toContain("has-warning");
    expect(button.classList).not.toContain("is-wet");
  });

  it("allows callers to override the selected Material icon", async () => {
    fixture.componentRef.setInput("weather", weather("thunderstorm"));
    fixture.componentRef.setInput("icon", "umbrella");

    await fixture.whenStable();

    expect(
      fixture.nativeElement.querySelector("mat-icon").textContent?.trim(),
    ).toBe("umbrella");
  });

  it("emits without triggering a clickable parent by default", async () => {
    fixture.componentRef.setInput("weather", weather("rain"));
    const pressed = vi.fn();
    const parentClick = vi.fn();
    fixture.componentInstance.pressed.subscribe(pressed);
    fixture.nativeElement.addEventListener("click", parentClick);

    await fixture.whenStable();
    fixture.nativeElement.querySelector("button").click();

    expect(pressed).toHaveBeenCalledOnce();
    expect(parentClick).not.toHaveBeenCalled();
  });
});
