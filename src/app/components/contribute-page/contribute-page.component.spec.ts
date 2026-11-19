import { readFileSync } from "node:fs";
import { TestBed } from "@angular/core/testing";
import { provideRouter } from "@angular/router";
import { afterEach, describe, expect, it, vi } from "vitest";
import crew from "../../../assets/data/crew.json";
import { AnalyticsService } from "../../services/analytics.service";
import { MetaTagService } from "../../services/meta-tag.service";
import { ContributePageComponent } from "./contribute-page.component";

function render() {
  // The issues section would otherwise call the real GitHub API.
  vi.stubGlobal("fetch", vi.fn(async () => new Response("[]", { status: 200 })));
  const analytics = { trackOutboundLinkClick: vi.fn() };
  const meta = { setStaticPageMetaTags: vi.fn() };
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: AnalyticsService, useValue: analytics },
      { provide: MetaTagService, useValue: meta },
    ],
  });
  const fixture = TestBed.createComponent(ContributePageComponent);
  fixture.detectChanges();
  return { element: fixture.nativeElement as HTMLElement, analytics, meta };
}

describe("ContributePageComponent", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("lists the ways to help with one featured card and links into the app", () => {
    const { element, meta } = render();

    expect(element.querySelector("h1")?.textContent).toContain("Help build PK Spot");
    expect(element.querySelector("app-release-hero")?.classList).toContain("tier-major");
    expect(element.querySelectorAll(".contribute-section").length).toBe(4);
    expect(element.querySelectorAll(".contribute-way.is-featured").length).toBe(1);
    expect(element.querySelector(".contribute-way.is-featured a[href='/map']")).not.toBeNull();
    expect(element.querySelector("a[href='/events/suggest']")).not.toBeNull();
    expect(element.querySelector("a[href='/contact?topic=crew']")).not.toBeNull();
    expect(element.querySelector("a[href='/contact?topic=spot_import']")).not.toBeNull();
    expect(meta.setStaticPageMetaTags).toHaveBeenCalledWith(
      "How to help",
      expect.any(String),
      undefined,
      "/contribute",
    );
  });

  it("thanks the same crew as the About page and Settings, and shows the GitHub issues", () => {
    const { element } = render();

    const people = [...element.querySelectorAll(".contribute-crew__list li strong")].map((name) => name.textContent);
    expect(people).toEqual(crew.map((member) => member.name));
    expect(element.querySelector("#contribute-feedback")?.closest("section")?.querySelector("app-github-issues")).not.toBeNull();
  });

  it("opens outside links in a new tab and tracks them", () => {
    const { element, analytics } = render();

    const outbound = [...element.querySelectorAll<HTMLAnchorElement>("a[target='_blank']")];
    expect(outbound.length).toBeGreaterThan(0);
    for (const link of outbound) {
      expect(link.rel).toBe("noopener noreferrer");
      expect(link.href).toMatch(/^https:\/\/(github\.com\/lukasbuehler\/pkspot|discord\.gg\/)/);
    }

    const issue = element.querySelector<HTMLAnchorElement>("a[href$='/issues/new']");
    issue?.addEventListener("click", (event) => event.preventDefault());
    issue?.click();
    expect(analytics.trackOutboundLinkClick).toHaveBeenCalledWith(
      "contribute_page",
      "github_issue",
      "https://github.com/lukasbuehler/pkspot/issues/new",
      "Open an issue",
    );
  });

  it("only uses icons from the icon font", () => {
    const { element } = render();
    const available = new Set(readFileSync("src/assets/fonts/icons_list.txt", "utf8").split(/\r?\n/));
    const used = [...element.querySelectorAll("mat-icon")].map((icon) => icon.textContent?.trim() ?? "");

    expect(used.length).toBeGreaterThan(0);
    expect(used.filter((icon) => !available.has(icon))).toEqual([]);
  });
});
