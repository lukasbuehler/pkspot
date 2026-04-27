import { DOCUMENT } from "@angular/common";
import { TestBed } from "@angular/core/testing";
import { LOCALE_ID, PLATFORM_ID } from "@angular/core";
import { Meta, Title } from "@angular/platform-browser";
import { convertToParamMap } from "@angular/router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { contentResolver } from "./content.resolver";
import { MetaTagService } from "../services/meta-tag.service";
import { SpotsService } from "../services/firebase/firestore/spots.service";
import { SpotChallengesService } from "../services/firebase/firestore/spot-challenges.service";
import { SlugsService } from "../services/firebase/firestore/slugs.service";
import { UsersService } from "../services/firebase/firestore/users.service";
import { ConsentService } from "../services/consent.service";
import { Spot } from "../../db/models/Spot";
import { MediaType } from "../../db/models/Interfaces";
import { SpotId } from "../../db/schemas/SpotSchema";

const DEFAULT_SOCIAL_IMAGE = "https://pkspot.app/assets/banner_1200x630.png";

const createDocumentMetaMock = (doc: Document) => ({
  updateTag: vi.fn(
    (definition: {
      name?: string;
      property?: string;
      content?: string;
    }): HTMLMetaElement => {
      const selector = definition.name
        ? `meta[name="${definition.name}"]`
        : `meta[property="${definition.property}"]`;
      let element = doc.head.querySelector(selector) as HTMLMetaElement | null;

      if (!element) {
        element = doc.createElement("meta");
        if (definition.name) {
          element.setAttribute("name", definition.name);
        }
        if (definition.property) {
          element.setAttribute("property", definition.property);
        }
        doc.head.appendChild(element);
      }

      element.setAttribute("content", definition.content ?? "");
      return element;
    }
  ),
});

const createTitleMock = () => ({
  setTitle: vi.fn(),
});

const createRouteSnapshot = (spotSlug: string) => {
  const mapRoute = {
    routeConfig: { path: "map" },
    paramMap: convertToParamMap({}),
    parent: null,
    children: [] as any[],
  };

  const spotRoute = {
    routeConfig: { path: ":spot" },
    paramMap: convertToParamMap({ spot: spotSlug }),
    parent: mapRoute,
    children: [] as any[],
  };

  mapRoute.children = [spotRoute];

  return spotRoute;
};

const getMetaContent = (doc: Document, selector: string): string | null =>
  doc.head.querySelector(selector)?.getAttribute("content") ?? null;

const buildImaxSpot = (): Spot =>
  new Spot(
    "spot-imax" as SpotId,
    {
      name: { en: "IMAX" },
      slug: "imax",
      description: {
        en: "Big concrete playground beside the cinema.",
      },
      location_raw: { lat: 47.3769, lng: 8.5417 },
      tile_coordinates: { z16: { x: 1, y: 1 } } as any,
      media: [
        {
          type: MediaType.Image,
          src: "https://images.example.com/imax-social-card.jpg",
          isInStorage: false,
          origin: "user",
        },
      ],
      rating: 4.6,
      num_reviews: 18,
      address: {
        locality: "Zurich",
        country: {
          code: "CH",
          name: "Switzerland",
        },
      },
      type: "urban landscape",
      access: "public",
      amenities: {},
    } as any,
    "en"
  );

describe("contentResolver", () => {
  let testDocument: Document;
  let metaMock: ReturnType<typeof createDocumentMetaMock>;
  let titleMock: ReturnType<typeof createTitleMock>;
  let spotsService: { getSpotById: ReturnType<typeof vi.fn> };
  let slugsService: { getSpotIdFromSpotSlug: ReturnType<typeof vi.fn> };
  let consentService: { hasConsent: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    testDocument = document.implementation.createHTMLDocument("PK Spot SSR");
    metaMock = createDocumentMetaMock(testDocument);
    titleMock = createTitleMock();
    spotsService = {
      getSpotById: vi.fn(),
    };
    slugsService = {
      getSpotIdFromSpotSlug: vi.fn(),
    };
    consentService = {
      hasConsent: vi.fn(() => true),
    };

    TestBed.configureTestingModule({
      providers: [
        MetaTagService,
        { provide: DOCUMENT, useValue: testDocument },
        { provide: Meta, useValue: metaMock },
        { provide: Title, useValue: titleMock },
        { provide: LOCALE_ID, useValue: "en" },
        { provide: PLATFORM_ID, useValue: "server" },
        { provide: SpotsService, useValue: spotsService },
        { provide: SpotChallengesService, useValue: {} },
        { provide: SlugsService, useValue: slugsService },
        { provide: UsersService, useValue: {} },
        { provide: ConsentService, useValue: consentService },
      ],
    });
  });

  it("should render spot-specific SSR social tags for the imax route", async () => {
    const imaxSpot = buildImaxSpot();
    const route = createRouteSnapshot("imax");

    slugsService.getSpotIdFromSpotSlug.mockResolvedValue("spot-imax");
    spotsService.getSpotById.mockResolvedValue(imaxSpot);

    const result = await TestBed.runInInjectionContext(() =>
      contentResolver(route as any)
    );

    expect(result.spot).toBe(imaxSpot);
    expect(slugsService.getSpotIdFromSpotSlug).toHaveBeenCalledWith("imax");
    expect(spotsService.getSpotById).toHaveBeenCalledWith("spot-imax", "en");
    expect(titleMock.setTitle).toHaveBeenCalledWith("IMAX - Zurich | PK Spot");

    expect(getMetaContent(testDocument, 'meta[property="og:title"]')).toBe(
      "IMAX - Zurich | PK Spot"
    );
    expect(getMetaContent(testDocument, 'meta[name="twitter:title"]')).toBe(
      "IMAX - Zurich | PK Spot"
    );

    const image = getMetaContent(testDocument, 'meta[property="og:image"]');
    expect(image).toBe("https://images.example.com/imax-social-card.jpg");
    expect(image).not.toBe(DEFAULT_SOCIAL_IMAGE);
    expect(getMetaContent(testDocument, 'meta[name="twitter:image"]')).toBe(
      "https://images.example.com/imax-social-card.jpg"
    );

    const description = getMetaContent(
      testDocument,
      'meta[name="description"]'
    );
    expect(description).toContain("Parkour spot in Zurich, CH.");
    expect(description).toContain("Rated 4.6 out of 5.");
    expect(description).toContain("Big concrete playground beside the cinema.");
    expect(description).not.toContain(
      "Discover photos, details, and training info."
    );

    expect(
      getMetaContent(testDocument, 'meta[property="og:description"]')
    ).toBe(description);
    expect(
      getMetaContent(testDocument, 'meta[property="og:url"]')
    ).toBe("https://pkspot.app/en/map/imax");

    const canonicalLink = testDocument.head.querySelector(
      'link[rel="canonical"]'
    );
    expect(canonicalLink?.getAttribute("href")).toBe(
      "https://pkspot.app/en/map/imax"
    );
  });

  it("should render spot social tags when the map parent resolver sees a child spot route", async () => {
    const imaxSpot = buildImaxSpot();
    const childRoute = createRouteSnapshot("imax");
    const parentRoute = childRoute.parent;

    slugsService.getSpotIdFromSpotSlug.mockResolvedValue("spot-imax");
    spotsService.getSpotById.mockResolvedValue(imaxSpot);

    const result = await TestBed.runInInjectionContext(() =>
      contentResolver(parentRoute as any)
    );

    expect(result.spot).toBe(imaxSpot);
    expect(getMetaContent(testDocument, 'meta[property="og:title"]')).toBe(
      "IMAX - Zurich | PK Spot"
    );
    expect(
      getMetaContent(testDocument, 'meta[property="og:url"]')
    ).toBe("https://pkspot.app/en/map/imax");
  });
});
