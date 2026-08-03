import { TestBed } from "@angular/core/testing";
import { SpotsService } from "./firebase/firestore/spots.service";
import { SpotSelectionDataService } from "./spot-selection-data.service";

describe("SpotSelectionDataService", () => {
  it("shares successful Spot requests across picker instances", async () => {
    const spot = { id: "spot-1" };
    const getSpotById = vi.fn(async () => spot);
    TestBed.configureTestingModule({
      providers: [
        { provide: SpotsService, useValue: { getSpotById } },
        SpotSelectionDataService,
      ],
    });
    const service = TestBed.inject(SpotSelectionDataService);

    const [first, second] = await Promise.all([
      service.resolve("spot-1", "en"),
      service.resolve("spot-1", "en"),
    ]);

    expect(first).toBe(spot);
    expect(second).toBe(spot);
    expect(getSpotById).toHaveBeenCalledOnce();
  });

  it("evicts failed requests so a picker can retry", async () => {
    const getSpotById = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce({ id: "spot-1" });
    TestBed.configureTestingModule({
      providers: [
        { provide: SpotsService, useValue: { getSpotById } },
        SpotSelectionDataService,
      ],
    });
    const service = TestBed.inject(SpotSelectionDataService);

    await expect(service.resolve("spot-1", "en")).rejects.toThrow("offline");
    await expect(service.resolve("spot-1", "en")).resolves.toEqual({
      id: "spot-1",
    });
    expect(getSpotById).toHaveBeenCalledTimes(2);
  });
});
