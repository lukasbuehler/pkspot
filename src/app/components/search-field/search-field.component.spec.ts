import { ComponentFixture, TestBed } from "@angular/core/testing";
import { MatAutocompleteTrigger } from "@angular/material/autocomplete";
import { By } from "@angular/platform-browser";
import { readFileSync } from "node:fs";
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
    expect(
      fixture.nativeElement.querySelector(
        ".mat-mdc-form-field-icon-suffix .search-field-status-suffix",
      ),
    ).not.toBeNull();
    expect(fixture.debugElement.query(By.css("button"))).toBeNull();
  });

  it("keeps the search status suffix inset from the field edge", () => {
    const styles = readFileSync(
      "src/app/components/search-field/search-field.component.scss",
      "utf8",
    );

    expect(styles).toMatch(
      /\.search-field-status-suffix\s*\{[^}]*padding-inline-end:\s*16px;/su,
    );
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
    await vi.waitFor(() => expect(selected).toHaveBeenCalledOnce());

    expect(preventDefault).toHaveBeenCalledOnce();
    expect(selected).toHaveBeenCalledWith({
      type: "map-link",
      id: "google",
      mapLink,
    });
    expect(fixture.componentInstance.spotSearchControl.value).toBe("");
  });

  it("shows progress while a pasted Maps link is resolving", async () => {
    let resolveLink!: (value: {
      provider: "google";
      format: "short";
      query: string;
    }) => void;
    mapLinks.isSupportedUrl.mockReturnValue(true);
    mapLinks.resolve.mockReturnValue(
      new Promise((resolve) => {
        resolveLink = resolve;
      }),
    );
    await fixture.whenStable();

    fixture.componentInstance.handlePaste({
      clipboardData: {
        getData: () => "https://maps.app.goo.gl/v53ih4b5vdjweTB57",
      },
      preventDefault: vi.fn(),
    } as unknown as ClipboardEvent);
    await fixture.whenStable();

    const input = fixture.debugElement.query(By.css("input"))
      .nativeElement as HTMLInputElement;
    expect(input.value).toBe("https://maps.app.goo.gl/v53ih4b5vdjweTB57");
    expect(
      fixture.nativeElement
        .querySelector("mat-progress-spinner")
        .getAttribute("aria-label"),
    ).toBe("Opening Maps link...");
    expect(
      fixture.nativeElement.querySelector(
        ".mat-mdc-form-field-icon-suffix .search-field-status-suffix mat-progress-spinner",
      ),
    ).not.toBeNull();
    expect(document.body.textContent).toContain("Opening Maps link...");

    resolveLink({
      provider: "google",
      format: "short",
      query: "Spital Lachen AG",
    });
    await vi.waitFor(() => expect(input.value).toBe(""));

    expect(fixture.nativeElement.textContent).not.toContain(
      "Opening Maps link...",
    );
  });

  it("discards a slow Maps-link result after a newer paste resolves", async () => {
    let resolveFirst!: (value: {
      provider: "google";
      format: "direct";
      query: string;
    }) => void;
    mapLinks.isSupportedUrl.mockReturnValue(true);
    mapLinks.resolve
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveFirst = resolve;
        }),
      )
      .mockResolvedValueOnce({
        provider: "apple",
        format: "direct",
        query: "New selection",
      });
    const selected = vi.fn();
    fixture.componentInstance.spotSelected.subscribe(selected);
    const paste = (value: string) =>
      fixture.componentInstance.handlePaste({
        clipboardData: { getData: () => value },
        preventDefault: vi.fn(),
      } as unknown as ClipboardEvent);

    paste("https://www.google.com/maps/place/Old");
    paste("https://maps.apple.com/?q=New");
    await vi.waitFor(() => expect(selected).toHaveBeenCalledOnce());

    resolveFirst({
      provider: "google",
      format: "direct",
      query: "Old selection",
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(selected).toHaveBeenCalledOnce();
    expect(selected.mock.calls[0][0].mapLink.query).toBe("New selection");
  });

  it("discards a pending Maps-link result after the user types", async () => {
    let resolveLink!: (value: {
      provider: "google";
      format: "direct";
      query: string;
    }) => void;
    mapLinks.isSupportedUrl.mockReturnValue(true);
    mapLinks.resolve.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveLink = resolve;
      }),
    );
    const selected = vi.fn();
    fixture.componentInstance.spotSelected.subscribe(selected);

    fixture.componentInstance.handlePaste({
      clipboardData: { getData: () => "https://maps.app.goo.gl/Old" },
      preventDefault: vi.fn(),
    } as unknown as ClipboardEvent);
    fixture.componentInstance.handleSearchInput();
    resolveLink({
      provider: "google",
      format: "direct",
      query: "Old selection",
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(selected).not.toHaveBeenCalled();
  });

  it("shows an error without selecting when Maps-link resolution fails", async () => {
    mapLinks.isSupportedUrl.mockReturnValue(true);
    mapLinks.resolve.mockRejectedValueOnce(new Error("resolver unavailable"));
    const selected = vi.fn();
    fixture.componentInstance.spotSelected.subscribe(selected);

    fixture.componentInstance.handlePaste({
      clipboardData: { getData: () => "https://maps.app.goo.gl/Broken" },
      preventDefault: vi.fn(),
    } as unknown as ClipboardEvent);
    await vi.waitFor(() => expect(snackbar.open).toHaveBeenCalledOnce());

    expect(selected).not.toHaveBeenCalled();
  });
});
