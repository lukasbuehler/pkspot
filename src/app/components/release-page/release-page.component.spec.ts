import { TestBed } from "@angular/core/testing";
import { ActivatedRoute, convertToParamMap, provideRouter } from "@angular/router";
import { BehaviorSubject } from "rxjs";
import { describe, expect, it, vi } from "vitest";
import { MetaTagService } from "../../services/meta-tag.service";
import { ReleasePageComponent } from "./release-page.component";

function render(version: string) {
  const params = new BehaviorSubject(convertToParamMap({ version }));
  const setStaticPageMetaTags = vi.fn();
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: ActivatedRoute, useValue: { paramMap: params } },
      { provide: MetaTagService, useValue: { setStaticPageMetaTags } },
    ],
  });
  const fixture = TestBed.createComponent(ReleasePageComponent);
  fixture.detectChanges();
  return { fixture, params, setStaticPageMetaTags, element: fixture.nativeElement as HTMLElement };
}

describe("ReleasePageComponent", () => {
  it("shows a release's hero, translated highlights and full notes", () => {
    const { element, setStaticPageMetaTags } = render("1.2");
    expect(element.querySelector("h1")?.textContent).toContain("PK Spot 1.2");
    // A calendar date: never shifted by the viewer's time zone.
    expect(element.querySelector("time")?.textContent).toBe("October 26, 2026");
    expect(element.querySelector("app-release-hero")).not.toBeNull();
    expect(element.textContent).toContain("Become the local legend");
    expect(element.querySelector(".release-notes")?.getAttribute("lang")).toBe("en");
    expect(setStaticPageMetaTags).toHaveBeenCalledWith(
      "Version 1.2 – Training Update",
      expect.stringContaining("Train tab"),
      undefined,
      "/releases/1.2",
    );
  });

  it("links to the neighbouring releases and follows the route", async () => {
    const { element, fixture, params } = render("1.2.1");
    const pager = [...element.querySelectorAll<HTMLAnchorElement>(".release-page__pager a")].map((a) => a.getAttribute("href"));
    expect(pager).toEqual(["/releases/1.2", "/releases/1.2.2"]);

    params.next(convertToParamMap({ version: "1.1.1" }));
    fixture.detectChanges();
    await fixture.whenStable();
    expect(element.querySelector("h1")?.textContent).toContain("PK Spot 1.1.0 and 1.1.1");
    // Releases without highlights show only their notes.
    expect(element.textContent).not.toContain("Highlights");
  });

  it("marks web-only releases", () => {
    const { element } = render("1.2.2");
    expect(element.textContent).toContain("Only on Web");
    expect(element.querySelector(".release-page__newer")).toBeNull();
  });
});
