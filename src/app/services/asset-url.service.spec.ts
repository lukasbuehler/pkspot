import { TestBed } from "@angular/core/testing";
import { Timestamp } from "firebase/firestore";
import { beforeEach, describe, expect, it } from "vitest";
import { EventSchema } from "../../db/schemas/EventSchema";
import { AssetUrlService } from "./asset-url.service";
import { PlatformService } from "./platform.service";

describe("AssetUrlService", () => {
  let service: AssetUrlService;
  let platform: { isNative: () => boolean };
  let isNative = false;

  beforeEach(() => {
    isNative = false;
    platform = {
      isNative: () => isNative,
    };

    TestBed.configureTestingModule({
      providers: [{ provide: PlatformService, useValue: platform }],
    });

    service = TestBed.inject(AssetUrlService);
  });

  it("keeps browser bundled asset URLs unchanged", () => {
    expect(service.resolveBundledAssetUrl("assets/logos/wpf_camp.jpg")).toBe(
      "assets/logos/wpf_camp.jpg",
    );
  });

  it("points native bundled asset URLs at the shared mobile asset folder", () => {
    isNative = true;

    expect(service.resolveBundledAssetUrl("assets/logos/wpf_camp.jpg")).toBe(
      "/en/assets/logos/wpf_camp.jpg",
    );
    expect(service.resolveBundledAssetUrl("/assets/logos/wpf_camp.jpg")).toBe(
      "/en/assets/logos/wpf_camp.jpg",
    );
  });

  it("leaves external and storage-style URLs unchanged on native", () => {
    isNative = true;

    expect(service.resolveBundledAssetUrl("https://example.com/banner.jpg")).toBe(
      "https://example.com/banner.jpg",
    );
    expect(service.resolveBundledAssetUrl("data:image/png;base64,abc")).toBe(
      "data:image/png;base64,abc",
    );
  });

  it("normalizes event media URLs without mutating non-media fields", () => {
    isNative = true;
    const event: EventSchema = {
      name: "WPF Camp",
      banner_src: "assets/logos/wpf_camp_banner.jpg",
      logo_src: "assets/logos/wpf_camp.jpg",
      venue_string: "Basel",
      locality_string: "Basel, Switzerland",
      start: Timestamp.fromMillis(0),
      end: Timestamp.fromMillis(1),
      spot_ids: [],
      inline_spots: [
        {
          id: "yard",
          name: "Yard",
          location: { lat: 47.5, lng: 7.6 },
          images: ["assets/swissjam/swissjam0.jpg"],
        },
      ],
      bounds: { north: 1, south: 0, east: 1, west: 0 },
      sponsor: {
        name: "World Parkour Family",
        logo_src: "assets/logos/wpf_camp_circle_anim.gif",
      },
    };

    const resolved = service.resolveEventAssetUrls(event);

    expect(resolved.banner_src).toBe("/en/assets/logos/wpf_camp_banner.jpg");
    expect(resolved.logo_src).toBe("/en/assets/logos/wpf_camp.jpg");
    expect(resolved.inline_spots?.[0]?.images?.[0]).toBe(
      "/en/assets/swissjam/swissjam0.jpg",
    );
    expect(resolved.sponsor?.logo_src).toBe(
      "/en/assets/logos/wpf_camp_circle_anim.gif",
    );
    expect(event.banner_src).toBe("assets/logos/wpf_camp_banner.jpg");
  });
});
