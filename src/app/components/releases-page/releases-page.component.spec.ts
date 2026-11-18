import { TestBed } from "@angular/core/testing";
import { provideRouter } from "@angular/router";
import { describe, expect, it, vi } from "vitest";
import { MetaTagService } from "../../services/meta-tag.service";
import { RELEASES } from "../../releases/release-notes";
import { ReleasesPageComponent } from "./releases-page.component";

describe("ReleasesPageComponent", () => {
  it("features the latest release and lists every older one", () => {
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: MetaTagService, useValue: { setStaticPageMetaTags: vi.fn() } }],
    });
    const fixture = TestBed.createComponent(ReleasesPageComponent);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;

    expect(element.querySelector(".releases-page__latest h2")?.textContent).toContain(`PK Spot ${RELEASES[0].version}`);
    // Only the featured release animates.
    expect(element.querySelectorAll("app-release-hero").length).toBe(1);
    expect(element.querySelectorAll(".releases-page__release").length).toBe(RELEASES.length - 1);
    expect(element.querySelector('.releases-page__release a[href="/releases/1.2"]')).not.toBeNull();
  });
});
