import { ComponentFixture, TestBed } from "@angular/core/testing";
import { beforeEach, describe, expect, it } from "vitest";
import type { PrecipitationPoint } from "../../weather/weather-precipitation";
import { PrecipitationChartComponent } from "./precipitation-chart.component";

describe("PrecipitationChartComponent", () => {
  let fixture: ComponentFixture<PrecipitationChartComponent>;

  function render(points: PrecipitationPoint[]): HTMLElement {
    fixture.componentRef.setInput("points", points);
    fixture.componentRef.setInput("timeZone", "UTC");
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  beforeEach(() => {
    fixture = TestBed.createComponent(PrecipitationChartComponent);
  });

  it("draws amount bars scaled to the wettest hour and summarises the peak", () => {
    const element = render([
      { time: "2026-08-20T14:00:00Z", precipitationMm: 0, precipitationProbabilityPercent: 10 },
      { time: "2026-08-20T15:00:00Z", precipitationMm: 1.2, precipitationProbabilityPercent: 60 },
      { time: "2026-08-20T16:00:00Z", precipitationMm: 2.4, precipitationProbabilityPercent: 90 },
    ]);

    const amounts = [...element.querySelectorAll<SVGRectElement>(".precipitation-chart__amount")];
    expect(amounts).toHaveLength(2);
    expect(Number(amounts[1].getAttribute("height"))).toBe(48);
    expect(Number(amounts[0].getAttribute("height"))).toBeCloseTo(24);
    expect(element.querySelectorAll(".precipitation-chart__chance")).toHaveLength(3);
    expect(element.querySelector("svg")?.getAttribute("aria-label")).toContain("2.4 mm");
    expect(element.querySelector("svg")?.getAttribute("aria-label")).toMatch(/16:00|04:00\sPM/u);
    expect(element.querySelectorAll(".precipitation-chart__axis span")).toHaveLength(3);
  });

  it("keeps drizzle small instead of filling the chart", () => {
    const element = render([
      { time: "2026-08-20T14:00:00Z", precipitationMm: 0.3 },
      { time: "2026-08-20T15:00:00Z", precipitationMm: 0 },
    ]);

    const amount = element.querySelector<SVGRectElement>(".precipitation-chart__amount");
    expect(Number(amount?.getAttribute("height"))).toBeLessThan(10);
  });

  it("reports a dry forecast and tolerates missing amounts", () => {
    const element = render([
      { time: "2026-08-20T14:00:00Z" },
      { time: "2026-08-20T15:00:00Z", precipitationProbabilityPercent: 5 },
      { time: "not a date", precipitationMm: 4 },
    ]);

    expect(element.querySelector("svg")).toBeNull();
    expect(element.querySelector("figcaption")?.textContent).toContain("No precipitation expected");
  });

  it("renders nothing without points", () => {
    const element = render([]);
    expect(element.querySelector("figure")).toBeNull();
  });
});
