import { of } from "rxjs";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { provideRouter } from "@angular/router";
import { ActivatedRoute } from "@angular/router";
import { signal } from "@angular/core";
import { MatSnackBar } from "@angular/material/snack-bar";
import { CommunityLandingPageComponent } from "./community-landing-page.component";
import {
  CommunityLandingPageData,
  LandingPagesService,
} from "../../services/firebase/firestore/landing-pages.service";
import { SpotPreviewData } from "../../../db/schemas/SpotPreviewData";
import { StorageService } from "../../services/firebase/storage.service";
import { MapsApiService } from "../../services/maps-api.service";
import { AuthenticationService } from "../../services/firebase/authentication.service";
import { SearchService } from "../../services/search.service";

const communityData: CommunityLandingPageData = {
  communityKey: "country:ch",
  scope: "country",
  displayName: "Switzerland",
  preferredSlug: "switzerland",
  requestedSlug: "switzerland",
  canonicalPath: "/map/communities/switzerland",
  title: "Parkour in Switzerland | PK Spot Community",
  description: "Discover parkour spots in Switzerland.",
  imageUrl: "assets/banner_1200x630.png",
  hasCustomImage: false,
  country: { name: "Switzerland", slug: "switzerland" },
  breadcrumbs: [
    { name: "Map", path: "/map" },
    { name: "Switzerland", path: "/map/communities/switzerland" },
  ],
  totalSpotCount: 242,
  topRatedCount: 42,
  dryCount: 10,
  spots: [],
  communityPicks: [],
  topRatedSpots: [],
  drySpots: [],
  links: {},
  infoCards: [],
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
  let isAdmin: ReturnType<typeof signal<boolean>>;

  beforeEach(async () => {
    isAdmin = signal(false);
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
        {
          provide: AuthenticationService,
          useValue: { user: { data: null }, isAdmin },
        },
        {
          provide: LandingPagesService,
          useValue: {
            updateCommunityInfoCards: vi.fn(),
            updateCommunityMergeInto: vi.fn(),
          },
        },
        {
          provide: SearchService,
          useValue: { listCommunities: vi.fn().mockResolvedValue([]) },
        },
        {
          provide: MatSnackBar,
          useValue: { open: vi.fn() },
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
      spots: [spot],
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

  it("shows unrated community spots instead of an empty-state message", () => {
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
      topRatedCount: 0,
      topRatedSpots: [],
      spots: [spot],
    });
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain("Spots");
    expect(fixture.nativeElement.textContent).not.toContain(
      "featured spot sections yet",
    );
    expect(
      fixture.nativeElement.querySelector("app-spot-preview-card"),
    ).not.toBeNull();
  });

  it("renders generated community pick sections before legacy spot lists", () => {
    const spot: SpotPreviewData = {
      id: "spot-1",
      slug: "spot-one",
      name: "Spot One",
      locality: "Zuerich",
      imageSrc: "/assets/spot_placeholder.png",
      isIconic: true,
      rating: 9,
    };
    fixture.componentRef.setInput("communityDataInput", {
      ...communityData,
      spots: [],
      topRatedSpots: [],
      communityPicks: [
        {
          category: "standout",
          title: "Standout Spots",
          spots: [spot],
        },
      ],
    });
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain("Standout Spots");
    const headings = [
      ...fixture.nativeElement.querySelectorAll("h2"),
    ].map((heading: HTMLElement) => heading.textContent?.trim() ?? "");
    expect(headings).toContain("Standout Spots");
    expect(headings).not.toContain("Dry Spots");
    expect(
      fixture.nativeElement.querySelector("app-spot-preview-card"),
    ).not.toBeNull();
  });

  it("renders a crawler-readable text directory with spot links", () => {
    fixture.componentRef.setInput("communityDataInput", {
      ...communityData,
      displayName: "Zuerich",
      spots: [
        {
          id: "mfo-park",
          slug: "mfo-park",
          name: "MFO Park",
          locality: "Zuerich",
          imageSrc: "/assets/spot_placeholder.png",
          isIconic: true,
          type: "pk_park",
          access: "public",
          rating: 4.8,
          amenities: {
            covered: true,
            lighting: true,
          },
        },
        {
          id: "mfo-park",
          slug: "mfo-park",
          name: "MFO Park",
          locality: "Zuerich",
          imageSrc: "/assets/spot_placeholder.png",
          isIconic: true,
        },
      ],
    });
    fixture.componentRef.setInput("panelMode", false);
    fixture.detectChanges();

    const directory = fixture.nativeElement.querySelector(
      ".spot-text-directory",
    ) as HTMLElement | null;
    const links = [
      ...fixture.nativeElement.querySelectorAll(".spot-text-directory a"),
    ] as HTMLAnchorElement[];

    expect(directory?.textContent).toContain("Parkour spots in Zuerich");
    expect(directory?.textContent).toContain("MFO Park");
    expect(directory?.textContent).toContain("Zuerich");
    expect(directory?.textContent).toContain("parkour park");
    expect(directory?.textContent).toContain("public access");
    expect(directory?.textContent).toContain("amenities: covered, lighting");
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "/map/spots/mfo-park",
    ]);
  });

  it("keeps the crawler text directory out of panel mode", () => {
    fixture.componentRef.setInput("communityDataInput", {
      ...communityData,
      spots: [
        {
          id: "spot-1",
          slug: "spot-one",
          name: "Spot One",
          locality: "Zuerich",
          imageSrc: "/assets/spot_placeholder.png",
          isIconic: false,
        },
      ],
    });
    fixture.componentRef.setInput("panelMode", true);
    fixture.detectChanges();

    expect(
      fixture.nativeElement.querySelector(".spot-text-directory"),
    ).toBeNull();
  });

  it("renders curated info cards with one sanitized CTA", () => {
    fixture.componentRef.setInput("communityDataInput", {
      ...communityData,
      infoCards: [
        {
          id: "tuesday-jam",
          title: { en: "Jams every Tuesday evening" },
          body: { en: "Locations are announced in the WhatsApp group." },
          category: "jams",
          priority: 2,
          cta: {
            label: { en: "View event" },
            target: "event",
            eventId: "zurich-tuesday-jam",
          },
        },
        {
          id: "chat",
          title: { en: "WhatsApp group chat" },
          category: "chat",
          priority: 1,
          cta: {
            label: { en: "Open WhatsApp" },
            target: "url",
            url: "https://chat.whatsapp.com/example",
          },
        },
        {
          id: "unsafe",
          title: { en: "Unsafe Link" },
          cta: {
            label: { en: "Open" },
            target: "url",
            url: "javascript:alert(1)",
          },
        },
        {
          id: "hidden",
          title: { en: "Hidden Card" },
          visibility: "hidden",
        },
      ],
    });
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent;
    expect(text).toContain("Local Knowledge");
    expect(text).toContain("Jams every Tuesday evening");
    expect(text).toContain("WhatsApp group chat");
    expect(text).not.toContain("Hidden Card");

    const links = [
      ...fixture.nativeElement.querySelectorAll(".local-info-actions a"),
    ] as HTMLAnchorElement[];
    expect(links.map((link) => link.textContent?.trim())).toEqual([
      "linkOpen WhatsApp",
      "eventView event",
    ]);
    expect(links[0].getAttribute("href")).toBe(
      "https://chat.whatsapp.com/example",
    );
    expect(links[1].getAttribute("href")).toBe("/events/zurich-tuesday-jam");
    expect(text).not.toContain("Unsafe LinkOpen");
  });

  it("shows the community knowledge contact CTA after info cards", () => {
    fixture.componentRef.setInput("communityDataInput", {
      ...communityData,
      infoCards: [
        {
          id: "chat",
          title: { en: "WhatsApp group chat" },
          category: "chat",
          priority: 1,
        },
      ],
    });
    fixture.detectChanges();

    const cta = [
      ...fixture.nativeElement.querySelectorAll('a[href^="/contact"]'),
    ].find((link: HTMLAnchorElement) =>
      link.textContent?.includes("Share community info"),
    ) as HTMLAnchorElement | undefined;

    expect(fixture.nativeElement.textContent).toContain("WhatsApp group chat");
    expect(cta?.textContent).toContain("Share community info");
    expect(cta?.getAttribute("href")).toBe(
      "/contact?topic=general&source=%2Fmap%2Fcommunities%2Fswitzerland&community=Switzerland",
    );
  });

  it("shows the community knowledge contact CTA when there are no info cards", () => {
    fixture.componentRef.setInput("communityDataInput", {
      ...communityData,
      infoCards: [],
    });
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).not.toContain("Local Knowledge");
    expect(fixture.nativeElement.textContent).toContain("Know this community?");
    expect(fixture.nativeElement.textContent).not.toContain(
      "No knowledge cards yet.",
    );
    const cta = [
      ...fixture.nativeElement.querySelectorAll('a[href^="/contact"]'),
    ].find((link: HTMLAnchorElement) =>
      link.textContent?.includes("Share community info"),
    );
    expect(cta).toBeDefined();
  });

  it("opens the community knowledge editor from the empty-state admin CTA", () => {
    isAdmin.set(true);
    fixture.componentRef.setInput("communityDataInput", {
      ...communityData,
      infoCards: [],
    });
    fixture.detectChanges();

    const addButton = [
      ...fixture.nativeElement.querySelectorAll("button"),
    ].find((button: HTMLButtonElement) =>
      button.textContent?.includes("Add community knowledge"),
    ) as HTMLButtonElement | undefined;

    expect(addButton).toBeDefined();
    addButton?.click();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain("Local Knowledge");
    expect(
      fixture.nativeElement.querySelector("app-community-knowledge-editor"),
    ).not.toBeNull();
    expect(fixture.nativeElement.textContent).toContain("No knowledge cards yet.");
  });
});
