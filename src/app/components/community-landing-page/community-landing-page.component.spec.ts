import { of } from "rxjs";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { provideRouter } from "@angular/router";
import { ActivatedRoute } from "@angular/router";
import { CommunityLandingPageComponent } from "./community-landing-page.component";
import { CommunityLandingPageData } from "../../services/firebase/firestore/landing-pages.service";
import { SpotPreviewData } from "../../../db/schemas/SpotPreviewData";
import { StorageService } from "../../services/firebase/storage.service";
import { MapsApiService } from "../../services/maps-api.service";

const communityData: CommunityLandingPageData = {
  communityKey: "country:ch",
  scope: "country",
  displayName: "Switzerland",
  preferredSlug: "switzerland",
  requestedSlug: "switzerland",
  canonicalPath: "/map/communities/switzerland",
  title: "Parkour in Switzerland | PK Spot Community",
  description: "Discover parkour spots in Switzerland.",
  imageUrl: "/assets/banner_1200x630.png",
  country: { name: "Switzerland", slug: "switzerland" },
  breadcrumbs: [
    { name: "Map", path: "/map" },
    { name: "Switzerland", path: "/map/communities/switzerland" },
  ],
  totalSpotCount: 242,
  topRatedCount: 42,
  dryCount: 10,
  topRatedSpots: [],
  drySpots: [],
  links: {},
  resources: [],
  organisations: [],
  athletes: [],
  events: [],
  eventPreviews: [],
  childCommunities: [
    {
      communityKey: "locality:ch:zh:zuerich",
      scope: "locality",
      displayName: "Zuerich",
      preferredSlug: "zuerich",
      canonicalPath: "/map/communities/zuerich",
      totalSpotCount: 140,
      dryCount: 7,
    },
  ],
};

describe("CommunityLandingPageComponent", () => {
  let fixture: ComponentFixture<CommunityLandingPageComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CommunityLandingPageComponent],
      providers: [
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: {
            data: of({}),
            snapshot: { data: {} },
          },
        },
        {
          provide: StorageService,
          useValue: {},
        },
        {
          provide: MapsApiService,
          useValue: {
            isStreetViewPreviewEnabled: vi.fn(() => false),
            isStreetViewPreviewAllowedAtZoom: vi.fn(() => false),
            getCachedStreetViewPanoramaAvailability: vi.fn(() => null),
            getStaticStreetViewImageForLocation: vi.fn(() => ""),
            hasStreetViewPanoramaForLocation: vi.fn().mockResolvedValue(false),
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(CommunityLandingPageComponent);
  });

  it("emits child community paths from panel-mode links", () => {
    const openCommunityPath = vi.fn();
    fixture.componentRef.setInput("communityDataInput", communityData);
    fixture.componentRef.setInput("panelMode", true);
    fixture.componentInstance.openCommunityPath.subscribe(openCommunityPath);
    fixture.detectChanges();

    const link = fixture.nativeElement.querySelector(
      ".community-link-card"
    ) as HTMLAnchorElement;
    expect(link.tagName).toBe("A");
    expect(link.getAttribute("href")).toBe("/map/communities/zuerich");

    link.click();

    expect(openCommunityPath).toHaveBeenCalledWith("/map/communities/zuerich");
  });

  it("keeps child communities as router links on the full community page", () => {
    const openCommunityPath = vi.fn();
    fixture.componentRef.setInput("communityDataInput", communityData);
    fixture.componentRef.setInput("panelMode", false);
    fixture.componentInstance.openCommunityPath.subscribe(openCommunityPath);
    fixture.detectChanges();

    const link = fixture.nativeElement.querySelector(
      ".community-link-card"
    ) as HTMLAnchorElement;
    expect(link.tagName).toBe("A");

    link.click();

    expect(openCommunityPath).not.toHaveBeenCalled();
  });

  it("emits clicked featured spots in panel mode", () => {
    const selectSpot = vi.fn();
    const spot: SpotPreviewData = {
      id: "spot-1",
      slug: "spot-one",
      name: "Spot One",
      locality: "Zuerich",
      imageSrc: "/assets/spot_placeholder.png",
      isIconic: false,
    };
    fixture.componentRef.setInput("communityDataInput", {
      ...communityData,
      topRatedSpots: [spot],
    });
    fixture.componentRef.setInput("panelMode", true);
    fixture.componentInstance.selectSpot.subscribe(selectSpot);
    fixture.detectChanges();

    const card = fixture.nativeElement.querySelector(
      "app-spot-preview-card"
    ) as HTMLElement;
    card.click();

    expect(selectSpot).toHaveBeenCalledWith(spot);
  });
});
