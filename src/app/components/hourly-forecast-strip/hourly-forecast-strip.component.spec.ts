import { ComponentFixture, TestBed } from "@angular/core/testing";
import { beforeEach, describe, expect, it } from "vitest";
import {
  HourlyForecastStripComponent,
  type HourlyForecastColumn,
} from "./hourly-forecast-strip.component";

describe("HourlyForecastStripComponent", () => {
  let fixture: ComponentFixture<HourlyForecastStripComponent>;

  const hour = (overrides: Partial<HourlyForecastColumn> & { key: string }): HourlyForecastColumn => ({
    time: overrides.key,
    icon: "cloud",
    condition: "Cloudy",
    iconTone: "neutral",
    temperature: "14°",
    ...overrides,
  });

  function render(hours: HourlyForecastColumn[]): HTMLElement {
    fixture.componentRef.setInput("hours", hours);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  beforeEach(() => {
    fixture = TestBed.createComponent(HourlyForecastStripComponent);
  });

  it("puts a precipitation bar under each hour on a shared scale", () => {
    const element = render([
      hour({ key: "14:00", precipitationMm: 0, precipitationProbabilityPercent: 10 }),
      hour({ key: "15:00", precipitationMm: 1.2, precipitationProbabilityPercent: 60 }),
      hour({ key: "16:00", precipitationMm: 2.4, precipitationProbabilityPercent: 90, highlighted: true }),
    ]);

    const columns = [...element.querySelectorAll<HTMLElement>(".weather-hour")];
    expect(columns).toHaveLength(3);
    expect(columns.map((column) => column.querySelector("strong")?.textContent)).toEqual(["14°", "14°", "14°"]);
    const amounts = columns.map(
      (column) => column.querySelector<HTMLElement>(".precipitation-bar__amount")?.style.height ?? null,
    );
    expect(amounts).toEqual([null, "50%", "100%"]);
    expect(columns[2].classList).toContain("highlighted");
    expect(columns[2].getAttribute("data-highlighted")).toBe("true");
    expect(columns[1].querySelector(".rain-amount")?.textContent?.trim()).toBe("1.2 mm");
    expect(element.querySelector(".hourly-summary")?.textContent).toContain("Up to 2.4 mm per hour, heaviest around 16:00");
  });

  it("drops the bars and says so when no hour is meaningfully wet", () => {
    const element = render([
      hour({ key: "14:00", precipitationProbabilityPercent: 5 }),
      hour({ key: "15:00", precipitationProbabilityPercent: 10 }),
    ]);

    expect(element.querySelectorAll(".precipitation-bar")).toHaveLength(0);
    expect(element.querySelectorAll(".rain-detail")).toHaveLength(2);
    expect(element.querySelector(".hourly-summary")?.textContent).toContain("No precipitation expected");
    expect(element.querySelector(".hourly-summary__legend")).toBeNull();
    // No hour has an amount, so the mm row is left out instead of padding the cards.
    expect(element.querySelectorAll(".rain-amount")).toHaveLength(0);
  });
});
