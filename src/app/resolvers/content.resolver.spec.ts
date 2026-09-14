import { RESPONSE } from "../../express.token";
import { SpotLoadError } from "../../db/models/SpotLoadError";
import { DOCUMENT } from "@angular/common";
import { TestBed } from "@angular/core/testing";
import { LOCALE_ID, PLATFORM_ID } from "@angular/core";
import { Meta, Title } from "@angular/platform-browser";
import { ActivatedRouteSnapshot, convertToParamMap } from "@angular/router";
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

const DEFAULT_SOCIAL_IMAGE =
  "https://pkspot.app/en/assets/banner_1200x630.png";

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

const createRouteSnapshot = (
  spotSlug: string,
  routePath: ":spot" | "spots/:spot" = "spots/:spot"
) => {
  const mapRoute = {
    routeConfig: { path: "map" },
    paramMap: convertToParamMap({}),
    parent: null,
    children: [] as any[],
  };

  const spotRoute = {
    routeConfig: { path: routePath },
    paramMap: convertToParamMap({ spot: spotSlug }),
    parent: mapRoute,
    children: [] as any[],
  };

  mapRoute.children = [spotRoute];

  return spotRoute;
};

const getMetaContent = (doc: Document, selector: string): string | null =>
  doc.head.querySelector(selector)?.getAttribute("content") ?? null;

const getLinkHref = (doc: Document, selector: string): string | null =>
  doc.head.querySelector(selector)?.getAttribute("href") ?? null;

const expectNoRawI18nMarkersInShareMeta = (doc: Document): void => {
  const selectors = [
    'meta[name="description"]',
    'meta[property="og:title"]',
    'meta[property="og:description"]',
    'meta[property="og:image"]',
    'meta[property="og:url"]',
    'meta[name="twitter:title"]',
    'meta[name="twitter:description"]',
    'meta[name="twitter:image"]',
  ];

  for (const selector of selectors) {
    const content = getMetaContent(doc, selector);
    expect(content, selector).toBeTruthy();
    expect(content, selector).not.toContain("@@");
  }
};

const buildImaxSpot = (): Spot =>
  new Spot(
    "spot-imax" as SpotId,
    {
      name: { en: "IMAX" },
      slug: "imax",
      description: {
        en: "Big concrete playground beside the cinema.",
      },
      location_raw: { lat: 51.5049, lng: -0.1138 },
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
        locality: "London",
        country: {
          code: "GB",
          name: "United Kingdom",
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
        { provide: RESPONSE, useValue: null },
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

  it.each([
    ["not_found", 404],
    ["missing_location", 503],
  ] as const)("returns a controlled %s fallback without an application error", async (reason, status) => {
    const response = { status: vi.fn() };
    TestBed.overrideProvider(RESPONSE, { useValue: response });
    slugsService.getSpotIdFromSpotSlug.mockResolvedValue("unavailable-spot");
    spotsService.getSpotById.mockRejectedValue(new SpotLoadError("unavailable-spot", reason));
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    const warnLog = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const result = await TestBed.runInInjectionContext(() => contentResolver(createRouteSnapshot("unavailable-spot") as ActivatedRouteSnapshot));
      expect(result).not.toHaveProperty("spot");
      expect(response.status).toHaveBeenCalledWith(status);
      expect(getMetaContent(testDocument, 'meta[name="robots"]')).toBe("noindex,nofollow");
      expect(errorLog).not.toHaveBeenCalled();
    } finally {
      errorLog.mockRestore();
      warnLog.mockRestore();
    }
  });

  it("keeps backend failures visible and does not misclassify them as missing Spots", async () => {
    const response = { status: vi.fn() };
    TestBed.overrideProvider(RESPONSE, { useValue: response });
    const failure = new Error("Firestore unavailable");
    spotsService.getSpotById.mockRejectedValue(failure);
    slugsService.getSpotIdFromSpotSlug.mockResolvedValue("spot");
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      await TestBed.runInInjectionContext(() => contentResolver(createRouteSnapshot("spot") as ActivatedRouteSnapshot));
      expect(response.status).toHaveBeenCalledWith(500);
      expect(errorLog).toHaveBeenCalledWith("Error resolving spot content:", failure);
    } finally {
      errorLog.mockRestore();
    }
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
    expect(titleMock.setTitle).toHaveBeenCalledWith("IMAX: Parkour Spot in London | PK Spot");

    expect(getMetaContent(testDocument, 'meta[property="og:title"]')).toBe(
      "IMAX: Parkour Spot in London | PK Spot"
    );
    expect(getMetaContent(testDocument, 'meta[name="twitter:title"]')).toBe(
      "IMAX: Parkour Spot in London | PK Spot"
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
    expect(description).toContain("Parkour Spot in London.");
    expect(description).toContain("Rated 4.6 out of 5.");
    expect(description).not.toContain("Big concrete playground beside the cinema.");
    expect(description).not.toContain(
      "Discover photos, details, and training info."
    );

    expect(
      getMetaContent(testDocument, 'meta[property="og:description"]')
    ).toBe(description);
    expect(
      getMetaContent(testDocument, 'meta[name="twitter:description"]')
    ).toBe(description);
    expect(
      getMetaContent(testDocument, 'meta[property="og:url"]')
    ).toBe("https://pkspot.app/en/map/spots/imax");
    expectNoRawI18nMarkersInShareMeta(testDocument);

    const canonicalLink = testDocument.head.querySelector(
      'link[rel="canonical"]'
    );
    expect(canonicalLink?.getAttribute("href")).toBe(
      "https://pkspot.app/en/map/spots/imax"
    );
    expect(
      getLinkHref(testDocument, 'link[rel="alternate"][hreflang="en"]')
    ).toBe("https://pkspot.app/en/map/spots/imax");
    expect(
      getLinkHref(testDocument, 'link[rel="alternate"][hreflang="de"]')
    ).toBe("https://pkspot.app/de/map/spots/imax");
    expect(
      getLinkHref(testDocument, 'link[rel="alternate"][hreflang="de-CH"]')
    ).toBeNull();
    expect(
      getLinkHref(testDocument, 'link[rel="alternate"][hreflang="x-default"]')
    ).toBe("https://pkspot.app/en/map/spots/imax");
  });

  it("should use the resolved spot slug for canonical links when the requested route used an id", async () => {
    const imaxSpot = buildImaxSpot();
    const route = createRouteSnapshot("spot-imax");

    slugsService.getSpotIdFromSpotSlug.mockRejectedValue("No slug found");
    spotsService.getSpotById.mockResolvedValue(imaxSpot);

    await TestBed.runInInjectionContext(() => contentResolver(route as any));

    expect(spotsService.getSpotById).toHaveBeenCalledWith("spot-imax", "en");
    expect(
      getMetaContent(testDocument, 'meta[property="og:url"]')
    ).toBe("https://pkspot.app/en/map/spots/imax");
    expect(
      getLinkHref(testDocument, 'link[rel="canonical"]')
    ).toBe("https://pkspot.app/en/map/spots/imax");
    expect(
      getLinkHref(testDocument, 'link[rel="alternate"][hreflang="de"]')
    ).toBe("https://pkspot.app/de/map/spots/imax");
    expect(
      getLinkHref(testDocument, 'link[rel="alternate"][hreflang="x-default"]')
    ).toBe("https://pkspot.app/en/map/spots/imax");
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
      "IMAX: Parkour Spot in London | PK Spot"
    );
    expect(
      getMetaContent(testDocument, 'meta[property="og:url"]')
    ).toBe("https://pkspot.app/en/map/spots/imax");
  });

  it("should canonicalize legacy spot routes to the namespaced spot URL", async () => {
    const imaxSpot = buildImaxSpot();
    const legacyRoute = createRouteSnapshot("imax", ":spot");

    slugsService.getSpotIdFromSpotSlug.mockResolvedValue("spot-imax");
    spotsService.getSpotById.mockResolvedValue(imaxSpot);

    await TestBed.runInInjectionContext(() => contentResolver(legacyRoute as any));

    expect(
      getMetaContent(testDocument, 'meta[property="og:url"]')
    ).toBe("https://pkspot.app/en/map/spots/imax");
    expect(
      testDocument.head
        .querySelector('link[rel="canonical"]')
        ?.getAttribute("href")
    ).toBe("https://pkspot.app/en/map/spots/imax");
  });
});
