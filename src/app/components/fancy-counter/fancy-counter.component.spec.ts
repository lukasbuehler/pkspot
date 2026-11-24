import { ComponentFixture, TestBed } from "@angular/core/testing";
import { beforeEach, describe, expect, it } from "vitest";

import { FancyCounterComponent } from "./fancy-counter.component";

describe("FancyCounterComponent", () => {
  let fixture: ComponentFixture<FancyCounterComponent>;

  const digitElements = () =>
    Array.from(
      fixture.nativeElement.querySelectorAll(".digit-container"),
    ) as HTMLElement[];

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FancyCounterComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(FancyCounterComponent);
  });

  it("recreates changed digits so single-digit increments can animate", async () => {
    fixture.componentRef.setInput("number", 1);
    await fixture.whenStable();

    const initialDigit = digitElements()[0];

    fixture.componentRef.setInput("number", 2);
    await fixture.whenStable();

    const nextDigit = digitElements()[0];
    expect(nextDigit).not.toBe(initialDigit);
    expect(nextDigit.textContent?.trim()).toBe("2");
  });

  it("removes old digits at once so they cannot pile up", async () => {
    for (const value of [1419, 1414, 1168]) {
      fixture.componentRef.setInput("number", value);
      await fixture.whenStable();
    }

    expect(digitElements().map((digit) => digit.textContent).join("")).toBe(
      "1168",
    );
  });

  it("slides new digits in from above when the number grows", async () => {
    fixture.componentRef.setInput("number", 3);
    await fixture.whenStable();
    const host = fixture.nativeElement as HTMLElement;
    expect(host.style.getPropertyValue("--digit-enter-offset")).toBe("-1rem");

    fixture.componentRef.setInput("number", 2);
    await fixture.whenStable();
    expect(host.style.getPropertyValue("--digit-enter-offset")).toBe("1rem");
  });

  it("reads the number as one value instead of separate digits", async () => {
    fixture.componentRef.setInput("number", 4);
    fixture.componentRef.setInput("decimals", 1);
    await fixture.whenStable();

    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector(".visually-hidden")?.textContent).toBe("4.0");
    expect(element.querySelector(".counter")?.getAttribute("aria-hidden")).toBe(
      "true",
    );
  });
});
