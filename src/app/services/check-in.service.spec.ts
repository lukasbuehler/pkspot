import { PLATFORM_ID, signal } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { environment } from "../../environments/environment.default";
import { CheckInService } from "./check-in.service";
import { GeolocationService } from "./geolocation.service";
import { LocationAccessService } from "./location-access.service";
import { SearchService } from "./search.service";
import { SessionRecordsService } from "./firebase/firestore/session-records.service";

describe("explicit check-in consent and asynchronous proximity", () => {
  const originalCheckIns = environment.features.checkIns;
  afterEach(() => { environment.features.checkIns = originalCheckIns; });
  const position = {location: {lat: 47.3769, lng: 8.5417}, accuracy: 12};
  const location = signal<typeof position | null>(position);
  const enabled = signal(true);
  const confirm = vi.fn();
  const search = vi.fn();
  const preview = vi.fn();
  let service: CheckInService;
  let finishSearch: (result: {hits: unknown[]}) => void;

  beforeEach(() => {
    environment.features.checkIns = true;
    localStorage.clear();
    location.set(position);
    enabled.set(true);
    preview.mockReset().mockReturnValue({id: "nearby", location_raw: position.location});
    confirm.mockReset().mockResolvedValue({checkInId: "confirmed"});
    search.mockReset().mockImplementation(() => new Promise(resolve => { finishSearch = resolve; }));
    TestBed.configureTestingModule({providers: [
      CheckInService,
      {provide: PLATFORM_ID, useValue: "browser"},
      {provide: GeolocationService, useValue: {currentLocation: location}},
      {provide: LocationAccessService, useValue: {enabled, startWatchingIfEnabled: vi.fn()}},
      {provide: SearchService, useValue: {
        searchSpotsNearLocation: search,
        getSpotPreviewFromHit: preview,
      }},
      {provide: SessionRecordsService, useValue: {confirmCheckIn: confirm}},
    ]});
    service = TestBed.inject(CheckInService);
    TestBed.tick();
  });

  async function resolveNearby() {
    finishSearch({hits: [{}]});
    await Promise.resolve();
    TestBed.tick();
  }

  it("shows nearby Spots without ever creating an automatic check-in", async () => {
    await resolveNearby();
    expect(service.currentProximitySpot()?.id).toBe("nearby");
    expect(confirm).not.toHaveBeenCalled();
    await service.checkIn("nearby");
    expect(confirm).toHaveBeenCalledWith(expect.objectContaining({spotId: "nearby", location: position.location, accuracyMeters: 12}));
    expect(service.currentProximitySpot()).toBeNull();
  });

  it("offers a check-in inside mobile-safe raw bounds even far from the Spot center", async () => {
    preview.mockReturnValue({id: "large-spot", location_raw: {lat: 47.378, lng: 8.5417}, bounds_raw: [
      {lat: 47.376, lng: 8.541}, {lat: 47.378, lng: 8.541},
      {lat: 47.378, lng: 8.543}, {lat: 47.376, lng: 8.543},
    ]});
    await resolveNearby();
    expect(service.currentProximitySpot()?.id).toBe("large-spot");
  });

  it.each(["disabled", "missing", "moved", "inaccurate"])("does not revive an outdated proximity prompt after location becomes %s", async state => {
    if (state === "disabled") enabled.set(false);
    if (state === "missing") location.set(null);
    if (state === "moved") location.set({...position, location: {lat: 48, lng: 9}});
    if (state === "inaccurate") location.set({...position, accuracy: 500});
    TestBed.tick();
    await resolveNearby();
    expect(service.currentProximitySpot()).toBeNull();
    expect(confirm).not.toHaveBeenCalled();
  });

  it.each(["disabled", "missing"])("reports failure if location becomes %s before confirmation", async state => {
    await resolveNearby();
    if (state === "disabled") enabled.set(false);
    else location.set(null);
    await expect(service.checkIn("nearby")).rejects.toThrow();
    expect(confirm).not.toHaveBeenCalled();
    expect(localStorage.getItem("pkspot_checkin_cooldowns") ?? "").not.toContain("nearby");
  });

  it("keeps failed confirmations retryable and only dismisses after success", async () => {
    await resolveNearby();
    confirm.mockRejectedValueOnce(new Error("Network unavailable"));
    await expect(service.checkIn("nearby")).rejects.toThrow("Network unavailable");
    expect(service.currentProximitySpot()?.id).toBe("nearby");
    await service.checkIn("nearby");
    expect(confirm).toHaveBeenCalledTimes(2);
    expect(service.currentProximitySpot()).toBeNull();
  });
});
