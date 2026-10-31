import { ApplicationRef } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { MatDialog } from "@angular/material/dialog";
import { Subject } from "rxjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CURRENT_TERMS_VERSION } from "../../services/consent-version";
import { WHATS_NEW_STORAGE_KEY } from "../../services/whats-new";

const mocks = vi.hoisted(() => ({ bootstrap: vi.fn(), load: vi.fn() }));
vi.mock("../application-loader", () => ({ loadApplication: mocks.load }));
import { WelcomeStartupComponent } from "./welcome-startup.component";

describe("WelcomeStartupComponent handoff", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.load.mockResolvedValue({ bootstrap: mocks.bootstrap });
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      queueMicrotask(() => callback(performance.now())); return 0;
    });
  });
  afterEach(() => {
    vi.restoreAllMocks(); vi.unstubAllGlobals();
    localStorage.removeItem("acceptedVersion"); localStorage.removeItem(WHATS_NEW_STORAGE_KEY);
  });

  function setup() {
    const accepted = new Subject<void>(), closed = new Subject<void>();
    const setInput = vi.fn();
    const close = vi.fn(() => closed.next());
    TestBed.configureTestingModule({ providers: [
      WelcomeStartupComponent,
      { provide: MatDialog, useValue: { open: () => ({
        componentInstance: { accepted }, componentRef: { setInput }, close,
        afterClosed: () => closed,
      }) } },
    ] });
    const destroy = vi.spyOn(TestBed.inject(ApplicationRef), "destroy").mockImplementation(() => {});
    TestBed.inject(WelcomeStartupComponent);
    return { accepted, setInput, close, destroy };
  }

  it("holds a pending dialog until the main app is ready and prevents duplicate bootstrap", async () => {
    let ready!: () => void;
    mocks.bootstrap.mockImplementation(() => new Promise<void>(resolve => { ready = resolve; }));
    const { accepted, setInput, close, destroy } = setup();
    expect(mocks.bootstrap).not.toHaveBeenCalled();
    accepted.next(); accepted.next();
    await vi.waitFor(() => expect(mocks.bootstrap).toHaveBeenCalledOnce());
    expect(mocks.bootstrap).toHaveBeenCalledWith({ ready: expect.any(Function) });
    expect(localStorage.getItem("acceptedVersion")).toBeNull();
    expect(setInput).toHaveBeenCalledWith("pending", true);
    expect(close).not.toHaveBeenCalled(); expect(destroy).not.toHaveBeenCalled();
    const grantConsent = vi.fn();
    mocks.bootstrap.mock.calls[0][0].ready(grantConsent);
    ready();
    await vi.waitFor(() => expect(close).toHaveBeenCalledExactlyOnceWith(true));
    expect(destroy).toHaveBeenCalledOnce();
    expect(grantConsent).toHaveBeenCalledOnce();
    expect(localStorage.getItem("acceptedVersion")).toBe(CURRENT_TERMS_VERSION);
  });

  it("leaves a manual recovery action when the main bundle cannot load", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.bootstrap.mockRejectedValue(new Error("bundle unavailable"));
    const { accepted, setInput, close, destroy } = setup();
    accepted.next();
    await vi.waitFor(() => expect(setInput).toHaveBeenCalledWith("failed", true));
    expect(setInput).toHaveBeenLastCalledWith("failed", true);
    expect(setInput).toHaveBeenCalledWith("pending", false);
    expect(close).not.toHaveBeenCalled(); expect(destroy).not.toHaveBeenCalled();
  });
});
