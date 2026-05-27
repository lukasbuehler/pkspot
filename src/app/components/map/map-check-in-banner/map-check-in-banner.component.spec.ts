import { ComponentFixture, TestBed } from "@angular/core/testing";
import { By } from "@angular/platform-browser";
import { beforeEach, describe, expect, it } from "vitest";
import { SpotPreviewData } from "../../../../db/schemas/SpotPreviewData";
import { SpotId } from "../../../../db/schemas/SpotSchema";
import { MapCheckInBannerComponent } from "./map-check-in-banner.component";

const spot: SpotPreviewData = {
  id: "spot-1" as SpotId,
  name: "Josefhalle",
  locality: "Zurich, CH",
  imageSrc: "",
  isIconic: false,
};

describe("MapCheckInBannerComponent", () => {
  let fixture: ComponentFixture<MapCheckInBannerComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [MapCheckInBannerComponent],
    });

    fixture = TestBed.createComponent(MapCheckInBannerComponent);
  });

  it("stays hidden without a nearby spot", () => {
    fixture.detectChanges();

    expect(fixture.debugElement.query(By.css(".check-in-banner"))).toBeNull();
  });

  it("emits the selected spot and spot id actions", () => {
    const selected: SpotPreviewData[] = [];
    const checkedIn: SpotId[] = [];
    const dismissed: SpotId[] = [];

    fixture.componentInstance.spotSelect.subscribe((value) =>
      selected.push(value),
    );
    fixture.componentInstance.checkIn.subscribe((value) =>
      checkedIn.push(value),
    );
    fixture.componentInstance.dismiss.subscribe((value) =>
      dismissed.push(value),
    );
    fixture.componentRef.setInput("spot", spot);

    fixture.detectChanges();
    fixture.debugElement
      .query(By.css(".check-in-banner__spot"))
      .nativeElement.click();
    fixture.debugElement
      .query(By.css("button[mat-flat-button]"))
      .nativeElement.click();
    fixture.debugElement
      .query(By.css("button[mat-icon-button]"))
      .nativeElement.click();

    expect(selected).toEqual([spot]);
    expect(checkedIn).toEqual([spot.id]);
    expect(dismissed).toEqual([spot.id]);
  });
});
