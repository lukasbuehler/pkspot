import { AnalyticsService } from "../services/analytics.service";
import { MediaType } from "../../db/models/Interfaces";
import { TestBed } from "@angular/core/testing";
import { NavigationStart, Router } from "@angular/router";
import { MatDialog } from "@angular/material/dialog";
import { Subject } from "rxjs";
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { MediaUploadStatusService } from "../services/firebase/firestore/media-upload-status.service";
import { REVIEW_HISTORY_KEY, readReviewHistory, reviewEligible } from "./review-policy";
const native = vi.hoisted(() => ({ prepare: vi.fn(), request: vi.fn(), enabled: true }));
vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: () => native.enabled }, registerPlugin: () => native,
}));
import { StoreReviewService } from "./store-review.service";

describe("quiet native reviews", () => {
  const now = new Date("2026-09-10T12:00:00Z").getTime();
  const trackEvent = vi.fn();
  let ready = true;
  let service: StoreReviewService;
  const eligible = () => ({ firstUsed: now - 15 * 86400000, days: ["2026-08-25", "2026-09-01", "2026-09-10"], actions: 3 });
  beforeEach(() => {
    trackEvent.mockReset();
    vi.useFakeTimers(); vi.setSystemTime(now); native.enabled = true;
    native.prepare.mockReset().mockResolvedValue(undefined);
    native.request.mockReset().mockResolvedValue(undefined); ready = true;
    localStorage.setItem(REVIEW_HISTORY_KEY, JSON.stringify(eligible()));
    TestBed.configureTestingModule({ providers: [
      { provide: AnalyticsService, useValue: { trackEvent } },
      { provide: Router, useValue: { events: new Subject() } },
      { provide: MatDialog, useValue: { openDialogs: [], afterOpened: new Subject() } },
      { provide: MediaUploadStatusService, useValue: { localUploads: () => [] } },
    ] });
  });
  function start() {
    service = TestBed.inject(StoreReviewService);
    service.registerCompletionSurface(() => ready);
    service.offerAfterCompletion();
  }
  afterEach(() => { TestBed.resetTestingModule(); vi.useRealTimers(); localStorage.clear(); });
  it("waits five seconds and persists cooldown before requesting", async () => {
    start(); await vi.advanceTimersByTimeAsync(4999); expect(native.request).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1); expect(native.request).toHaveBeenCalledOnce();
    expect(trackEvent.mock.calls.map(call => call[0])).toEqual([
      "store_review_request_attempted", "store_review_request_returned",
    ]);
    expect(JSON.parse(localStorage.getItem(REVIEW_HISTORY_KEY)!).lastAttempt).toBe(now + 5000);
    service.offerAfterCompletion(); await vi.advanceTimersByTimeAsync(6000);
    expect(native.request).toHaveBeenCalledOnce();
  });
  it("cancels rather than postpones when scrolling", async () => {
    start(); document.dispatchEvent(new Event("scroll"));
    await vi.advanceTimersByTimeAsync(60000); expect(native.prepare).not.toHaveBeenCalled();
  });
  it("cancels interaction during asynchronous native preparation", async () => {
    let resolve!: () => void;
    native.prepare.mockImplementation(() => new Promise<void>(r => { resolve = r; }));
    start(); await vi.advanceTimersByTimeAsync(5000);
    document.dispatchEvent(new Event("pointerdown")); resolve();
    await vi.advanceTimersByTimeAsync(1); expect(native.request).not.toHaveBeenCalled();
  });
  it("skips unsuccessful or unfinished overview states", async () => {
    start(); ready = false; await vi.advanceTimersByTimeAsync(5000);
    expect(native.prepare).not.toHaveBeenCalled();
  });
  it("cancels navigation and background transitions", async () => {
    start();
    (TestBed.inject(Router).events as Subject<unknown>).next(new NavigationStart(1, "/map"));
    await vi.advanceTimersByTimeAsync(5000);
    expect(native.prepare).not.toHaveBeenCalled();
    service.offerAfterCompletion();
    document.dispatchEvent(new Event("visibilitychange"));
    await vi.advanceTimersByTimeAsync(5000);
    expect(native.prepare).not.toHaveBeenCalled();
  });
  it("skips overlays and ongoing uploads", async () => {
    start();
    const overlay = document.createElement("div"); overlay.className = "cdk-overlay-pane";
    document.body.append(overlay);
    await vi.advanceTimersByTimeAsync(5000); overlay.remove();
    expect(native.prepare).not.toHaveBeenCalled();
    vi.spyOn(TestBed.inject(MediaUploadStatusService), "localUploads").mockReturnValue([
      { uploadId: "test", targetKind: "spot", type: MediaType.Image, publicUrl: "", previewSrc: "", status: "processing" },
    ]);
    service.offerAfterCompletion(); await vi.advanceTimersByTimeAsync(5000);
    expect(native.prepare).not.toHaveBeenCalled();
  });
  it("fails closed when the cooldown cannot be stored", async () => {
    start(); vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("full"); });
    await vi.advanceTimersByTimeAsync(5000);
    expect(native.request).not.toHaveBeenCalled(); vi.restoreAllMocks();
  });
  it("tracks preparation failures without recording a shown popup", async () => {
    native.prepare.mockRejectedValue(new Error("private native details"));
    start(); await vi.advanceTimersByTimeAsync(5000);
    expect(trackEvent).toHaveBeenCalledExactlyOnceWith("store_review_api_failed", {
      surface: "activity_log", trigger: "activity_saved", stage: "prepare",
    });
    expect(native.request).not.toHaveBeenCalled();
  });
  it("keeps review behavior independent of analytics failures", async () => {
    trackEvent.mockImplementation(() => { throw new Error("unavailable"); });
    start(); await vi.advanceTimersByTimeAsync(5000);
    expect(native.request).toHaveBeenCalledOnce();
  });
  it("never requests on web", async () => {
    native.enabled = false; start(); await vi.advanceTimersByTimeAsync(5000);
    expect(native.prepare).not.toHaveBeenCalled();
  });
  it("requires each independent eligibility condition", () => {
    expect(reviewEligible(eligible(), now)).toBe(true);
    expect(reviewEligible({ ...eligible(), firstUsed: now }, now)).toBe(false);
    expect(reviewEligible({ ...eligible(), days: ["2026-09-10"] }, now)).toBe(false);
    expect(reviewEligible({ ...eligible(), actions: 2 }, now)).toBe(false);
    expect(reviewEligible({ ...eligible(), lastAttempt: now - 86400000 }, now)).toBe(false);
    expect(readReviewHistory('{"actions":99}', now)).toEqual({ firstUsed: now, days: [], actions: 0 });
  });
});
