import { PLATFORM_ID, REQUEST } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { describe, expect, it } from "vitest";
import { WelcomePrerenderComponent } from "./welcome-prerender.component";

function render(platform: "server" | "browser", url: string | null) {
  TestBed.configureTestingModule({
    providers: [
      { provide: PLATFORM_ID, useValue: platform },
      { provide: REQUEST, useValue: url ? new Request(url) : null },
    ],
  });
  const fixture = TestBed.createComponent(WelcomePrerenderComponent);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe("WelcomePrerenderComponent", () => {
  it("server-renders the welcome on pages that start with the agreement", () => {
    const host = render("server", "https://pkspot.app/en/map/spots/imax");
    expect(host.querySelector("app-welcome-frame app-welcome-dialog")).not.toBeNull();
    expect(host.textContent).toContain("Agree and Continue");
  });

  it.each(["/de/about", "/en/privacy-policy", "/en/embedded/spots/x"])(
    "leaves %s without the agreement",
    (path) => {
      expect(render("server", `https://pkspot.app${path}`).querySelector("app-welcome-frame")).toBeNull();
    },
  );

  it("renders nothing in the browser, where the early welcome app owns it", () => {
    expect(render("browser", null).childElementCount).toBe(0);
  });
});
