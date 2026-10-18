import { TestBed } from "@angular/core/testing";
import { MatDialog } from "@angular/material/dialog";
import { Capacitor } from "@capacitor/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { APP_LINKS } from "../shared/app-links";
import { PlatformService } from "./platform.service";

describe("PlatformService app store routing", () => {
  beforeEach(() => {
    TestBed.configureTestingModule({});
    vi.spyOn(Capacitor, "isNativePlatform").mockReturnValue(false);
    vi.spyOn(window, "open").mockReturnValue(null);
    const userAgent = navigator.userAgent;
    vi.stubGlobal("navigator", {
      get userAgent() { return userAgent; },
      get maxTouchPoints() { return 0; },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    TestBed.inject(MatDialog).closeAll();
  });

  it.each([
    ["Instagram Android", "Mozilla/5.0 (Linux; Android 15; Pixel 9 Build/AP3A; wv) AppleWebKit/537.36 Version/4.0 Chrome/131.0.0.0 Mobile Safari/537.36 Instagram 360.0.0.0 Android", APP_LINKS.googlePlayStoreUrl],
    ["Chrome Android", "Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 Chrome/131.0.0.0 Mobile Safari/537.36", APP_LINKS.googlePlayStoreUrl],
    ["Instagram iPhone", "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Instagram 360.0.0.0", APP_LINKS.appleAppStoreUrl],
    ["iPad", "Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1", APP_LINKS.appleAppStoreUrl],
  ])("routes %s to the correct store", (_name, userAgent, url) => {
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue(userAgent);
    TestBed.inject(PlatformService).openPKSpotinAppStore();
    expect(window.open).toHaveBeenCalledExactlyOnceWith(url, "_blank", "noopener,noreferrer");
    expect(TestBed.inject(MatDialog).openDialogs).toHaveLength(0);
  });

  it("recognizes iPadOS desktop mode by Macintosh and touch support", () => {
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15");
    vi.spyOn(navigator, "maxTouchPoints", "get").mockReturnValue(5);
    TestBed.inject(PlatformService).openPKSpotinAppStore();
    expect(window.open).toHaveBeenCalledWith(APP_LINKS.appleAppStoreUrl, "_blank", "noopener,noreferrer");
  });

  it.each(["Instagram", "", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15 Safari/605.1.15"])(
    "offers both stores and PWA guidance when no mobile OS is known (%s)", async (userAgent) => {
      vi.spyOn(navigator, "userAgent", "get").mockReturnValue(userAgent);
      const service = TestBed.inject(PlatformService);
      service.openPKSpotinAppStore();
      service.openPKSpotinAppStore();
      const dialogs = TestBed.inject(MatDialog).openDialogs;
      expect(dialogs).toHaveLength(1);
      await TestBed.tick();
      const dialog = document.querySelector('[role="dialog"]')!;
      const links = Array.from(dialog.querySelectorAll("a"));
      expect(links.map((link) => link.href)).toEqual([APP_LINKS.appleAppStoreUrl, APP_LINKS.googlePlayStoreUrl]);
      expect(dialog.textContent).toContain("web app (PWA)");
      expect(window.open).not.toHaveBeenCalled();
      dialog.querySelector<HTMLButtonElement>("button")!.click();
      await vi.waitFor(() => expect(TestBed.inject(MatDialog).openDialogs).toHaveLength(0));
    },
  );

  it("does not open a store or chooser inside the native app", () => {
    vi.spyOn(Capacitor, "isNativePlatform").mockReturnValue(true);
    TestBed.inject(PlatformService).openPKSpotinAppStore();
    expect(window.open).not.toHaveBeenCalled();
    expect(TestBed.inject(MatDialog).openDialogs).toHaveLength(0);
  });

  it("does nothing during server rendering without a browser", () => {
    const dialog = TestBed.inject(MatDialog);
    vi.stubGlobal("navigator", undefined);
    TestBed.inject(PlatformService).openPKSpotinAppStore();
    expect(window.open).not.toHaveBeenCalled();
    expect(dialog.openDialogs).toHaveLength(0);
  });
});
