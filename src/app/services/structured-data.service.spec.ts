import { DOCUMENT } from "@angular/common";
import { TestBed } from "@angular/core/testing";
import { LOCALE_ID, PLATFORM_ID } from "@angular/core";
import { Meta, Title } from "@angular/platform-browser";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { StructuredDataService } from "./structured-data.service";
import { CommunityLandingPageData } from "./firebase/firestore/landing-pages.service";

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
  canonicalPath: "/map/community/pfaeffikon",
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
    { name: "Switzerland", path: "/map/community/switzerland" },
    { name: "Pfaffikon", path: "/map/community/pfaeffikon" },
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
});

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
      "https://pkspot.app/en/map/community/pfaeffikon"
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
});
