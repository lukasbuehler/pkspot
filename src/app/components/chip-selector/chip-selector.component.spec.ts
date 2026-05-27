import { ComponentFixture, TestBed } from "@angular/core/testing";
import { beforeEach, describe, expect, it } from "vitest";
import { ChipSelectorComponent } from "./chip-selector.component";

describe("ChipSelectorComponent", () => {
  let fixture: ComponentFixture<ChipSelectorComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [ChipSelectorComponent],
    });

    fixture = TestBed.createComponent(ChipSelectorComponent);
  });

  it("keeps the fallback selected when a required selection emits null", () => {
    const emitted: Array<string | null> = [];
    fixture.componentInstance.selectedValueChange.subscribe((value) =>
      emitted.push(value),
    );
    fixture.componentRef.setInput("options", [
      { value: "all", label: "All" },
      { value: "spots", label: "Spots" },
    ]);
    fixture.componentRef.setInput("selectedValue", "all");
    fixture.componentRef.setInput("requireSelection", true);
    fixture.componentRef.setInput("fallbackValue", "all");
    fixture.detectChanges();

    fixture.componentInstance.onListboxChange(null);

    expect(fixture.componentInstance.renderedSelectedValue()).toBe("all");
    expect(emitted).toEqual(["all"]);
    expect(fixture.componentInstance.isRequiredSelectedValue("all")).toBe(true);
  });
});
