import { ComponentFixture, TestBed } from "@angular/core/testing";
import { By } from "@angular/platform-browser";
import { beforeEach, describe, expect, it } from "vitest";
import {
  FilterChipsBarComponent,
  PresetFilterChip,
} from "./filter-chips-bar.component";

const objectTypeFilters: PresetFilterChip[] = [
  { urlParam: "all", label: "All" },
  { urlParam: "spots", label: "Spots" },
  { urlParam: "events", label: "Events" },
  { urlParam: "communities", label: "Communities" },
];

describe("FilterChipsBarComponent", () => {
  let fixture: ComponentFixture<FilterChipsBarComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [FilterChipsBarComponent],
    });

    fixture = TestBed.createComponent(FilterChipsBarComponent);
    fixture.componentRef.setInput("presetFilters", objectTypeFilters);
    fixture.componentRef.setInput("showFiltersChip", false);
    fixture.componentRef.setInput("showClearChip", false);
  });

  it("falls back to the first chip when the active chip is deselected in required mode", () => {
    const emitted: string[] = [];
    fixture.componentInstance.filterChange.subscribe((value) =>
      emitted.push(value),
    );
    fixture.componentRef.setInput("selectedFilter", "spots");
    fixture.componentRef.setInput("allowDeselect", false);
    fixture.detectChanges();

    fixture.componentInstance.onPresetChipClick("spots");

    expect(fixture.componentInstance.renderedSelectedFilter()).toBe("all");
    expect(emitted).toEqual(["all"]);
  });

  it("keeps the fallback selected when it is clicked in required mode", () => {
    const emitted: string[] = [];
    fixture.componentInstance.filterChange.subscribe((value) =>
      emitted.push(value),
    );
    fixture.componentRef.setInput("selectedFilter", "all");
    fixture.componentRef.setInput("allowDeselect", false);
    fixture.detectChanges();

    fixture.componentInstance.onPresetChipClick("all");

    expect(fixture.componentInstance.renderedSelectedFilter()).toBe("all");
    expect(emitted).toEqual([]);
  });

  it("renders the fallback chip as selected when required mode starts empty", () => {
    fixture.componentRef.setInput("selectedFilter", "");
    fixture.componentRef.setInput("allowDeselect", false);
    fixture.detectChanges();

    const selectedChip = fixture.debugElement.query(
      By.css("mat-chip-option.mat-mdc-chip-selected"),
    );

    expect(selectedChip.nativeElement.textContent).toContain("All");
  });
});
