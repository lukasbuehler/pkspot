import { describe, it, expect, beforeEach, vi } from "vitest";
import { TestBed } from "@angular/core/testing";
import { LandingPagesService } from "./landing-pages.service";
import { FirestoreAdapterService } from "../firestore-adapter.service";

const createMockFirestoreAdapter = () => ({
  getCollection: vi.fn(),
});

const buildCommunityDoc = (overrides: Record<string, unknown> = {}) => ({
  id: "locality:gb:london",
  communityKey: "locality:gb:london",
  scope: "locality",
  displayName: "London",
  preferredSlug: "london",
  allSlugs: ["london", "london-uk"],
  canonicalPath: "/map/community/london",
  title: "London, United Kingdom Parkour Community | PK Spot",
  description:
    "Discover 7 parkour spots and 3 dry training options in London, United Kingdom on PK Spot.",
  geography: {
    countryCode: "GB",
    countryName: "United Kingdom",
    countrySlug: "united-kingdom",
    localityName: "London",
    localitySlug: "london",
  },
  breadcrumbs: [
    { name: "Map", path: "/map" },
    { name: "United Kingdom", path: "/map/community/united-kingdom" },
    { name: "London", path: "/map/community/london" },
  ],
  counts: {
    totalSpots: 7,
    topRated: 4,
    dry: 3,
  },
  topRatedSpots: [{ id: "spot-1", name: "Southbank" }],
  drySpots: [{ id: "spot-2", name: "Brixton" }],
  image: {
    type: "default",
    url: "/assets/banner_1200x630.png",
  },
  links: {},
  resources: [],
  organisations: [],
  athletes: [],
  events: [],
  published: true,
  ...overrides,
});

describe("LandingPagesService", () => {
  let service: LandingPagesService;
  let mockFirestoreAdapter: ReturnType<typeof createMockFirestoreAdapter>;

  beforeEach(() => {
    mockFirestoreAdapter = createMockFirestoreAdapter();

    TestBed.configureTestingModule({
      providers: [
        LandingPagesService,
        { provide: FirestoreAdapterService, useValue: mockFirestoreAdapter },
      ],
    });

    service = TestBed.inject(LandingPagesService);
  });

  it("should build a community landing page from a single Firestore document", async () => {
    mockFirestoreAdapter.getCollection.mockResolvedValueOnce([buildCommunityDoc()]);

    const result = await service.getCommunityPage("london-uk");

    expect(result).toMatchObject({
      scope: "locality",
      preferredSlug: "london",
      requestedSlug: "london-uk",
      displayName: "London",
      country: {
        name: "United Kingdom",
        slug: "united-kingdom",
      },
      canonicalPath: "/map/community/london",
    });
    expect(result?.topRatedSpots.length).toBe(1);
    expect(result?.drySpots.length).toBe(1);

    expect(mockFirestoreAdapter.getCollection).toHaveBeenCalledWith(
      "community_pages",
      [
        {
          fieldPath: "allSlugs",
          opStr: "array-contains",
          value: "london-uk",
        },
      ],
      [{ type: "limit", limit: 1 }]
    );
  });

  it("should return null when a community page does not exist", async () => {
    mockFirestoreAdapter.getCollection.mockResolvedValueOnce([]);

    await expect(service.getCommunityPage("missing")).resolves.toBeNull();
  });
});
