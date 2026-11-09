import { PLATFORM_ID, RESPONSE_INIT } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { describe, beforeEach, expect, it, vi } from "vitest";
import {
  RedirectCommand,
  Router,
  UrlTree,
  convertToParamMap,
} from "@angular/router";
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
  let responseInit: ResponseInit;

  beforeEach(() => {
    metaTagService = createMockMetaTagService();
    structuredDataService = createMockStructuredDataService();
    landingPagesService = createMockLandingPagesService();
    responseInit = { status: 200 };

    TestBed.configureTestingModule({
      providers: [
        { provide: MetaTagService, useValue: metaTagService },
        { provide: StructuredDataService, useValue: structuredDataService },
        { provide: LandingPagesService, useValue: landingPagesService },
        { provide: RESPONSE_INIT, useValue: responseInit },
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
      imageUrl: "assets/banner_1200x630.png",
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
      spots: [{ id: "spot-1", name: "Southbank" }] as any,
      communityPicks: [],
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
    expect(structuredDataService.removeStructuredData).toHaveBeenCalledWith(
      "community-spots"
    );
    expect(responseInit.status).toBe(200);
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
    expect(responseInit.status).toBe(404);
  });

  describe("on the server", () => {
    const pageFor = (preferredSlug: string, requestedSlug: string) => ({
      communityKey: `locality:au:${preferredSlug}`,
      scope: "locality",
      displayName: preferredSlug,
      preferredSlug,
      requestedSlug,
      canonicalPath: `/map/communities/${preferredSlug}`,
      title: preferredSlug,
      description: "",
      imageUrl: "assets/banner_1200x630.png",
      breadcrumbs: [],
      communityPicks: [],
      spots: [],
      topRatedSpots: [],
      drySpots: [],
    });
    const resolve = (slug: string, queryParams: Record<string, string> = {}) =>
      TestBed.runInInjectionContext(() =>
        communityLandingResolver(
          { paramMap: convertToParamMap({ slug }), queryParams } as any,
          {} as any,
        ),
      );
    const redirectUrl = (result: unknown): string =>
      TestBed.inject(Router).serializeUrl(
        (result as RedirectCommand).redirectTo as UrlTree,
      );

    beforeEach(() => {
      TestBed.overrideProvider(PLATFORM_ID, { useValue: "server" });
    });

    it.each([
      ["southbank", "melbourne"],
      ["abbotsford", "melbourne"],
      ["Melbourne", "melbourne"],
      ["sydney-cbd", "sydney"],
    ])("permanently redirects %s to its canonical community %s", async (requested, canonical) => {
      landingPagesService.getCommunityPage.mockResolvedValue(
        pageFor(canonical, requested.toLowerCase()),
      );

      const result = await resolve(requested);

      expect(result).toBeInstanceOf(RedirectCommand);
      expect(redirectUrl(result)).toBe(`/map/communities/${canonical}`);
      expect(responseInit.status).toBe(301);
      expect(metaTagService.setCommunityLandingMetaTags).not.toHaveBeenCalled();
    });

    it("keeps the 301 when the redirected navigation resolves the canonical community", async () => {
      landingPagesService.getCommunityPage
        .mockResolvedValueOnce(pageFor("melbourne", "southbank"))
        .mockResolvedValueOnce(pageFor("melbourne", "melbourne"));

      await resolve("southbank");
      const canonical = await resolve("melbourne");

      expect(canonical).not.toBeInstanceOf(RedirectCommand);
      expect(responseInit.status).toBe(301);
    });

    it("keeps query parameters on the redirect", async () => {
      landingPagesService.getCommunityPage.mockResolvedValue(
        pageFor("melbourne", "fitzroy"),
      );

      const result = await resolve("fitzroy", { tab: "events" });

      expect(redirectUrl(result)).toBe("/map/communities/melbourne?tab=events");
    });

    it("renders the canonical community URL without redirecting", async () => {
      landingPagesService.getCommunityPage.mockResolvedValue(
        pageFor("melbourne", "melbourne"),
      );

      const result = await resolve("melbourne");

      expect(result).not.toBeInstanceOf(RedirectCommand);
      expect(responseInit.status).toBe(200);
      expect(metaTagService.setCommunityLandingMetaTags).toHaveBeenCalled();
    });

    it("does not redirect when the canonical path is not the community's own slug", async () => {
      landingPagesService.getCommunityPage.mockResolvedValue({
        ...pageFor("melbourne", "southbank"),
        canonicalPath: "/map/communities/victoria",
      });

      const result = await resolve("southbank");

      expect(result).not.toBeInstanceOf(RedirectCommand);
      expect(responseInit.status).toBe(200);
    });
  });

  it("does not redirect in-app browser navigation to a merged community", async () => {
    landingPagesService.getCommunityPage.mockResolvedValue({
      communityKey: "locality:au:melbourne",
      preferredSlug: "melbourne",
      requestedSlug: "southbank",
      canonicalPath: "/map/communities/melbourne",
      title: "Melbourne",
      description: "",
      imageUrl: "",
      breadcrumbs: [],
      communityPicks: [],
      spots: [],
      topRatedSpots: [],
      drySpots: [],
    });

    const result = await TestBed.runInInjectionContext(() =>
      communityLandingResolver(
        { paramMap: convertToParamMap({ slug: "southbank" }), queryParams: {} } as any,
        {} as any,
      ),
    );

    expect(result).not.toBeInstanceOf(RedirectCommand);
    expect(responseInit.status).toBe(200);
  });
});
