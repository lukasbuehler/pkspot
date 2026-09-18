import { TestBed } from "@angular/core/testing";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { MatSnackBar } from "@angular/material/snack-bar";
import { ShareCardService } from "./share-card.service";
import { FunctionsAdapterService } from "./firebase/functions-adapter.service";
import { FeatureTelemetryService } from "./feature-telemetry.service";
import { environment } from "../../environments/environment.default";
const nativeShare = vi.hoisted(() => vi.fn());
const plainShare = vi.hoisted(() => vi.fn());
vi.mock("@capacitor/share", () => ({ Share: { share: plainShare } }));
vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => true, isPluginAvailable: () => true }, registerPlugin: () => ({share:nativeShare}) }));
describe("ShareCardService failure isolation", () => {
  const call = vi.fn(), failure = vi.fn(), outcome = vi.fn();
  const enabled = environment.features.shareCards;
  beforeEach(() => {
    vi.clearAllMocks(); environment.features.shareCards = true;
    nativeShare.mockResolvedValue({}); plainShare.mockResolvedValue({});
    TestBed.configureTestingModule({ providers: [ShareCardService,
      {provide:FunctionsAdapterService,useValue:{callAppChecked:call}},
      {provide:FeatureTelemetryService,useValue:{failure,outcome}},
      {provide:MatSnackBar,useValue:{open:vi.fn()}},
    ] });
  });
  afterEach(() => { environment.features.shareCards = enabled; vi.useRealTimers(); });
  it("still opens the native link share when generation fails, without files", async () => {
    call.mockRejectedValue({code:"unavailable"});
    await TestBed.inject(ShareCardService).share({kind:"spot",id:"spot"},"https://pkspot.app/map/spots/spot","Spot");
    expect(nativeShare).toHaveBeenCalledWith({url:"https://pkspot.app/map/spots/spot",title:"Spot",imageBase64:undefined});
    expect(failure).toHaveBeenCalledWith("share-card","prepare-preview",{code:"unavailable"});
  });
  it("bounds a hung preparation and releases the busy state", async () => {
    vi.useFakeTimers(); call.mockReturnValue(new Promise(() => {}));
    const service=TestBed.inject(ShareCardService);
    const work=service.share({kind:"spot",id:"spot"},"https://pkspot.app/map/spots/spot","Spot");
    expect(service.preparing()).toBe(true);
    await vi.advanceTimersByTimeAsync(8000); await work;
    expect(service.preparing()).toBe(false); expect(nativeShare).toHaveBeenCalledOnce();
    expect(failure).toHaveBeenCalledWith("share-card","prepare-preview",{code:"deadline-exceeded"});
  });
  it("falls back to the standard link share if the custom native bridge fails", async () => {
    call.mockRejectedValue({code:"unavailable"});
    nativeShare.mockRejectedValue(new Error("Bridge unavailable"));
    await TestBed.inject(ShareCardService).share({kind:"spot",id:"spot"},"https://pkspot.app/map/spots/spot","Spot");
    expect(plainShare).toHaveBeenCalledWith({url:"https://pkspot.app/map/spots/spot",title:"Spot"});
  });

});
