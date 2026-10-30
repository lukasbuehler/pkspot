import { afterEach, describe, expect, it, vi } from "vitest";
import { MapPageComponent } from "./map-page.component";

afterEach(() => vi.restoreAllMocks());

describe("map promotable communities", () => {
  // SSR grants consent automatically. Loading the full community list there
  // turned every scraped /map page into a Typesense request (2026-10-29 outage).
  it.each([
    ["server", false],
    ["browser", true],
  ] as const)("on the %s platform loads the list: %s", async (platformId, loads) => {
    const listCommunities = vi.fn().mockResolvedValue([]);
    const page = {
      platformId,
      _promotableCommunitiesRequested: false,
      _consentService: { hasConsent: () => true },
      _searchService: { listCommunities },
      _promotableCommunities: { set: vi.fn() },
      _refreshVisibleCommunitiesFromLoadedList: vi.fn(),
      _focusCommunityFromQueryParam: vi.fn(),
    };

    (
      MapPageComponent.prototype as unknown as {
        loadPromotableCommunitiesAfterConsent(this: unknown): void;
      }
    ).loadPromotableCommunitiesAfterConsent.call(page);
    await Promise.resolve();

    expect(listCommunities).toHaveBeenCalledTimes(loads ? 1 : 0);
  });
});
