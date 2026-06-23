import { ComponentFixture, TestBed } from "@angular/core/testing";
import { By } from "@angular/platform-browser";
import { describe, expect, it } from "vitest";
import { CommunitySearchPreview } from "../../../services/search.service";
import { MapCommunityListComponent } from "./map-community-list.component";

const community = (
  overrides: Partial<CommunitySearchPreview>
): CommunitySearchPreview => ({
  id: "community-1",
  communityKey: "country:ch",
  slug: "switzerland",
  displayName: "Switzerland",
  scope: "country",
  countryCode: "CH",
  countryName: "Switzerland",
  totalSpots: 492,
  ...overrides,
});

describe("MapCommunityListComponent", () => {
  let fixture: ComponentFixture<MapCommunityListComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [MapCommunityListComponent],
    });

    fixture = TestBed.createComponent(MapCommunityListComponent);
  });

  it("uses flag avatars and no repeated subtitle for country communities", () => {
    fixture.componentRef.setInput("communities", [
      community({ countryCode: "CH" }),
    ]);

    fixture.detectChanges();

    expect(
      fixture.debugElement.query(By.css(".community-flag")).nativeElement
        .textContent,
    ).toContain("🇨🇭");
    expect(fixture.debugElement.query(By.css(".community-subtitle"))).toBeNull();
  });

  it("uses locality icon and parent-place subtitle for locality communities", () => {
    fixture.componentRef.setInput("communities", [
      community({
        communityKey: "locality:ch:ag:zofingen",
        slug: "zofingen",
        displayName: "Zofingen",
        scope: "locality",
        localityName: "Zofingen",
        imageUrl: "assets/community-banner.png",
        regionName: "Aargau",
        totalSpots: 5,
      }),
    ]);

    fixture.detectChanges();

    expect(
      fixture.debugElement.query(By.css(".community-avatar mat-icon"))
        .nativeElement.textContent,
    ).toContain("location_city");
    expect(
      fixture.debugElement.query(By.css(".community-avatar img")),
    ).toBeNull();
    expect(
      fixture.debugElement.query(By.css(".community-subtitle")).nativeElement
        .textContent,
    ).toContain("Aargau, Switzerland");
  });
});
