import { ComponentFixture, TestBed } from "@angular/core/testing";
import { By } from "@angular/platform-browser";
import { provideNoopAnimations } from "@angular/platform-browser/animations";
import { provideRouter } from "@angular/router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SpotPreviewData } from "../../../db/schemas/SpotPreviewData";
import { SpotId } from "../../../db/schemas/SpotSchema";
import { MapsApiService } from "../../services/maps-api.service";
import { StorageService } from "../../services/firebase/storage.service";
import { SpotPreviewCardComponent } from "./spot-preview-card.component";

type LegacyIconicSpotPreviewData = Omit<SpotPreviewData, "isIconic"> & {
  is_iconic: boolean;
};

const mapsApiService = {
  isStreetViewPreviewEnabled: vi.fn(() => false),
  isStreetViewPreviewAllowedAtZoom: vi.fn(() => false),
  getCachedStreetViewPanoramaAvailability: vi.fn(() => null),
  getStaticStreetViewImageForLocation: vi.fn(() => ""),
  hasStreetViewPanoramaForLocation: vi.fn().mockResolvedValue(false),
};

describe("SpotPreviewCardComponent", () => {
  let fixture: ComponentFixture<SpotPreviewCardComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SpotPreviewCardComponent],
      providers: [
        provideRouter([]),
        provideNoopAnimations(),
        { provide: MapsApiService, useValue: mapsApiService },
        { provide: StorageService, useValue: {} },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(SpotPreviewCardComponent);
  });

  it("shows the iconic icon for legacy is_iconic preview data", () => {
    const spot = {
      id: "main" as SpotId,
      name: "Main Spot",
      locality: "Zurich, CH",
      imageSrc: "",
      is_iconic: true,
    } satisfies LegacyIconicSpotPreviewData;

    fixture.componentRef.setInput("spotData", spot);
    fixture.detectChanges();

    const icons = fixture.debugElement.queryAll(By.css("mat-icon"));

    expect(
      icons.some((icon) => icon.nativeElement.textContent.trim() === "stars"),
    ).toBe(true);
  });
});
