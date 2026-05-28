import { ComponentFixture, TestBed } from "@angular/core/testing";
import { provideNoopAnimations } from "@angular/platform-browser/animations";
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
      providers: [provideNoopAnimations()],
    }).compileComponents();

    fixture = TestBed.createComponent(FancyCounterComponent);
  });

  it("recreates changed digits so single-digit increments can animate", () => {
    fixture.componentRef.setInput("number", 1);
    fixture.detectChanges();

    const initialDigit = digitElements()[0];

    fixture.componentRef.setInput("number", 2);
    fixture.detectChanges();

    const nextDigit = digitElements()[0];
    expect(nextDigit).not.toBe(initialDigit);
    expect(nextDigit.textContent?.trim()).toBe("2");
  });
});
