import { signal } from "@angular/core";
import { of } from "rxjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SpotFilterMode } from "../spot-map/spot-filter-config";
import { MapPageComponent } from "./map-page.component";

type SearchResult = { hits: unknown[]; found: number };

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const flush = () => new Promise<void>((resolve) => setTimeout(resolve));
const bounds = { contains: () => true, toJSON: () => ({}) };

/** The real filter methods on the page's prototype, over stubbed collaborators. */
function createPage(options: { withBounds?: boolean } = {}) {
  const spotMap = {
    bounds: options.withBounds === false ? undefined : bounds,
    spotFilterMode: signal(SpotFilterMode.None),
    setFilteredSpots: vi.fn(),
    visibleSpots: signal([{ id: "unfiltered-spot" }]),
  };
  const searchService = {
    searchSpotsInBoundsWithFilter: vi.fn<() => Promise<SearchResult>>(),
    searchSpotsWithCustomFilter: vi.fn<() => Promise<SearchResult>>(),
    searchSpotPreviewsByIds: vi.fn(),
    getSpotPreviewFromHit: (hit: unknown) => hit,
  };
  const page = Object.assign(Object.create(MapPageComponent.prototype), {
    spotMap,
    _structuredDataService: { removeStructuredData: vi.fn() },
    _searchService: searchService,
    _analytics: { trackEvent: vi.fn() },
    _snackbar: { open: vi.fn() },
    _recordMapProfile: vi.fn(),
    _viewport: signal(null),
    selectedFilter: signal(""),
    selectedEventFilter: signal(""),
    selectedSpot: signal(null),
    customFilterParams: signal(null),
    mapObjectMode: signal("spots"),
    mapObjectCounts: signal({ spots: 7, events: 0, communities: 0 }),
    noSpotsForFilter: signal(false),
    isSignedIn: signal(true),
    savedSpotIds: signal<string[]>([]),
    visitedSpotIds: signal<string[]>([]),
    _baseMapObjectCounts: signal({ spots: 7, events: 0, communities: 0 }),
    _denseMapPerformanceMode: signal(false),
    _mapObjectsSearched: signal(false),
    _mapSpotsArrived: signal(false),
    _filteredSearchSettled: signal(false),
    _filteredSearchVersion: 0,
    _activeFilter: "",
    _pendingFilter: null,
    _privateDataLoaded: true,
    _spotLoadRequestVersion: 0,
    _savedSpotPreviewCache: new Map(),
    _visitedSpotPreviewCache: new Map(),
    _savedPreviewLoadPromise: null,
    _visitedPreviewLoadPromise: null,
  });
  const ready = (): boolean => page._isMapSpotListReady();
  return { page, spotMap, searchService, ready };
}

beforeEach(() => {
  vi.spyOn(console, "debug").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("map Spot list while a filtered search is pending", () => {
  it("stays pending until a preset search succeeds, then publishes it", async () => {
    const { page, spotMap, searchService, ready } = createPage();
    const search = deferred<SearchResult>();
    searchService.searchSpotsInBoundsWithFilter.mockReturnValue(search.promise);

    page.filterChipChanged("dry");
    expect(ready()).toBe(false);

    search.resolve({ hits: [{ id: "dry-spot" }], found: 12 });
    await flush();

    expect(ready()).toBe(true);
    expect(spotMap.setFilteredSpots).toHaveBeenCalledWith([{ id: "dry-spot" }]);
    expect(page.mapObjectCounts().spots).toBe(12);
    expect(page.noSpotsForFilter()).toBe(false);
  });

  it("settles when a search fails, without claiming that no Spots match", async () => {
    const { page, spotMap, searchService, ready } = createPage();
    const empty = deferred<SearchResult>();
    searchService.searchSpotsInBoundsWithFilter.mockReturnValue(empty.promise);
    page.filterChipChanged("dry");
    empty.resolve({ hits: [], found: 0 });
    await flush();
    expect(page.noSpotsForFilter()).toBe(true);

    const failure = deferred<SearchResult>();
    searchService.searchSpotsInBoundsWithFilter.mockReturnValue(failure.promise);
    page.onFilterBoundsChange(bounds);
    expect(ready()).toBe(false);

    failure.reject(new Error("Typesense unavailable"));
    await flush();

    expect(ready()).toBe(true);
    expect(page.noSpotsForFilter()).toBe(false);
    expect(spotMap.setFilteredSpots).toHaveBeenCalledOnce();
  });

  it("settles when a search throws before returning a promise", async () => {
    const { page, searchService, ready } = createPage();
    searchService.searchSpotsInBoundsWithFilter.mockImplementation(() => {
      throw new Error("bad bounds");
    });

    page.filterChipChanged("dry");
    await flush();

    expect(ready()).toBe(true);
  });

  it("ignores a stale response while a newer search is pending", async () => {
    const { page, spotMap, searchService, ready } = createPage();
    const older = deferred<SearchResult>();
    const newer = deferred<SearchResult>();
    searchService.searchSpotsInBoundsWithFilter
      .mockReturnValueOnce(older.promise)
      .mockReturnValueOnce(newer.promise);

    page.filterChipChanged("dry");
    page.filterChipChanged("indoor");

    older.resolve({ hits: [{ id: "older" }], found: 1 });
    await flush();
    expect(ready()).toBe(false);
    expect(spotMap.setFilteredSpots).not.toHaveBeenCalled();

    newer.resolve({ hits: [{ id: "newer" }], found: 1 });
    await flush();
    expect(ready()).toBe(true);
    expect(spotMap.setFilteredSpots).toHaveBeenCalledExactlyOnceWith([
      { id: "newer" },
    ]);
  });

  it("ignores a stale failure while a newer search is pending", async () => {
    const { page, searchService, ready } = createPage();
    const older = deferred<SearchResult>();
    const newer = deferred<SearchResult>();
    searchService.searchSpotsInBoundsWithFilter
      .mockReturnValueOnce(older.promise)
      .mockReturnValueOnce(newer.promise);

    page.filterChipChanged("dry");
    page.onFilterBoundsChange(bounds);

    older.reject(new Error("aborted"));
    await flush();
    expect(ready()).toBe(false);

    newer.resolve({ hits: [], found: 0 });
    await flush();
    expect(ready()).toBe(true);
  });

  it("ignores a stale response that outlives its newer search", async () => {
    const { page, spotMap, searchService, ready } = createPage();
    const older = deferred<SearchResult>();
    searchService.searchSpotsInBoundsWithFilter
      .mockReturnValueOnce(older.promise)
      .mockResolvedValueOnce({ hits: [{ id: "newer" }], found: 1 });

    page.filterChipChanged("dry");
    page.onFilterBoundsChange(bounds);
    await flush();
    expect(ready()).toBe(true);

    older.resolve({ hits: [{ id: "older" }], found: 1 });
    await flush();
    expect(spotMap.setFilteredSpots).toHaveBeenCalledExactlyOnceWith([
      { id: "newer" },
    ]);
  });

  it("goes back to pending for the re-search after the map moves", async () => {
    const { page, searchService, ready } = createPage();
    searchService.searchSpotsInBoundsWithFilter.mockResolvedValueOnce({
      hits: [],
      found: 0,
    });
    page.filterChipChanged("dry");
    await flush();
    expect(ready()).toBe(true);

    const search = deferred<SearchResult>();
    searchService.searchSpotsInBoundsWithFilter.mockReturnValue(search.promise);
    page.onFilterBoundsChange(bounds);
    expect(ready()).toBe(false);

    search.resolve({ hits: [], found: 0 });
    await flush();
    expect(ready()).toBe(true);
  });

  it("stays pending while a filter waits for the map's bounds", async () => {
    const { page, spotMap, searchService, ready } = createPage({
      withBounds: false,
    });

    page.filterChipChanged("dry");
    await flush();
    expect(ready()).toBe(false);
    expect(spotMap.spotFilterMode()).toBe(SpotFilterMode.Dry);
    expect(searchService.searchSpotsInBoundsWithFilter).not.toHaveBeenCalled();

    searchService.searchSpotsInBoundsWithFilter.mockResolvedValue({
      hits: [],
      found: 0,
    });
    page.onFilterBoundsChange(bounds);
    await flush();
    expect(ready()).toBe(true);
  });

  it("forgets the previous filter's no-matches state when switching", async () => {
    const { page, searchService } = createPage();
    searchService.searchSpotsInBoundsWithFilter.mockResolvedValueOnce({
      hits: [],
      found: 0,
    });
    page.filterChipChanged("dry");
    await flush();
    expect(page.noSpotsForFilter()).toBe(true);

    searchService.searchSpotsInBoundsWithFilter.mockReturnValue(
      deferred<SearchResult>().promise,
    );
    page.filterChipChanged("indoor");
    expect(page.noSpotsForFilter()).toBe(false);
  });

  it("settles at once for a filter that has no search", () => {
    const { page, searchService, ready } = createPage();

    page.filterChipChanged("not-a-real-filter");

    expect(searchService.searchSpotsInBoundsWithFilter).not.toHaveBeenCalled();
    expect(ready()).toBe(true);
  });

  describe("custom filters", () => {
    const params = { types: ["parkour gym"] };

    it("settles a bounds change that has no custom params to search", () => {
      const { page, ready } = createPage();
      page._activeFilter = "custom";
      page.selectedFilter.set("custom");

      page.onFilterBoundsChange(bounds);

      expect(ready()).toBe(true);
    });

    it("tracks the re-search on a bounds change", async () => {
      const { page, searchService, ready } = createPage();
      page._activeFilter = "custom";
      page.selectedFilter.set("custom");
      page.customFilterParams.set(params);
      const search = deferred<SearchResult>();
      searchService.searchSpotsWithCustomFilter.mockReturnValue(search.promise);

      page.onFilterBoundsChange(bounds);
      expect(ready()).toBe(false);

      search.resolve({ hits: [], found: 0 });
      await flush();
      expect(ready()).toBe(true);
    });

    it("tracks the search started from the filter dialog", async () => {
      const { page, spotMap, searchService, ready } = createPage();
      const search = deferred<SearchResult>();
      searchService.searchSpotsWithCustomFilter.mockReturnValue(search.promise);
      Object.assign(page, {
        closeCommunityPanel: vi.fn(),
        _getEditableFilterParams: () => ({
          params: null,
          seededFromQuickFilter: false,
        }),
        _hasFilters: () => true,
        _areFilterParamsEqual: () => false,
        _getMatchingPresetFilter: () => null,
        _countCustomFilterCriteria: () => 1,
        _cloneCustomFilterParams: (value: unknown) => value,
        _dialog: {
          open: () => ({ afterClosed: () => of(params) }),
        },
      });

      page._showCustomFilterDialog(class {});
      expect(ready()).toBe(false);
      expect(spotMap.spotFilterMode()).toBe(SpotFilterMode.Custom);

      search.resolve({ hits: [{ id: "custom-spot" }], found: 1 });
      await flush();
      expect(ready()).toBe(true);
      expect(spotMap.setFilteredSpots).toHaveBeenCalledWith([
        { id: "custom-spot" },
      ]);
    });

    it("waits for bounds when a custom filter is applied once the map is ready", async () => {
      const { page, spotMap, searchService, ready } = createPage({
        withBounds: false,
      });
      page.selectedFilter.set("custom");
      page.customFilterParams.set(params);

      page.filterChipChanged("custom");
      expect(ready()).toBe(false);
      expect(spotMap.spotFilterMode()).toBe(SpotFilterMode.Custom);

      searchService.searchSpotsWithCustomFilter.mockResolvedValue({
        hits: [],
        found: 0,
      });
      page.onFilterBoundsChange(bounds);
      await flush();
      expect(ready()).toBe(true);
    });
  });

  describe.each([
    ["saved", "savedSpotIds", "_applySavedFilter"],
    ["visited", "visitedSpotIds", "_applyVisitedFilter"],
  ] as const)("the %s filter", (filter, idsSignal, applyMethod) => {
    const preview = { id: "spot-1", location_raw: { lat: 1, lng: 2 } };

    it("tracks its preview lookup", async () => {
      const { page, spotMap, searchService, ready } = createPage();
      page[idsSignal].set(["spot-1"]);
      const lookup = deferred<(typeof preview)[]>();
      searchService.searchSpotPreviewsByIds.mockReturnValue(lookup.promise);

      page.filterChipChanged(filter);
      expect(ready()).toBe(false);

      lookup.resolve([preview]);
      await flush();
      expect(ready()).toBe(true);
      expect(spotMap.setFilteredSpots).toHaveBeenCalledWith([preview]);
    });

    it("settles when its preview lookup fails", async () => {
      const { page, searchService, ready } = createPage();
      page[idsSignal].set(["spot-1"]);
      searchService.searchSpotPreviewsByIds.mockRejectedValue(new Error("down"));

      page.filterChipChanged(filter);
      await flush();

      expect(ready()).toBe(true);
    });

    it("settles at once for an empty list", async () => {
      const { page, searchService, ready } = createPage();

      page.filterChipChanged(filter);
      await flush();

      expect(searchService.searchSpotPreviewsByIds).not.toHaveBeenCalled();
      expect(ready()).toBe(true);
    });

    it("stays pending until the user's lists have loaded", async () => {
      const { page, ready } = createPage();
      page._privateDataLoaded = false;

      page.filterChipChanged(filter);
      await flush();
      expect(ready()).toBe(false);

      page._privateDataLoaded = true;
      page._reapplyPrivateListFilter();
      await flush();
      expect(ready()).toBe(true);
    });

    it("ignores an older lookup once the filter has been cleared", async () => {
      const { page, spotMap, searchService } = createPage();
      page[idsSignal].set(["spot-1"]);
      const lookup = deferred<(typeof preview)[]>();
      searchService.searchSpotPreviewsByIds.mockReturnValue(lookup.promise);

      const applied = page[applyMethod](bounds);
      page.filterChipChanged("");
      lookup.resolve([preview]);
      await applied;

      expect(spotMap.setFilteredSpots).not.toHaveBeenCalled();
    });
  });

  it("settles a private list filter when its data fails to load", async () => {
    const { page, ready } = createPage();
    const subject = deferred<never>();
    Object.assign(page, {
      _privateDataUserId: null,
      _usersService: {
        getPrivateData: () => ({
          subscribe: (
            _next: unknown,
            error: (reason: unknown) => void,
          ) => {
            void subject.promise.catch(error);
            return { unsubscribe: vi.fn() };
          },
        }),
      },
    });

    page._syncPrivateDataSubscription("user-1");
    page.filterChipChanged("saved");
    await flush();
    expect(ready()).toBe(false);

    subject.reject(new Error("permission denied"));
    await flush();
    expect(ready()).toBe(true);
  });

  describe("clearing a filter", () => {
    it("falls back to the unfiltered list's readiness", async () => {
      const { page, searchService, ready } = createPage();
      searchService.searchSpotsInBoundsWithFilter.mockReturnValue(
        deferred<SearchResult>().promise,
      );
      page.filterChipChanged("dry");
      expect(ready()).toBe(false);

      page._mapObjectsSearched.set(true);
      page._mapSpotsArrived.set(true);
      expect(ready()).toBe(false);

      page.filterChipChanged("");
      expect(ready()).toBe(true);
    });

    it("drops a response that arrives after the filter was cleared", async () => {
      const { page, spotMap, searchService } = createPage();
      const search = deferred<SearchResult>();
      searchService.searchSpotsInBoundsWithFilter.mockReturnValue(search.promise);

      page.filterChipChanged("dry");
      page.filterChipChanged("");
      search.resolve({ hits: [{ id: "late" }], found: 1 });
      await flush();

      expect(spotMap.setFilteredSpots).not.toHaveBeenCalled();
      expect(page.mapObjectCounts().spots).toBe(7);
    });

    it("is pending again when another filter follows", async () => {
      const { page, searchService, ready } = createPage();
      searchService.searchSpotsInBoundsWithFilter.mockResolvedValueOnce({
        hits: [],
        found: 0,
      });
      page.filterChipChanged("dry");
      await flush();
      page.filterChipChanged("");

      searchService.searchSpotsInBoundsWithFilter.mockReturnValue(
        deferred<SearchResult>().promise,
      );
      page.filterChipChanged("indoor");
      expect(ready()).toBe(false);
    });
  });

  it("never holds the list back in dense map performance mode", () => {
    const { page, searchService, ready } = createPage();
    searchService.searchSpotsInBoundsWithFilter.mockReturnValue(
      deferred<SearchResult>().promise,
    );
    page._denseMapPerformanceMode.set(true);

    page.filterChipChanged("dry");

    expect(ready()).toBe(true);
  });
});
