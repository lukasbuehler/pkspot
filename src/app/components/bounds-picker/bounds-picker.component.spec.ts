import { ComponentFixture, TestBed } from "@angular/core/testing";
import { describe, expect, it, vi } from "vitest";
import { MapsApiService } from "../../services/maps-api.service";
import { BoundsPickerComponent } from "./bounds-picker.component";

describe("BoundsPickerComponent", () => {
  async function setup(): Promise<ComponentFixture<BoundsPickerComponent>> {
    await TestBed.configureTestingModule({
      imports: [BoundsPickerComponent],
      providers: [
        {
          provide: MapsApiService,
          useValue: {
            isApiLoaded: vi.fn(() => false),
            loadGoogleMapsApi: vi.fn(),
          },
        },
      ],
    })
      .overrideComponent(BoundsPickerComponent, { set: { template: "" } })
      .compileComponents();

    return TestBed.createComponent(BoundsPickerComponent);
  }

  it("places a temporary Spot area without replacing the main event area", async () => {
    const fixture = await setup();
    const component = fixture.componentInstance;
    const inlineAreaChange = vi.fn();
    const areaChange = vi.fn();
    component.inlineSpotAreaChange.subscribe(inlineAreaChange);
    component.areaChange.subscribe(areaChange);
    fixture.componentRef.setInput("inlineSpotAreaPlacementId", "stage");

    component.onMapClick({
      latLng: {
        lat: () => 47.38,
        lng: () => 8.54,
      },
    } as never);

    expect(inlineAreaChange).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "stage",
        areaPath: expect.arrayContaining([
          expect.objectContaining({ lat: expect.any(Number), lng: expect.any(Number) }),
        ]),
      }),
    );
    expect(areaChange).not.toHaveBeenCalled();
  });

  it("emits a custom marker move from the map drag", async () => {
    const fixture = await setup();
    const component = fixture.componentInstance;
    const moved = vi.fn();
    component.customMarkerLocationChange.subscribe(moved);

    component.onCustomMarkerDragEnd(
      "info-desk",
      {
        latLng: {
          lat: () => 47.39,
          lng: () => 8.55,
        },
      } as never,
    );

    expect(moved).toHaveBeenCalledWith({
      id: "info-desk",
      location: { lat: 47.39, lng: 8.55 },
    });
  });
});
