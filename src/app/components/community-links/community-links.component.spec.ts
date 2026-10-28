import { TestBed } from "@angular/core/testing";
import { provideRouter } from "@angular/router";
import { describe, expect, it, vi } from "vitest";
import {
  CommunityLinksComponent,
  communityLinksFromPreviews,
} from "./community-links.component";
import {
  CommunitySearchPreview,
  SearchService,
} from "../../services/search.service";

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
    expect(links).toEqual([
      { key: "locality:ch:zh:zurich", name: "Zurich", path: "/map/communities/zurich" },
      { key: "country:ch", name: "Switzerland", path: "/map/communities/switzerland" },
    ]);
  });

  it("skips previews that have neither a slug nor a canonical path", () => {
    expect(
      communityLinksFromPreviews(["country:ch"], [preview("country:ch", { slug: "" })]),
    ).toEqual([]);
  });
});

describe("CommunityLinksComponent", () => {
  async function render(kind: "spot" | "event", keys: string[]) {
    const getCommunityPreviewsByKeys = vi.fn().mockResolvedValue([
      preview("country:ch", { displayName: "Switzerland", slug: "switzerland" }),
      preview("locality:ch:zh:zurich", { displayName: "Zurich", slug: "zurich" }),
    ]);
    await TestBed.configureTestingModule({
      imports: [CommunityLinksComponent],
      providers: [
        provideRouter([]),
        { provide: SearchService, useValue: { getCommunityPreviewsByKeys } },
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

  it("uses the singular heading for one community", async () => {
    const el = await render("event", ["country:ch"]);
    expect(el.textContent).toContain("this community");
  });

  it("renders nothing without keys", async () => {
    const el = await render("spot", []);
    expect(el.querySelector("a")).toBeNull();
  });
});
