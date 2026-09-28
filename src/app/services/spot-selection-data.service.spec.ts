import { TestBed } from "@angular/core/testing";
import { SpotsService } from "./firebase/firestore/spots.service";
import { SpotSelectionDataService } from "./spot-selection-data.service";

describe("SpotSelectionDataService", () => {
  it("uses saved names, deduplicates old references and hides unavailable IDs", async () => {
    const getSpotById = vi.fn(async (id: string) => {
      if (id === 'missing') throw new Error('not found');
      return { name: () => 'Riverside walls' };
    });
    TestBed.configureTestingModule({ providers: [{ provide: SpotsService, useValue: { getSpotById } }] });
    const service = TestBed.inject(SpotSelectionDataService);
    const names = await service.resolveVisitNames([
      { spot_id: 'saved', spot_name: 'Saved name' },
      { spot_id: 'older' }, { spot_id: 'older' }, { spot_id: 'missing' },
    ], 'en');
    expect(names.get('saved')).toBe('Saved name');
    expect(names.get('older')).toBe('Riverside walls');
    expect(names.get('missing')).toBe('Unavailable Spot');
    expect(getSpotById).toHaveBeenCalledTimes(2);
    await service.resolveVisitNames([{ spot_id: 'older' }], 'en');
    expect(getSpotById).toHaveBeenCalledTimes(2);
  });
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
