import { MatDialog } from "@angular/material/dialog";
import { Dialog } from "@angular/cdk/dialog";
import { TestBed } from "@angular/core/testing";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { MatSnackBar } from "@angular/material/snack-bar";
import { Subject } from "rxjs";
import { ShareCardDialogData } from "../components/share-card-dialog/share-card-dialog.component";
import { ShareCardService } from "./share-card.service";
import { FunctionsAdapterService } from "./firebase/functions-adapter.service";
import { FeatureTelemetryService } from "./feature-telemetry.service";
import { environment } from "../../environments/environment.default";
const nativeShare = vi.hoisted(() => vi.fn());
const plainShare = vi.hoisted(() => vi.fn());
vi.mock("@capacitor/share", () => ({ Share: { share: plainShare } }));
const platform = vi.hoisted(() => ({ native: true }));
vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => platform.native, isPluginAvailable: () => true }, registerPlugin: () => ({share:nativeShare}) }));
describe("ShareCardService failure isolation", () => {
  const call = vi.fn(), failure = vi.fn(), outcome = vi.fn();
  const close = vi.fn(), open = vi.fn(() => ({ close }));
  let closed: () => void;
  const webClose = vi.fn(() => closed());
  const webOpen = vi.fn((_component: unknown, config: { data: ShareCardDialogData }) => {
    const afterClosed = new Subject<void>(); closed = () => afterClosed.next();
    return { close: webClose, afterClosed: () => afterClosed, data: config.data };
  });
  const dialogData = () => webOpen.mock.calls[0][1].data;
  const enabled = environment.features.shareCards;
  beforeEach(() => {
    vi.clearAllMocks(); platform.native = true; environment.features.shareCards = true;
    nativeShare.mockResolvedValue({}); plainShare.mockResolvedValue({});
    TestBed.configureTestingModule({ providers: [ShareCardService,
      {provide:FunctionsAdapterService,useValue:{callAppChecked:call}},
      {provide:FeatureTelemetryService,useValue:{failure,outcome}},
      {provide:Dialog,useValue:{open}},
      {provide:MatDialog,useValue:{open:webOpen}},
      {provide:MatSnackBar,useValue:{open:vi.fn()}},
    ] });
  });
  afterEach(() => { environment.features.shareCards = enabled; vi.useRealTimers(); vi.unstubAllGlobals(); });
  it("still opens the native link share when generation fails, without files", async () => {
    call.mockRejectedValue({code:"unavailable"});
    await TestBed.inject(ShareCardService).share({kind:"spot",id:"spot"},"https://pkspot.app/map/spots/spot","Spot");
    expect(nativeShare).toHaveBeenCalledWith({url:"https://pkspot.app/map/spots/spot",title:"Spot",imageBase64:undefined});
    expect(failure).toHaveBeenCalledWith("share-card","prepare-preview",{code:"unavailable"});
  });
  it("bounds a hung preparation and releases the busy state", async () => {
    vi.useFakeTimers(); call.mockReturnValue(new Promise(() => { /* Intentionally pending to exercise the deadline. */ }));
    const service=TestBed.inject(ShareCardService);
    const work=service.share({kind:"spot",id:"spot"},"https://pkspot.app/map/spots/spot","Spot");
    expect(service.preparing()).toBe(true);
    expect(open).toHaveBeenCalledOnce();
    expect(close).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(8000); await work;
    expect(close).toHaveBeenCalledOnce();
    expect(service.preparing()).toBe(false); expect(nativeShare).toHaveBeenCalledOnce();
    expect(failure).toHaveBeenCalledWith("share-card","prepare-preview",{code:"deadline-exceeded"});
  });
  it("falls back to the standard link share if the custom native bridge fails", async () => {
    call.mockRejectedValue({code:"unavailable"});
    nativeShare.mockRejectedValue(new Error("Bridge unavailable"));
    await TestBed.inject(ShareCardService).share({kind:"spot",id:"spot"},"https://pkspot.app/map/spots/spot","Spot");
    expect(plainShare).toHaveBeenCalledWith({url:"https://pkspot.app/map/spots/spot",title:"Spot"});
  });

  const link = "https://pkspot.app/map/spots/spot";
  const endpoint = `https://europe-west1-${environment.keys.firebaseConfig.projectId}.cloudfunctions.net/shareCardImage?kind=spot&id=spot`;
  it("hands a validated PNG to the native preview bridge and closes preparation", async () => {
    call.mockResolvedValue({imageUrl: endpoint, reused: true});
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ok: true, blob: async () => new Blob(["png-fixture"], {type: "image/png"})}));
    const service = TestBed.inject(ShareCardService);
    await service.share({kind: "spot", id: "spot"}, link, "Spot");
    expect(nativeShare).toHaveBeenCalledWith({url: link, title: "Spot", imageBase64: btoa("png-fixture")});
    expect(close).toHaveBeenCalledOnce();
    expect(service.preparing()).toBe(false);
  });
  it("rejects an unexpected preview host without fetching it", async () => {
    call.mockResolvedValue({imageUrl: "https://attacker.invalid/image.png", reused: false});
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    await TestBed.inject(ShareCardService).share({kind: "spot", id: "spot"}, link, "Spot");
    expect(fetch).not.toHaveBeenCalled();
    expect(nativeShare).toHaveBeenCalledWith({url: link, title: "Spot", imageBase64: undefined});
  });
  it.each(["text/html", "oversize"])("shares only the link when the preview is %s", async type => {
    call.mockResolvedValue({imageUrl: endpoint, reused: false});
    const blob = type === "oversize" ? new Blob([new Uint8Array(3 * 1024 * 1024 + 1)], {type: "image/png"}) : new Blob(["html"], {type});
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ok: true, blob: async () => blob}));
    await TestBed.inject(ShareCardService).share({kind: "spot", id: "spot"}, link, "Spot");
    expect(nativeShare).toHaveBeenCalledWith({url: link, title: "Spot", imageBase64: undefined});
    expect(failure).toHaveBeenCalledWith("share-card", "download-preview", expect.any(Error));
  });
  it("does not start multiple preparations on repeated taps", async () => {
    vi.useFakeTimers(); call.mockReturnValue(new Promise(() => { /* Intentionally pending to exercise the deadline. */ }));
    const service = TestBed.inject(ShareCardService);
    const first = service.share({kind: "spot", id: "spot"}, link, "Spot");
    await service.share({kind: "spot", id: "spot"}, link, "Spot");
    expect(call).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(8000); await first;
    expect(nativeShare).toHaveBeenCalledOnce();
  });
  it("respects cancellation without opening a second share sheet", async () => {
    call.mockRejectedValue({code: "unavailable"});
    nativeShare.mockResolvedValue({cancelled: true});
    await TestBed.inject(ShareCardService).share({kind: "spot", id: "spot"}, link, "Spot");
    expect(plainShare).not.toHaveBeenCalled();
  });

  describe("web result dialog", () => {
    const snack = vi.fn();
    const webShare = vi.fn();
    beforeEach(() => {
      platform.native = false;
      webShare.mockResolvedValue(undefined);
      vi.stubGlobal("navigator", { share: webShare, clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
      TestBed.overrideProvider(MatSnackBar, { useValue: { open: snack } });
    });
    it("shows the card in a dialog that stays open until closed", async () => {
      call.mockResolvedValue({imageUrl: endpoint, reused: false});
      const service = TestBed.inject(ShareCardService);
      await service.share({kind: "spot", id: "spot"}, link, "Spot");
      expect(open).not.toHaveBeenCalled();
      expect(dialogData().state()).toEqual({status: "ready", imageUrl: endpoint});
      expect(service.preparing()).toBe(true);
      expect(outcome).toHaveBeenCalledWith("share-card", "generate", true);
      closed();
      expect(service.preparing()).toBe(false);
      expect(webShare).not.toHaveBeenCalled();
    });
    it("reports a reused card", async () => {
      call.mockResolvedValue({imageUrl: endpoint, reused: true});
      await TestBed.inject(ShareCardService).share({kind: "spot", id: "spot"}, link, "Spot");
      expect(outcome).toHaveBeenCalledWith("share-card", "reuse", true);
    });
    it("shares from the dialog and closes it", async () => {
      call.mockResolvedValue({imageUrl: endpoint, reused: false});
      await TestBed.inject(ShareCardService).share({kind: "spot", id: "spot"}, link, "Spot");
      await dialogData().share();
      expect(webShare).toHaveBeenCalledWith({url: link, title: "Spot"});
      expect(webClose).toHaveBeenCalledOnce();
    });
    it("keeps the dialog open when the web share is dismissed", async () => {
      call.mockResolvedValue({imageUrl: endpoint, reused: false});
      webShare.mockRejectedValue(new DOMException("x", "AbortError"));
      await TestBed.inject(ShareCardService).share({kind: "spot", id: "spot"}, link, "Spot");
      await dialogData().share();
      expect(webClose).not.toHaveBeenCalled();
    });
    it("copies the link with a confirmation", async () => {
      call.mockResolvedValue({imageUrl: endpoint, reused: false});
      await TestBed.inject(ShareCardService).share({kind: "spot", id: "spot"}, link, "Spot");
      await dialogData().copy();
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(link);
      expect(snack).toHaveBeenCalledWith("Link copied.", undefined, {duration: 3000});
    });
    it("shows the title-only fallback when preparation fails", async () => {
      call.mockRejectedValue({code: "unavailable"});
      await TestBed.inject(ShareCardService).share({kind: "spot", id: "spot"}, link, "Spot");
      expect(dialogData().state()).toEqual({status: "fallback"});
      expect(failure).toHaveBeenCalledWith("share-card", "prepare-preview", {code: "unavailable"});
      await dialogData().share();
      expect(webShare).toHaveBeenCalledOnce();
    });
    it("does not reveal a result when closed while preparing", async () => {
      vi.useFakeTimers(); call.mockReturnValue(new Promise(() => { /* pending */ }));
      const service = TestBed.inject(ShareCardService);
      const work = service.share({kind: "spot", id: "spot"}, link, "Spot");
      closed();
      expect(service.preparing()).toBe(false);
      await vi.advanceTimersByTimeAsync(8000); await work;
      expect(dialogData().state()).toEqual({status: "preparing"});
      expect(webShare).not.toHaveBeenCalled();
    });
    it("shares directly without a dialog when share cards are disabled", async () => {
      environment.features.shareCards = false;
      await TestBed.inject(ShareCardService).share({kind: "spot", id: "spot"}, link, "Spot");
      expect(webOpen).not.toHaveBeenCalled();
      expect(webShare).toHaveBeenCalledWith({url: link, title: "Spot"});
    });
  });

});
