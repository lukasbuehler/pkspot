import { LOCALE_ID } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { describe, expect, it } from "vitest";
import { LocalizedPlacePipe } from "./localized-place.pipe";

describe("LocalizedPlacePipe", () => {
  it("uses the app language, then the language without region, then the original", () => {
    TestBed.configureTestingModule({ providers: [LocalizedPlacePipe, { provide: LOCALE_ID, useValue: "de-CH" }] });
    const pipe = TestBed.inject(LocalizedPlacePipe);
    expect(pipe.transform("Liège", { de: "Lüttich", fr: "Liège" })).toBe("Lüttich");
    expect(pipe.transform("Liège", { it: "Liegi" })).toBe("Liège");
    expect(pipe.transform(undefined, null)).toBe("");
  });
});
