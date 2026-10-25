import { TestBed } from "@angular/core/testing";
import { BreakpointObserver } from "@angular/cdk/layout";
import { of } from "rxjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ResponsiveService } from "./responsive.service";

describe("ResponsiveService viewport lifecycle", () => {
  let visualViewport: EventTarget;
  let frames: FrameRequestCallback[];
  function size(width: number, height: number) {
    vi.spyOn(window, "innerWidth", "get").mockReturnValue(width);
    vi.spyOn(window, "innerHeight", "get").mockReturnValue(height);
    vi.spyOn(document.documentElement, "clientWidth", "get").mockReturnValue(width);
    vi.spyOn(document.documentElement, "clientHeight", "get").mockReturnValue(height);
  }
  beforeEach(() => {
    frames = [];
    visualViewport = new EventTarget();
    vi.stubGlobal("visualViewport", visualViewport);
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => frames.push(callback));
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    size(390, 844);
    TestBed.configureTestingModule({ providers: [
      { provide: BreakpointObserver, useValue: { observe: () => of({ breakpoints: {} }) } },
    ] });
  });
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });
  it("refreshes both dimensions while cold-launch layout settles without a resize event", () => {
    const service = TestBed.inject(ResponsiveService);
    size(720, 960);
    for (let i = 0; i < 6; i++) frames.shift()?.(i);
    expect(service.viewportWidth()).toBe(720);
    expect(service.viewportHeight()).toBe(960);
    expect(service.viewMode()).toBe("tablet");
    expect(service.isInitialized()).toBe(true);
    expect(service.navigationLayout()).toBe("rail");
    expect(service.alainMode()).toBe(false);
  });
  it("observes height-only and visual viewport events without a breakpoint crossing", () => {
    const service = TestBed.inject(ResponsiveService);
    size(390, 650);
    window.dispatchEvent(new Event("resize"));
    expect(service.viewportHeight()).toBe(650);
    expect(service.navigationLayout()).toBe("menu");
    expect(service.alainMode()).toBe(true);
    size(720, 960);
    visualViewport.dispatchEvent(new Event("resize"));
    expect(service.viewportWidth()).toBe(720);
    expect(service.viewportHeight()).toBe(960);
    expect(service.navigationLayout()).toBe("rail");
    expect(service.alainMode()).toBe(false);
    // Keyboard/zoom visual dimensions must not change the layout viewport.
    Object.assign(visualViewport, { width: 360, height: 300 });
    visualViewport.dispatchEvent(new Event("resize"));
    expect(service.viewportWidth()).toBe(720);
    expect(service.viewportHeight()).toBe(960);
    TestBed.resetTestingModule();
    size(1000, 700);
    window.dispatchEvent(new Event("resize"));
    expect(service.viewportWidth()).toBe(720);
  });
});
