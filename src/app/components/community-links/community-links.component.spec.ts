import { TestBed } from "@angular/core/testing";
import { Router, provideRouter } from "@angular/router";
import { describe, expect, it, vi } from "vitest";
import {
  CommunityLinksComponent,
  communityLinksFromPreviews,
} from "./community-links.component";
import {
  CommunitySearchPreview,
  SearchService,
} from "../../services/search.service";
import { COMMUNITY_PATH_OPENER } from "./community-path-opener";

const preview = (
  communityKey: string,
  overrides: Partial<CommunitySearchPreview> = {},
): CommunitySearchPreview => ({
  id: communityKey,
  communityKey,
  slug: communityKey.split(":").pop() ?? "",
  displayName: communityKey,
  totalSpots: 10,
  ...overrides,
});

describe("communityLinksFromPreviews", () => {
  it("keeps key order, de-duplicates and skips communities without a page", () => {
    const links = communityLinksFromPreviews(
      ["locality:ch:zh:zurich", "country:ch", "country:xx", "country:ch"],
      [
        preview("country:ch", { displayName: "Switzerland", slug: "switzerland" }),
        preview("locality:ch:zh:zurich", {
          displayName: "Zurich",
          canonicalPath: "/map/communities/zurich",
        }),
        preview("country:nowhere", { slug: "" }),
      ],
    );
    expect(links.map((link) => [link.communityKey, link.canonicalPath])).toEqual([
      ["locality:ch:zh:zurich", "/map/communities/zurich"],
      ["country:ch", "/map/communities/switzerland"],
    ]);
  });

  it("lists the most specific community first, like the map list", () => {
    const links = communityLinksFromPreviews(
      ["country:ch", "region:ch:sz", "locality:ch:sz:freienbach"],
      [
        preview("country:ch", { scope: "country" }),
        preview("region:ch:sz", { scope: "region" }),
        preview("locality:ch:sz:freienbach", { scope: "locality" }),
      ],
    );
    expect(links.map((link) => link.communityKey)).toEqual([
      "locality:ch:sz:freienbach",
      "region:ch:sz",
      "country:ch",
    ]);
  });

  it("skips previews that have neither a slug nor a canonical path", () => {
    expect(
      communityLinksFromPreviews(["country:ch"], [preview("country:ch", { slug: "" })]),
    ).toEqual([]);
  });
});

describe("CommunityLinksComponent", () => {
  async function render(
    kind: "spot" | "event",
    keys: string[],
    pathOpener?: { openCommunityPath: (path: string) => void },
  ) {
    const getCommunityPreviewsByKeys = vi.fn().mockResolvedValue([
      preview("country:ch", { displayName: "Switzerland", slug: "switzerland" }),
      preview("locality:ch:zh:zurich", { displayName: "Zurich", slug: "zurich" }),
    ]);
    await TestBed.configureTestingModule({
      imports: [CommunityLinksComponent],
      providers: [
        provideRouter([]),
        { provide: SearchService, useValue: { getCommunityPreviewsByKeys } },
        ...(pathOpener ? [{ provide: COMMUNITY_PATH_OPENER, useValue: pathOpener }] : []),
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(CommunityLinksComponent);
    fixture.componentRef.setInput("kind", kind);
    fixture.componentRef.setInput("communityKeys", keys);
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it("renders crawlable anchors with hrefs", async () => {
    const el = await render("event", ["country:ch", "locality:ch:zh:zurich", "country:gone"]);
    const anchors = Array.from(el.querySelectorAll("a"));
    expect(anchors.map((a) => a.getAttribute("href"))).toEqual([
      "/map/communities/switzerland",
      "/map/communities/zurich",
    ]);
    expect(el.textContent).toContain("these communities");
  });

  it("shows each community like the map list and opens it in the app", async () => {
    const el = await render("spot", ["locality:ch:zh:zurich"]);
    const navigate = vi
      .spyOn(TestBed.inject(Router), "navigateByUrl")
      .mockResolvedValue(true);
    const row = el.querySelector<HTMLAnchorElement>("a.community-row")!;

    expect(row.textContent).toContain("Zurich");
    expect(row.textContent).toContain("10");
    expect(el.querySelector("app-entity-preview-card")).toBeNull();
    row.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }));
    expect(navigate).toHaveBeenCalledWith("/map/communities/zurich");
  });

  it("opens the community through the map when inside it, without routing", async () => {
    const openCommunityPath = vi.fn();
    const el = await render("spot", ["locality:ch:zh:zurich"], { openCommunityPath });
    const navigate = vi.spyOn(TestBed.inject(Router), "navigateByUrl");

    el.querySelector<HTMLAnchorElement>("a.community-row")!.dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }),
    );

    expect(openCommunityPath).toHaveBeenCalledWith("/map/communities/zurich");
    expect(navigate).not.toHaveBeenCalled();
  });

  it("uses the singular heading for one community", async () => {
    const el = await render("event", ["country:ch"]);
    expect(el.textContent).toContain("this community");
  });

  it("renders nothing without keys", async () => {
    const el = await render("spot", []);
    expect(el.querySelector("a")).toBeNull();
  });
});
