import { signal } from "@angular/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SpotLoadError } from "../../../db/models/SpotLoadError";
import { MapPageComponent } from "./map-page.component";

afterEach(() => vi.restoreAllMocks());

describe("map route Spot failures", () => {
  it.each([
    [new SpotLoadError("missing-spot", "not_found"), 404, false],
    [new SpotLoadError("missing-spot", "missing_location"), 503, false],
    [new Error("Firestore unavailable"), 500, true],
  ] as const)("handles %s without an unhandled route rejection", async (error, status, logsError) => {
    const serverResponse: ResponseInit = {};
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "debug").mockImplementation(() => {});
    const page = {
      serverResponse,
      _spotLoadRequestVersion: 0,
      _spotPreviewCache: new Map(),
      pendingSpotPreview: signal<unknown>(null),
      selectedChallenge: () => null,
      selectedSpotIdOrSlug: () => null,
      showAllChallenges: signal(false),
      showSpotEditHistory: signal(false),
      _openPendingSpotPanel: vi.fn(),
      _getSpotIdFromSlugOrId: vi.fn().mockResolvedValue("missing-spot"),
      _spotsService: { getSpotById: vi.fn().mockRejectedValue(error) },
      loadSpotById: MapPageComponent.prototype.loadSpotById,
    };

    await expect(MapPageComponent.prototype._handleURLParamsChange.call(
      page as unknown as MapPageComponent, "missing-spot", false, null, false,
    )).resolves.toBeUndefined();

    expect(serverResponse.status).toBe(status);
    expect(page._spotsService.getSpotById).toHaveBeenCalledOnce();
    expect(page.pendingSpotPreview()).toBeNull();
    expect(errorLog.mock.calls.length > 0).toBe(logsError);
  });
});
