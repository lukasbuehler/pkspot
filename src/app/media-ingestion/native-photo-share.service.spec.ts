import {signal} from "@angular/core";
import {TestBed} from "@angular/core/testing";
import {BehaviorSubject, of} from "rxjs";
import {MatDialog} from "@angular/material/dialog";
import {MatSnackBar} from "@angular/material/snack-bar";
import {Router} from "@angular/router";
import {AuthenticationService} from "../services/firebase/authentication.service";
import {AgeAssuranceService} from "../services/age-assurance.service";
import {NativePhotoShareService} from "./native-photo-share.service";

const native = vi.hoisted(() => ({pending: vi.fn(), acknowledge: vi.fn(), addListener: vi.fn()}));
const prepare = vi.hoisted(() => vi.fn());
vi.mock("@capacitor/core", () => ({Capacitor: {getPlatform: () => "android", convertFileSrc: (uri: string) => uri}, registerPlugin: () => native}));
vi.mock("@capacitor/app", () => ({App: {addListener: vi.fn()}}));
vi.mock("./spot-photo-preparation", () => ({prepareSpotPhoto: prepare}));

describe("native photo handoff", () => {
  const dialog = {open: vi.fn()};
  beforeEach(() => {
    vi.resetAllMocks();
    native.pending.mockResolvedValue({batches: [{id: "batch", files: [{uri: "https://local/photo", mimeType: "image/jpeg", name: "photo"}]}]});
    prepare.mockResolvedValue({ready: true, blob: new Blob(["clean"], {type: "image/jpeg"})});
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ok: true, blob: () => Promise.resolve(new Blob(["original"]))}));
    TestBed.configureTestingModule({providers: [
      {provide: AuthenticationService, useValue: {authState$: new BehaviorSubject({uid: "user"}), initialAuthStateResolved: signal(true)}},
      {provide: AgeAssuranceService, useValue: {canParticipatePublicly: () => true}},
      {provide: MatDialog, useValue: dialog}, {provide: Router, useValue: {navigate: vi.fn()}},
      {provide: MatSnackBar, useValue: {open: vi.fn().mockReturnValue({dismiss: vi.fn()})}},
    ]});
  });
  afterEach(() => vi.unstubAllGlobals());
  it("keeps the existing public-participation restriction", async () => {
    TestBed.overrideProvider(AgeAssuranceService, {useValue: {
      canParticipatePublicly: () => false, getRestrictionMessage: () => "Restricted",
    }});
    await TestBed.inject(NativePhotoShareService).initialize();
    await vi.waitFor(() => expect(native.pending).toHaveBeenCalled());
    expect(dialog.open).not.toHaveBeenCalled();
    expect(native.acknowledge).not.toHaveBeenCalled();
  });
  it("acknowledges originals only after a completed moderated upload", async () => {
    dialog.open.mockReturnValueOnce({afterClosed: () => of({spotId: "spot"})}).mockReturnValueOnce({afterClosed: () => of("completed")});
    await TestBed.inject(NativePhotoShareService).initialize();
    await vi.waitFor(() => expect(native.acknowledge).toHaveBeenCalledWith({id: "batch"}));
    expect(prepare).toHaveBeenCalledTimes(1);
    expect(dialog.open.mock.calls[1][1].data.initialFiles[0].type).toBe("image/jpeg");
  });
  it("honors explicit discard without preparing or uploading photos", async () => {
    dialog.open.mockReturnValue({afterClosed: () => of({discard: true})});
    await TestBed.inject(NativePhotoShareService).initialize();
    await vi.waitFor(() => expect(native.acknowledge).toHaveBeenCalledWith({id: "batch"}));
    expect(prepare).not.toHaveBeenCalled();
  });
  it("retains originals if the target picker is cancelled", async () => {
    dialog.open.mockReturnValue({afterClosed: () => of(undefined)});
    await TestBed.inject(NativePhotoShareService).initialize();
    await vi.waitFor(() => expect(dialog.open).toHaveBeenCalled());
    expect(native.acknowledge).not.toHaveBeenCalled();
    expect(prepare).not.toHaveBeenCalled();
  });
  it("retains originals after an interrupted upload dialog", async () => {
    dialog.open.mockReturnValueOnce({afterClosed: () => of({spotId: "spot"})}).mockReturnValueOnce({afterClosed: () => of(undefined)});
    await TestBed.inject(NativePhotoShareService).initialize();
    await vi.waitFor(() => expect(dialog.open).toHaveBeenCalledTimes(2));
    expect(native.acknowledge).not.toHaveBeenCalled();
  });
});
