import { ComponentFixture, TestBed } from "@angular/core/testing";
import { provideNoopAnimations } from "@angular/platform-browser/animations";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CommunityMergeLocalityOptionSchema } from "../../../db/schemas/CommunityMergeAdminSchema";
import { CommunityLocalityPickerComponent } from "./community-locality-picker.component";

const options: CommunityMergeLocalityOptionSchema[] = [
  {
    communityKey: "locality:dk:84:frederiksberg",
    displayName: "Frederiksberg",
    geography: { countryCode: "DK", regionName: "Capital Region" },
    spotCount: 3,
    distanceKm: 4.2,
  },
  {
    communityKey: "locality:dk:84:helsingor",
    displayName: "Helsingør",
    geography: { countryCode: "DK", regionName: "Capital Region" },
    spotCount: 2,
    distanceKm: 45,
  },
];

describe("CommunityLocalityPickerComponent", () => {
  let fixture: ComponentFixture<CommunityLocalityPickerComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CommunityLocalityPickerComponent],
      providers: [provideNoopAnimations()],
    }).compileComponents();
    fixture = TestBed.createComponent(CommunityLocalityPickerComponent);
    fixture.componentRef.setInput("options", options);
    fixture.detectChanges();
  });

  it("filters unpublished locality options by name and region", () => {
    fixture.componentInstance.query.set("freder");
    expect(fixture.componentInstance.filteredOptions()).toEqual([options[0]]);
    fixture.componentInstance.query.set("capital");
    expect(fixture.componentInstance.filteredOptions()).toEqual(options);
  });

  it("emits an empty value when the selected locality is cleared", () => {
    const valueChange = vi.fn();
    fixture.componentRef.setInput("value", options[0].communityKey);
    fixture.componentInstance.valueChange.subscribe(valueChange);
    fixture.detectChanges();

    fixture.componentInstance.clear();

    expect(valueChange).toHaveBeenCalledWith("");
  });
});
