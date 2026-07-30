import { LOCALE_ID } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { provideNoopAnimations } from "@angular/platform-browser/animations";
import { vi } from "vitest";
import { DateTimeFormatService } from "../../services/date-time-format.service";
import type { EventDiscoverySearchResult } from "../../services/search.service";
import {
  ContinuousEventCalendarComponent,
  type ContinuousEventCalendarLoader,
} from "./continuous-event-calendar.component";

const EMPTY_RESULT: EventDiscoverySearchResult = {
  items: [],
  found: 0,
  page: 1,
  facets: { categories: [], series: [], communities: [] },
  invalidItems: [],
  invalidItemCount: 0,
};

describe("ContinuousEventCalendarComponent", () => {
  let fixture: ComponentFixture<ContinuousEventCalendarComponent>;
  let loader: ReturnType<typeof vi.fn<ContinuousEventCalendarLoader>>;

  beforeEach(() => {
    loader = vi.fn<ContinuousEventCalendarLoader>().mockResolvedValue(
      EMPTY_RESULT,
    );
    TestBed.configureTestingModule({
      providers: [
        provideNoopAnimations(),
        { provide: LOCALE_ID, useValue: "en-CH" },
        {
          provide: DateTimeFormatService,
          useValue: {
            format: (
              value: Date | number | string,
              options: Intl.DateTimeFormatOptions,
            ) => new Intl.DateTimeFormat("en-CH", options).format(new Date(value)),
          },
        },
      ],
    });
    fixture = TestBed.createComponent(ContinuousEventCalendarComponent);
    fixture.componentRef.setInput("anchorMonth", "2026-08");
    fixture.componentRef.setInput("selectedDay", "2026-08-14");
    fixture.componentRef.setInput("loadEvents", loader);
  });

  it("renders fixed weekdays and month markers in one scrolling grid", async () => {
    await fixture.whenStable();

    const weekdayRow = fixture.nativeElement.querySelector(".weekday-row");
    const scrollViewport =
      fixture.nativeElement.querySelector(".calendar-scroll");
    const augustMarker = [...fixture.nativeElement.querySelectorAll(
      ".month-marker",
    )].find((element: Element) => element.textContent?.includes("August"));

    expect(weekdayRow.parentElement).not.toBe(scrollViewport);
    expect(augustMarker).toBeTruthy();
    expect(fixture.nativeElement.querySelectorAll(".calendar-week").length)
      .toBeGreaterThan(20);
    expect(loader).toHaveBeenCalledWith(
      expect.objectContaining({
        startsBeforeSeconds: expect.any(Number),
        endsAfterSeconds: expect.any(Number),
        abortSignal: expect.any(AbortSignal),
      }),
    );
  });

  it("extends the loaded month window near the bottom edge", async () => {
    await fixture.whenStable();
    const viewport = fixture.nativeElement.querySelector(
      ".calendar-scroll",
    ) as HTMLDivElement;
    const initialMonths = fixture.componentInstance.monthKeys().length;
    Object.defineProperties(viewport, {
      clientHeight: { configurable: true, value: 500 },
      scrollHeight: { configurable: true, value: 2_000 },
    });
    viewport.scrollTop = 1_300;

    viewport.dispatchEvent(new Event("scroll"));
    await fixture.whenStable();

    expect(fixture.componentInstance.monthKeys()).toHaveLength(
      initialMonths + 2,
    );
  });

  it("jumps to a date and emits a shareable URL anchor", async () => {
    await fixture.whenStable();
    const jumps: string[] = [];
    fixture.componentInstance.dateJumped.subscribe((day) => jumps.push(day));
    const dateInput = fixture.nativeElement.querySelector(
      'input[type="date"]',
    ) as HTMLInputElement;

    dateInput.value = "2027-02-10";
    dateInput.dispatchEvent(new Event("change"));
    await fixture.whenStable();

    expect(fixture.componentInstance.monthKeys()).toContain("2027-02");
    expect(jumps).toEqual(["2027-02-10"]);
  });
});
