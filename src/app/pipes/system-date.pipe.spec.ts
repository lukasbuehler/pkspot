import { LOCALE_ID } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { SystemDatePipe } from "./system-date.pipe";

describe("SystemDatePipe", () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [{ provide: LOCALE_ID, useValue: "en-US" }],
    });
  });

  it("formats values and preserves nulls", () => {
    const pipe = TestBed.runInInjectionContext(() => new SystemDatePipe());

    expect(pipe.transform(null)).toBeNull();
    expect(pipe.transform(new Date("2026-07-21T18:05:00Z"), "longDate"))
      .toContain("2026");
  });
});
