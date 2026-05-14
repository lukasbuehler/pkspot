import { TestBed } from "@angular/core/testing";
import { describe, beforeEach, expect, it, vi } from "vitest";
import { convertToParamMap } from "@angular/router";
import { RESPONSE } from "../../express.token";
import { communityLandingResolver } from "./community-landing.resolver";
import { MetaTagService } from "../services/meta-tag.service";
import { StructuredDataService } from "../services/structured-data.service";
import { LandingPagesService } from "../services/firebase/firestore/landing-pages.service";

const createMockMetaTagService = () => ({
  setCommunityLandingMetaTags: vi.fn(),
  setStaticPageMetaTags: vi.fn(),
  setRobotsContent: vi.fn(),
});

const createMockStructuredDataService = () => ({
  removeStructuredData: vi.fn(),
  addStructuredData: vi.fn(),
  generateCommunityLandingPageData: vi.fn(() => ({ "@type": "CollectionPage" })),
  generateBreadcrumbList: vi.fn(() => ({ "@type": "BreadcrumbList" })),
  buildCommunityBreadcrumbs: vi.fn(() => []),
  generateSpotItemList: vi.fn(() => ({ "@type": "ItemList" })),
});

const createMockLandingPagesService = () => ({
  getCommunityPage: vi.fn(),
});

describe("communityLandingResolver", () => {
  let metaTagService: ReturnType<typeof createMockMetaTagService>;
  let structuredDataService: ReturnType<typeof createMockStructuredDataService>;
  let landingPagesService: ReturnType<typeof createMockLandingPagesService>;
  let response: { status: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    metaTagService = createMockMetaTagService();
    structuredDataService = createMockStructuredDataService();
    landingPagesService = createMockLandingPagesService();
    response = {
      status: vi.fn().mockReturnThis(),
    };

    TestBed.configureTestingModule({
      providers: [
        { provide: MetaTagService, useValue: metaTagService },
        { provide: StructuredDataService, useValue: structuredDataService },
        { provide: LandingPagesService, useValue: landingPagesService },
        { provide: RESPONSE, useValue: response },
      ],
    });
  });

  it("should resolve a community page and set SSR metadata", async () => {
    landingPagesService.getCommunityPage.mockResolvedValue({
      communityKey: "locality:gb:london",
      scope: "locality",
      displayName: "London",
      preferredSlug: "london",
      requestedSlug: "london",
      title: "Parkour in London, United Kingdom | PK Spot Community",
      description: "Discover London parkour spots.",
      imageUrl: "/assets/banner_1200x630.png",
      canonicalPath: "/map/communities/london",
      country: { name: "United Kingdom", slug: "united-kingdom" },
      locality: { name: "London", slug: "london" },
      breadcrumbs: [
        { name: "Map", path: "/map" },
        { name: "United Kingdom", path: "/map/communities/united-kingdom" },
        { name: "London", path: "/map/communities/london" },
      ],
      totalSpotCount: 7,
      topRatedCount: 4,
      dryCount: 2,
      topRatedSpots: [{ id: "spot-1", name: "Southbank" }] as any,
      drySpots: [{ id: "spot-2", name: "Brixton" }] as any,
      links: {},
      resources: [],
      organisations: [],
      athletes: [],
      events: [],
      childCommunities: [],
    });

    const route = {
      paramMap: convertToParamMap({
        slug: "london",
      }),
    };

    const result = await TestBed.runInInjectionContext(() =>
      communityLandingResolver(route as any)
    );

    expect(result.scope).toBe("locality");
    expect(metaTagService.setCommunityLandingMetaTags).toHaveBeenCalled();
    expect(structuredDataService.addStructuredData).toHaveBeenCalled();
    expect(response.status).toHaveBeenCalledWith(200);
  });

  it("should mark missing pages as 404 and noindex", async () => {
    landingPagesService.getCommunityPage.mockResolvedValue(null);

    const route = {
      paramMap: convertToParamMap({
        slug: "atlantis",
      }),
    };

    const result = await TestBed.runInInjectionContext(() =>
      communityLandingResolver(route as any)
    );

    expect(result.notFound).toBe(true);
    expect(metaTagService.setStaticPageMetaTags).toHaveBeenCalled();
    expect(metaTagService.setRobotsContent).toHaveBeenCalledWith(
      "noindex,nofollow"
    );
    expect(response.status).toHaveBeenCalledWith(404);
  });
});
