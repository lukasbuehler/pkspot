import { ComponentFixture, TestBed } from "@angular/core/testing";
import { MatAutocompleteTrigger } from "@angular/material/autocomplete";
import { By } from "@angular/platform-browser";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SearchService } from "../../services/search.service";
import { MapLinkResolverService } from "../../services/map-link-resolver.service";
import { MatSnackBar } from "@angular/material/snack-bar";
import { SearchFieldComponent } from "./search-field.component";

describe("SearchFieldComponent", () => {
  let fixture: ComponentFixture<SearchFieldComponent>;
  const mapLinks = {
    isSupportedUrl: vi.fn(),
    resolve: vi.fn(),
  };
  const snackbar = { open: vi.fn() };

  beforeEach(() => {
    mapLinks.isSupportedUrl.mockReset();
    mapLinks.resolve.mockReset();
    snackbar.open.mockReset();
    TestBed.configureTestingModule({
      imports: [SearchFieldComponent],
      providers: [
        {
          provide: SearchService,
          useValue: {
            searchCommunities: vi.fn().mockResolvedValue([]),
            searchEvents: vi.fn().mockResolvedValue([]),
            searchPlaces: vi.fn().mockResolvedValue([]),
            searchSpots: vi.fn().mockResolvedValue({ hits: [], found: 0 }),
          },
        },
        { provide: MapLinkResolverService, useValue: mapLinks },
        { provide: MatSnackBar, useValue: snackbar },
      ],
    });

    fixture = TestBed.createComponent(SearchFieldComponent);
  });

  it("shows the default search affordance when no map context is active", () => {
    fixture.detectChanges();

    const input = fixture.debugElement.query(By.css("input"))
      .nativeElement as HTMLInputElement;

    expect(input.placeholder).toBe("Find spots and more");
    expect(
      fixture.debugElement.query(By.css("mat-icon")).nativeElement.textContent,
    ).toContain("search");
    expect(fixture.debugElement.query(By.css("button"))).toBeNull();
  });

  it("shows active map context and emits when clearing it", () => {
    const clears: void[] = [];
    fixture.componentInstance.contextClear.subscribe((value) =>
      clears.push(value),
    );
    fixture.componentRef.setInput("contextLabel", "Spots For Parkour");

    fixture.detectChanges();
    const input = fixture.debugElement.query(By.css("input"))
      .nativeElement as HTMLInputElement;
    const button = fixture.debugElement.query(By.css("button"));

    expect(input.placeholder).toBe("Spots For Parkour");
    expect(button.nativeElement.getAttribute("aria-label")).toBe(
      "Clear search filters",
    );

    button.nativeElement.click();

    expect(clears.length).toBe(1);
  });

  it("renders loaded empty search results without spot hits", () => {
    fixture.detectChanges();

    const emptyResults: Parameters<
      typeof fixture.componentInstance.spotAndPlaceSearchResults$.next
    >[0] = {
      query: "zurich",
      isShortQuery: false,
      typesenseLoading: false,
      communitiesLoaded: true,
      communities: [],
      eventsLoaded: true,
      events: [],
      placesLoaded: true,
      displayedPlace: null,
      displayedPlacePlacement: "top",
      previewCommunity: null,
      spotsLoaded: true,
      spots: null,
    };

    fixture.componentInstance.spotAndPlaceSearchResults$.next(emptyResults);
    fixture.detectChanges();
    const trigger = fixture.debugElement
      .query(By.directive(MatAutocompleteTrigger))
      .injector.get(MatAutocompleteTrigger);

    trigger.openPanel();
    fixture.detectChanges();

    expect(document.body.textContent).toContain("No results found");
  });

  it("opens a supported Maps link directly from paste without searching the URL", async () => {
    const mapLink = {
      provider: "google" as const,
      format: "direct" as const,
      location: { lat: 47.3769, lng: 8.5417 },
    };
    mapLinks.isSupportedUrl.mockReturnValue(true);
    mapLinks.resolve.mockResolvedValue(mapLink);
    const selected = vi.fn();
    fixture.componentInstance.spotSelected.subscribe(selected);
    const preventDefault = vi.fn();

    fixture.componentInstance.handlePaste({
      clipboardData: {
        getData: () => "https://www.google.com/maps/place/Test/@47.3769,8.5417,17z",
      },
      preventDefault,
    } as unknown as ClipboardEvent);
    await fixture.whenStable();

    expect(preventDefault).toHaveBeenCalledOnce();
    expect(selected).toHaveBeenCalledWith({
      type: "map-link",
      id: "google",
      mapLink,
    });
    expect(fixture.componentInstance.spotSearchControl.value).toBe("");
  });
});
