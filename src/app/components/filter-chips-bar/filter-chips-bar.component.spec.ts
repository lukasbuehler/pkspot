import { ComponentFixture, TestBed } from "@angular/core/testing";
import { By } from "@angular/platform-browser";
import { provideNoopAnimations } from "@angular/platform-browser/animations";
import { beforeEach, describe, expect, it, vi } from "vitest";
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
      // The count uses the animated counter.
      providers: [provideNoopAnimations()],
    });

    fixture = TestBed.createComponent(FilterChipsBarComponent);
    fixture.componentRef.setInput("presetFilters", objectTypeFilters);
    fixture.componentRef.setInput("showFiltersChip", false);
    fixture.componentRef.setInput("showClearChip", false);
  });

  it("preserves multiple selections and emits the clicked value for toggling", () => {
    fixture.componentRef.setInput("selectedFilters", ["spots", "events"]);
    fixture.detectChanges();
    const toggled = vi.fn();
    const single = vi.fn();
    fixture.componentInstance.filterToggled.subscribe(toggled);
    fixture.componentInstance.filterChange.subscribe(single);
    expect(fixture.nativeElement.querySelectorAll(".mdc-evolution-chip--selected").length).toBe(2);
    fixture.componentInstance.onPresetChipClick("spots");
    expect(toggled).toHaveBeenCalledWith("spots");
    expect(single).not.toHaveBeenCalled();
    expect(fixture.componentInstance.selectedFilters()).toEqual(["spots", "events"]);
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

  it("keeps the Filters chip unselected after a click until a filter is applied", () => {
    fixture.componentRef.setInput("showFiltersChip", true);
    const filtersClick = vi.fn();
    fixture.componentInstance.filtersClick.subscribe(filtersClick);
    fixture.detectChanges();

    const filtersChip = fixture.debugElement.query(By.css(".filters-chip"));
    filtersChip.query(By.css(".mdc-evolution-chip__action")).nativeElement.click();
    fixture.detectChanges();

    expect(filtersClick).toHaveBeenCalledTimes(1);
    expect(filtersChip.nativeElement.classList).not.toContain(
      "mat-mdc-chip-selected",
    );
  });

  it("captures the pointer only after a horizontal drag starts", () => {
    fixture.detectChanges();
    const scrollArea = fixture.debugElement.query(
      By.css(".chips-scroll-area"),
    ).nativeElement as HTMLDivElement;
    const setPointerCapture = vi.fn();
    const releasePointerCapture = vi.fn();
    Object.defineProperties(scrollArea, {
      setPointerCapture: { value: setPointerCapture },
      releasePointerCapture: { value: releasePointerCapture },
      hasPointerCapture: { value: vi.fn(() => false) },
    });

    fixture.componentInstance.onScrollPointerDown({
      button: 0,
      clientX: 10,
      clientY: 10,
      pointerId: 1,
      pointerType: "mouse",
    } as PointerEvent);
    fixture.componentInstance.onScrollPointerEnd({
      pointerId: 1,
    } as PointerEvent);

    expect(setPointerCapture).not.toHaveBeenCalled();
    expect(releasePointerCapture).not.toHaveBeenCalled();

    fixture.componentInstance.onScrollPointerDown({
      button: 0,
      clientX: 10,
      clientY: 10,
      pointerId: 2,
      pointerType: "mouse",
    } as PointerEvent);
    fixture.componentInstance.onScrollPointerMove({
      clientX: 30,
      clientY: 11,
      pointerId: 2,
      preventDefault: vi.fn(),
    } as unknown as PointerEvent);

    expect(setPointerCapture).toHaveBeenCalledWith(2);
  });

  it("returns to no selection when the active type chip is clicked again", () => {
    const emitted: string[] = [];
    fixture.componentInstance.filterChange.subscribe((value) =>
      emitted.push(value),
    );
    fixture.componentRef.setInput("selectedFilter", "events");
    fixture.componentRef.setInput("showDeselectIcon", true);
    fixture.detectChanges();

    const selected = fixture.debugElement.query(
      By.css("mat-chip-option.mat-mdc-chip-selected"),
    );
    expect(selected.nativeElement.textContent).toContain("close");
    expect(selected.nativeElement.textContent).toContain("Events");

    fixture.componentInstance.onPresetChipClick("events");
    fixture.detectChanges();

    expect(emitted).toEqual([""]);
    expect(
      fixture.debugElement.query(By.css("mat-chip-option.mat-mdc-chip-selected")),
    ).toBeNull();
  });

  it("shows chip counts with the shared counter", () => {
    fixture.componentRef.setInput("presetFilters", [
      { urlParam: "spots", label: "Spots", count: 48 },
      { urlParam: "events", label: "Events" },
    ]);
    fixture.detectChanges();

    const chips = fixture.debugElement.queryAll(By.css("mat-chip-option"));
    expect(chips[0].query(By.css("app-fancy-counter"))).not.toBeNull();
    expect(chips[0].nativeElement.textContent).toContain("48");
    expect(chips[1].query(By.css("app-fancy-counter"))).toBeNull();
  });

  it("exposes the Filters action as a button that works from the keyboard", () => {
    fixture.componentRef.setInput("showFiltersChip", true);
    const filtersClick = vi.fn();
    fixture.componentInstance.filtersClick.subscribe(filtersClick);
    fixture.detectChanges();

    const filtersChip: HTMLElement = fixture.debugElement.query(
      By.css(".filters-chip"),
    ).nativeElement;
    expect(filtersChip.getAttribute("role")).toBe("button");
    expect(filtersChip.closest("[role=listbox]")).toBeNull();

    filtersChip.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    expect(filtersClick).toHaveBeenCalledTimes(1);
  });
});
