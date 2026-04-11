import { describe, it, expect, beforeEach, vi } from "vitest";
import { TestBed } from "@angular/core/testing";
import { LandingPagesService } from "./landing-pages.service";
import { FirestoreAdapterService } from "../firestore-adapter.service";

const createMockFirestoreAdapter = () => ({
  getDocument: vi.fn(),
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
    mockFirestoreAdapter.getDocument
      .mockResolvedValueOnce({
        id: "london-uk",
        communityKey: "locality:gb:london",
        isPreferred: false,
      })
      .mockResolvedValueOnce(buildCommunityDoc());

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

    expect(mockFirestoreAdapter.getDocument).toHaveBeenNthCalledWith(
      1,
      "community_slugs/london-uk"
    );
    expect(mockFirestoreAdapter.getDocument).toHaveBeenNthCalledWith(
      2,
      "community_pages/locality:gb:london"
    );
  });

  it("should return null when a community page does not exist", async () => {
    mockFirestoreAdapter.getDocument.mockResolvedValueOnce(null);

    await expect(service.getCommunityPage("missing")).resolves.toBeNull();
  });

  it("should return null when the materialized page is unpublished", async () => {
    mockFirestoreAdapter.getDocument
      .mockResolvedValueOnce({
        id: "london",
        communityKey: "locality:gb:london",
        isPreferred: true,
      })
      .mockResolvedValueOnce(
        buildCommunityDoc({
          published: false,
        })
      );

    await expect(service.getCommunityPage("london")).resolves.toBeNull();
  });
});
