const native = vi.hoisted(() => ({pending: vi.fn(), acknowledge: vi.fn(), addListener: vi.fn()}));
vi.mock("@capacitor/core", () => ({
  Capacitor: {isNativePlatform: () => true, getPlatform: () => "ios"},
  registerPlugin: () => native,
}));
vi.mock("@capacitor/app", () => ({App: {addListener: vi.fn()}}));
import {TestBed} from "@angular/core/testing";
import {Router} from "@angular/router";
import {MatSnackBar} from "@angular/material/snack-bar";
import {MapLinkResolverService, type MapLinkResolution} from "./map-link-resolver.service";
import {NativeMapShareService} from "./native-map-share.service";

describe("NativeMapShareService", () => {
  const resolver = {resolve: vi.fn()};
  const router = {navigate: vi.fn()};
  const snackbar = {open: vi.fn()};
  let service: NativeMapShareService;
  beforeEach(() => {
    vi.resetAllMocks();
    router.navigate.mockResolvedValue(true);
    native.pending.mockResolvedValue({links: []});
    native.acknowledge.mockResolvedValue(undefined);
    TestBed.configureTestingModule({providers: [
      {provide: MapLinkResolverService, useValue: resolver},
      {provide: Router, useValue: router}, {provide: MatSnackBar, useValue: snackbar},
    ]});
    service = TestBed.inject(NativeMapShareService);
  });
  it("retains a resolved location until the map is ready to consume it", async () => {
    const result: MapLinkResolution = {provider: "google", format: "short", location: {lat: 47, lng: 8}};
    resolver.resolve.mockResolvedValue(result);
    await service.receive("Maps link");
    expect(router.navigate).toHaveBeenCalledWith(["/map"]);
    expect(service.pending()).toEqual(result);
    service.consume();
    expect(service.pending()).toBeNull();
  });
  it("ignores an older slow share when a newer share arrives", async () => {
    let finish!: (result: MapLinkResolution) => void;
    resolver.resolve.mockReturnValueOnce(new Promise<MapLinkResolution>(resolve => finish = resolve));
    const first = service.receive("old");
    const latest: MapLinkResolution = {provider: "apple", format: "direct", query: "Latest"};
    resolver.resolve.mockResolvedValueOnce(latest);
    await service.receive("new");
    finish({provider: "google", format: "direct", query: "Old"});
    await first;
    expect(service.pending()).toEqual(latest);
    expect(router.navigate).toHaveBeenCalledTimes(1);
  });
  it("shows a recoverable error without navigating for an unsupported share", async () => {
    resolver.resolve.mockRejectedValue(new Error("unsupported"));
    await service.receive("plain text");
    expect(snackbar.open).toHaveBeenCalled();
    expect(router.navigate).not.toHaveBeenCalled();
    expect(service.pending()).toBeNull();
  });
  it("lists iOS drafts without automatic navigation or a Firebase resolver call", async () => {
    const draft = {id: "one", text: "https://maps.google.com/maps?q=47,8", location: {lat: 47, lng: 8}, name: "Walls"};
    native.pending.mockResolvedValue({links: [draft]});
    await service.initialize();
    expect(service.drafts()).toEqual([draft]);
    expect(resolver.resolve).not.toHaveBeenCalled();
    expect(router.navigate).not.toHaveBeenCalled();
    await service.reviewDraft(draft, true);
    expect(service.pending()).toMatchObject({location: draft.location, draftName: "Walls", create: true});
    service.consume();
    expect(service.drafts()).toHaveLength(1);
    expect(native.acknowledge).not.toHaveBeenCalled();
    await service.removeDraft("one");
    expect(native.acknowledge).toHaveBeenCalledWith({id: "one"});
    expect(service.drafts()).toEqual([]);
  });
  it("keeps the draft visible if native removal fails", async () => {
    native.pending.mockResolvedValue({links: [{id: "one", text: "link"}]});
    await service.initialize();
    native.acknowledge.mockRejectedValue(new Error("storage unavailable"));
    await service.removeDraft("one");
    expect(service.drafts()).toHaveLength(1);
    expect(snackbar.open).toHaveBeenCalled();
  });

});
