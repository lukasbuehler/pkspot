import { DOCUMENT } from "@angular/common";
import { TestBed } from "@angular/core/testing";
import { LOCALE_ID, PLATFORM_ID } from "@angular/core";
import { Meta, Title } from "@angular/platform-browser";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { StructuredDataService } from "./structured-data.service";
import { CommunityLandingPageData } from "./firebase/firestore/landing-pages.service";
import { Spot } from "../../db/models/Spot";
import { SpotId, SpotSchema } from "../../db/schemas/SpotSchema";
import { SpotAccess, SpotTypes } from "../../db/schemas/SpotTypeAndAccess";

const createMetaMock = () => ({
  updateTag: vi.fn(),
});

const createTitleMock = () => ({
  setTitle: vi.fn(),
});

const buildCommunityLandingPageData = (): CommunityLandingPageData => ({
  communityKey: "locality:ch:zh:pfaeffikon",
  scope: "locality",
  displayName: "Pfaffikon",
  preferredSlug: "pfaeffikon",
  requestedSlug: "pfaeffikon",
  canonicalPath: "/map/communities/pfaeffikon",
  title: "Pfaffikon, Switzerland Parkour Community | PK Spot",
  description: "Discover spots and community info in Pfaffikon.",
  imageUrl: "/assets/banner_1200x630.png",
  country: {
    code: "CH",
    name: "Switzerland",
    slug: "switzerland",
  },
  region: {
    code: "ZH",
    name: "Zurich",
    slug: "zh",
  },
  locality: {
    name: "Pfaffikon",
    slug: "pfaeffikon",
  },
  breadcrumbs: [
    { name: "Map", path: "/map" },
    { name: "Switzerland", path: "/map/communities/switzerland" },
    { name: "Pfaffikon", path: "/map/communities/pfaeffikon" },
  ],
  totalSpotCount: 8,
  topRatedCount: 4,
  dryCount: 2,
  topRatedSpots: [
    {
      id: "spot-1",
      name: "Lake Ledges",
      slug: "lake-ledges",
    } as any,
  ],
  drySpots: [
    {
      id: "spot-2",
      name: "Indoor Hall",
      slug: "indoor-hall",
    } as any,
  ],
  links: {
    instagram: "https://instagram.com/example",
  },
  resources: [],
  organisations: [],
  athletes: [],
  events: [],
  childCommunities: [],
  eventPreviews: [],
});

const buildSpot = (
  data: Partial<SpotSchema> = {},
  id: string = "spot-google-rules"
): Spot =>
  new Spot(
    id as SpotId,
    {
      name: { en: { text: "Google Rules Spot" } },
      description: {
        en: { text: "A spot used to test Google structured data rules." },
      },
      location_raw: { lat: 47.3769, lng: 8.5417 },
      rating: 4.7,
      num_reviews: 9,
      type: SpotTypes.ParkourGym,
      access: SpotAccess.Commercial,
      address: {
        locality: "Zurich",
        country: { code: "CH", name: "Switzerland" },
        formatted: "Zurich, Switzerland",
      },
      slug: "google-rules-spot",
      ...data,
    },
    "en"
  );

const getAggregateRating = (
  item: Record<string, unknown>
): Record<string, unknown> | undefined => {
  const aggregateRating = item["aggregateRating"];

  return typeof aggregateRating === "object" && aggregateRating !== null
    ? (aggregateRating as Record<string, unknown>)
    : undefined;
};

const expectGoogleAggregateRating = (
  item: Record<string, unknown>,
  ratingValue: number,
  count: number
): void => {
  const aggregateRating = getAggregateRating(item);

  expect(item["@type"]).toBe("SportsActivityLocation");
  expect(aggregateRating).toEqual({
    "@type": "AggregateRating",
    ratingValue,
    bestRating: 5,
    worstRating: 1,
    ratingCount: count,
    reviewCount: count,
  });
  expect(
    aggregateRating?.["ratingCount"] || aggregateRating?.["reviewCount"]
  ).toBeTruthy();
};

describe("StructuredDataService", () => {
  let service: StructuredDataService;
  let metaMock: ReturnType<typeof createMetaMock>;
  let titleMock: ReturnType<typeof createTitleMock>;

  beforeEach(() => {
    metaMock = createMetaMock();
    titleMock = createTitleMock();
    document.head
      .querySelectorAll('[id^="structured-data-"]')
      .forEach((node) => node.remove());

    TestBed.configureTestingModule({
      providers: [
        StructuredDataService,
        { provide: Meta, useValue: metaMock },
        { provide: Title, useValue: titleMock },
        { provide: DOCUMENT, useValue: document },
        { provide: LOCALE_ID, useValue: "en" },
        { provide: PLATFORM_ID, useValue: "browser" },
      ],
    });

    service = TestBed.inject(StructuredDataService);
  });

  it("should generate parseable community JSON-LD", () => {
    const pageData = buildCommunityLandingPageData();
    const payload = service.generateCommunityLandingPageData(pageData);

    service.addStructuredData("community-page", payload);

    const script = document.getElementById(
      "structured-data-community-page"
    ) as HTMLScriptElement | null;

    expect(script).toBeTruthy();

    const parsed = JSON.parse(script?.text ?? "{}") as Record<string, unknown>;

    expect(parsed["@context"]).toBe("https://schema.org");
    expect(parsed["@type"]).toBe("CollectionPage");
    expect(parsed["url"]).toBe(
      "https://pkspot.app/en/map/communities/pfaeffikon"
    );
    expect(parsed["description"]).toBe(pageData.description);
  });

  it("should generate parseable breadcrumb JSON-LD", () => {
    const pageData = buildCommunityLandingPageData();
    const payload = service.generateBreadcrumbList(
      service.buildCommunityBreadcrumbs(pageData)
    );

    service.addStructuredData("community-breadcrumbs", payload);

    const script = document.getElementById(
      "structured-data-community-breadcrumbs"
    ) as HTMLScriptElement | null;

    expect(script).toBeTruthy();

    const parsed = JSON.parse(script?.text ?? "{}") as Record<string, any>;

    expect(parsed["@type"]).toBe("BreadcrumbList");
    expect(Array.isArray(parsed["itemListElement"])).toBe(true);
    expect(parsed["itemListElement"]).toHaveLength(3);
  });

  it("should emit spot ratings for commercial sport facilities on a Google-supported parent type", () => {
    const spot = buildSpot();
    const placeData = service.generateSpotPlaceData(spot);

    expectGoogleAggregateRating(placeData as Record<string, unknown>, 4.7, 9);
  });

  it("should keep non-commercial outdoor spots as Place without review rich-result markup", () => {
    const spot = buildSpot({
      type: SpotTypes.PkPark,
      access: SpotAccess.Public,
    });
    const placeData = service.generateSpotPlaceData(spot);

    expect(placeData["@type"]).toBe("Place");
    expect(placeData.aggregateRating).toBeUndefined();
  });

  it("should emit review markup for commercial parkour parks", () => {
    const spot = buildSpot({
      type: SpotTypes.PkPark,
      access: SpotAccess.Commercial,
    });
    const placeData = service.generateSpotPlaceData(spot);

    expectGoogleAggregateRating(placeData as Record<string, unknown>, 4.7, 9);
  });

  it("should not emit aggregate ratings when Google-required counts are missing", () => {
    const spot = buildSpot({
      rating: 4.7,
      num_reviews: 0,
    });
    const placeData = service.generateSpotPlaceData(spot);

    expect(placeData["@type"]).toBe("SportsActivityLocation");
    expect(placeData.aggregateRating).toBeUndefined();
  });

  it("should emit Google-compatible spot list item ratings only with review counts", () => {
    const itemList = service.generateSpotItemList([
      {
        id: "rated-with-count",
        name: "Rated With Count",
        slug: "rated-with-count",
        locality: "Zurich, CH",
        imageSrc: "/assets/spot_placeholder.png",
        isIconic: false,
        type: SpotTypes.ParkourGym,
        access: SpotAccess.Commercial,
        rating: 4.8,
        num_reviews: 12,
      },
      {
        id: "rated-without-count",
        name: "Rated Without Count",
        slug: "rated-without-count",
        locality: "Zurich, CH",
        imageSrc: "/assets/spot_placeholder.png",
        isIconic: false,
        type: SpotTypes.ParkourGym,
        access: SpotAccess.Commercial,
        rating: 4.5,
      },
      {
        id: "public-park-with-count",
        name: "Public Park With Count",
        slug: "public-park-with-count",
        locality: "Zurich, CH",
        imageSrc: "/assets/spot_placeholder.png",
        isIconic: false,
        type: SpotTypes.PkPark,
        access: SpotAccess.Public,
        rating: 4.9,
        num_reviews: 24,
      },
    ]);

    const listItems = itemList["itemListElement"] as Array<{
      item: Record<string, unknown>;
    }>;
    const firstItem = listItems[0].item;
    const secondItem = listItems[1].item;
    const thirdItem = listItems[2].item;

    expectGoogleAggregateRating(firstItem, 4.8, 12);
    expect(secondItem["@type"]).toBe("SportsActivityLocation");
    expect(secondItem["aggregateRating"]).toBeUndefined();
    expect(thirdItem["@type"]).toBe("Place");
    expect(thirdItem["aggregateRating"]).toBeUndefined();
  });
});
