import { TestBed } from "@angular/core/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { YoutubePlayerComponent } from "./youtube-player.component";

let intersect: IntersectionObserverCallback;
const createFixture = () => {
  const fixture = TestBed.createComponent(YoutubePlayerComponent);
  fixture.componentRef.setInput("src", "https://www.youtube-nocookie.com/embed/uG9SCwcHA7k?si=discard");
  fixture.detectChanges();
  intersect([{isIntersecting:true, intersectionRatio:1} as IntersectionObserverEntry], {} as IntersectionObserver);
  fixture.detectChanges();
  return fixture;
};

describe("YouTube consent player", () => {
  afterEach(() => vi.unstubAllGlobals());
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal("IntersectionObserver", class {
      constructor(callback: IntersectionObserverCallback) { intersect = callback; }
      observe() {} disconnect() {}
    });
  });
  it("makes no player or thumbnail before explicit permission, even with legacy allow-all", () => {
    localStorage.setItem("pkspot.showExternalMedia.v1", "true");
    const fixture = createFixture();
    expect(fixture.nativeElement.querySelector("iframe, img, script")).toBeNull();
    expect(fixture.nativeElement.textContent).toContain("Load this video");
  });
  it("loads a canonical privacy-enhanced player once and unloads on revoke or inactivity", () => {
    const fixture = createFixture();
    const player = fixture.componentInstance;
    player.loadOnce.set(true);
    fixture.detectChanges();
    const iframe = fixture.nativeElement.querySelector("iframe") as HTMLIFrameElement;
    expect(iframe.src).toBe("https://www.youtube-nocookie.com/embed/uG9SCwcHA7k?playsinline=1&autoplay=0");
    expect(iframe.getAttribute("referrerpolicy")).toBe("strict-origin-when-cross-origin");
    expect(fixture.nativeElement.querySelector(".youtube-watch")).toBeNull();
    expect(localStorage.getItem("pkspot.youtubeEmbeds.v1")).toBeNull();
    fixture.componentRef.setInput("active", false);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector("iframe")).toBeNull();
    fixture.componentRef.setInput("active", true);
    player.preferences.reset();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector("iframe")).toBeNull();
  });
  it("stops offscreen playback and exposes an external fallback", () => {
    const fixture = createFixture();
    fixture.componentInstance.preferences.setYoutubeAllowed(true);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector("iframe")).not.toBeNull();
    intersect([{isIntersecting:false, intersectionRatio:0} as IntersectionObserverEntry], {} as IntersectionObserver);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector("iframe")).toBeNull();
    expect(fixture.nativeElement.querySelector(".youtube-watch").href).toBe("https://www.youtube.com/watch?v=uG9SCwcHA7k");
  });
});
