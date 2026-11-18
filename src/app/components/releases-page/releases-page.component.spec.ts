import { TestBed } from "@angular/core/testing";
import { provideRouter } from "@angular/router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MetaTagService } from "../../services/meta-tag.service";
import { RELEASES } from "../../releases/release-notes";
import { ReleasesPageComponent } from "./releases-page.component";

describe("ReleasesPageComponent", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("shows every release as a card with its banner and highlights, but not its full notes", () => {
    const observed: { element: Element; callback: IntersectionObserverCallback }[] = [];
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        constructor(private readonly callback: IntersectionObserverCallback) {}
        observe(element: Element) {
          observed.push({ element, callback: this.callback });
        }
        disconnect = vi.fn();
      },
    );
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: MetaTagService, useValue: { setStaticPageMetaTags: vi.fn() } }],
    });
    const fixture = TestBed.createComponent(ReleasesPageComponent);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;

    const cards = element.querySelectorAll("app-release-card");
    expect(cards.length).toBe(RELEASES.length);
    expect(element.querySelectorAll("app-release-hero").length).toBe(RELEASES.length);
    expect(element.querySelectorAll("app-release-highlights").length).toBe(RELEASES.length);
    expect(element.querySelector(".release-notes")).toBeNull();

    expect(cards[0].querySelector("h2")?.textContent).toContain(`PK Spot ${RELEASES[0].version}`);
    expect(cards[0].textContent).toContain("Latest release");
    expect(cards[1].textContent).not.toContain("Latest release");
    expect(element.querySelector('app-release-card h2 a[href="/releases/1.2"]')).not.toBeNull();
    // Each banner waits to play until it scrolls into view.
    const hero = element.querySelector("app-release-hero")!;
    expect(hero.classList).toContain("is-waiting");
    const entry = observed.find((item) => item.element === hero)!;
    entry.callback([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver);
    fixture.detectChanges();
    expect(hero.classList).not.toContain("is-waiting");
    expect(element.querySelectorAll("app-release-hero.is-waiting").length).toBe(RELEASES.length - 1);
  });
});
