import { TestBed } from "@angular/core/testing";
import { describe, expect, it, vi } from "vitest";
import { AssetUrlService } from "../../asset-url.service";
import { FirestoreAdapterService } from "../firestore-adapter.service";
import { SeriesService } from "./series.service";

describe("SeriesService", () => {
  it("loads series documents and caches repeated reads", async () => {
    const adapter = {
      getDocument: vi.fn(async () => ({
        id: "parkour-earth",
        name: "Parkour Earth",
        logo_src: "assets/logos/parkour_earth.jpg",
        logo_background_color: "#ffffff",
      })),
    };
    const assetUrls = {
      resolveBundledAssetUrl: vi.fn((url?: string) =>
        url ? `/en/${url}` : undefined,
      ),
    };

    TestBed.configureTestingModule({
      providers: [
        SeriesService,
        { provide: FirestoreAdapterService, useValue: adapter },
        { provide: AssetUrlService, useValue: assetUrls },
      ],
    });

    const service = TestBed.inject(SeriesService);

    await expect(service.getSeriesByIds(["parkour-earth"])).resolves.toEqual({
      "parkour-earth": {
        id: "parkour-earth",
        name: "Parkour Earth",
        logo_src: "/en/assets/logos/parkour_earth.jpg",
        logo_background_color: "#ffffff",
      },
    });
    await service.getSeriesById("parkour-earth");

    expect(adapter.getDocument).toHaveBeenCalledTimes(1);
    expect(adapter.getDocument).toHaveBeenCalledWith("series/parkour-earth");
  });
});
