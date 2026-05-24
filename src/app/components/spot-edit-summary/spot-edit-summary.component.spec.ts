import { Component } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { By } from "@angular/platform-browser";
import { describe, expect, it } from "vitest";
import { MediaType } from "../../../db/models/Interfaces";
import { MediaSchema } from "../../../db/schemas/Media";
import { SpotEditSchema } from "../../../db/schemas/SpotEditSchema";
import { SpotEditSummaryComponent } from "./spot-edit-summary.component";

@Component({
  imports: [SpotEditSummaryComponent],
  template: `<app-spot-edit-summary [edit]="edit" />`,
})
class HostComponent {
  edit!: SpotEditSchema;
}

const media = (src: string): MediaSchema => ({
  src,
  type: MediaType.Image,
  uid: "user-1",
  isInStorage: false,
});

const editWithMedia = (
  currentMedia: MediaSchema[],
  previousMedia?: MediaSchema[]
): SpotEditSchema => ({
  type: "UPDATE",
  timestamp: {
    seconds: 1,
    nanoseconds: 0,
  } as SpotEditSchema["timestamp"],
  timestamp_raw_ms: 1_000,
  user: {
    uid: "user-1",
    display_name: "Avery",
  },
  data: {
    media: currentMedia,
  },
  ...(previousMedia
    ? {
        prevData: {
          media: previousMedia,
        },
      }
    : {}),
});

describe("SpotEditSummaryComponent", () => {
  let fixture: ComponentFixture<HostComponent>;

  const createComponent = async (edit: SpotEditSchema) => {
    TestBed.configureTestingModule({
      imports: [HostComponent],
    });

    fixture = TestBed.createComponent(HostComponent);
    fixture.componentInstance.edit = edit;
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture.debugElement.query(By.directive(SpotEditSummaryComponent))
      .componentInstance as SpotEditSummaryComponent;
  };

  it("uses previous media to show only newly added upload thumbnails", async () => {
    const existing = [
      media("https://example.test/existing-1.jpg"),
      media("https://example.test/existing-2.jpg"),
    ];
    const uploaded = media("https://example.test/uploaded.jpg");

    const component = await createComponent(
      editWithMedia([...existing, uploaded], existing)
    );

    expect(component.edit()?.data?.media).toHaveLength(3);
    expect(component.addedMedia().map((item) => item.previewSrc)).toEqual([
      "https://example.test/uploaded.jpg",
    ]);
    expect(component.detailedRows()).toEqual([
      expect.objectContaining({
        key: "media",
        value: "1 item added",
      }),
    ]);
  });

  it("falls back to current media as added media for legacy edits without previous media", async () => {
    const current = [
      media("https://example.test/current-1.jpg"),
      media("https://example.test/current-2.jpg"),
    ];

    const component = await createComponent(editWithMedia(current));

    expect(component.edit()?.data?.media).toHaveLength(2);
    expect(component.addedMedia().map((item) => item.previewSrc)).toEqual([
      "https://example.test/current-1.jpg",
      "https://example.test/current-2.jpg",
    ]);
    expect(component.detailedRows()).toEqual([
      expect.objectContaining({
        key: "media",
        value: "2 items",
      }),
    ]);
  });

  it("summarizes every editable spot field including raw mobile location shapes", async () => {
    const existing = media("https://example.test/existing.jpg");
    const uploaded = media("https://example.test/uploaded.jpg");
    const component = await createComponent({
      type: "UPDATE",
      timestamp: {
        seconds: 1,
        nanoseconds: 0,
      } as SpotEditSchema["timestamp"],
      timestamp_raw_ms: 1_000,
      user: {
        uid: "user-1",
        display_name: "Avery",
      },
      data: {
        name: { en: "Updated Spot", de: "Aktualisierter Spot" },
        description: { en: "Updated description" },
        location_raw: { lat: 47.3769, lng: 8.5417 },
        bounds_raw: [
          { lat: 47.376, lng: 8.541 },
          { lat: 47.377, lng: 8.542 },
          { lat: 47.378, lng: 8.543 },
        ],
        media: [existing, uploaded],
        type: "parkour park",
        access: "commercial",
        amenities: {
          indoor: true,
          outdoor: true,
          covered: true,
          lighting: true,
          wc: true,
          changing_room: true,
          lockers: false,
          heated: true,
          ac: false,
          drinking_water: true,
          parking_on_site: false,
          power_outlets: true,
          maybe_overgrown: false,
          water_feature: true,
          entry_fee: true,
        },
        external_references: {
          google_maps_place_id: "place-id",
          website_url: "https://example.test",
        },
        slug: "updated-spot",
        hide_streetview: true,
      },
      prevData: {
        name: { en: "Previous Spot" },
        description: { en: "Previous description" },
        location_raw: { lat: 47, lng: 8 },
        bounds_raw: [
          { lat: 47, lng: 8 },
          { lat: 47.001, lng: 8.001 },
        ],
        media: [existing],
        type: "park",
        access: "public",
        amenities: {
          indoor: false,
          outdoor: false,
          covered: false,
          lighting: false,
          wc: false,
          changing_room: false,
          lockers: true,
          heated: false,
          ac: true,
          drinking_water: false,
          parking_on_site: true,
          power_outlets: false,
          maybe_overgrown: true,
          water_feature: false,
          entry_fee: false,
        },
        external_references: {
          website_url: "https://old.example.test",
        },
        slug: "previous-spot",
        hide_streetview: false,
      },
    });

    const rowsByKey = new Map(
      component.detailedRows().map((row) => [row.key, row])
    );

    expect(rowsByKey.get("name")?.value).toContain("en: Updated Spot");
    expect(rowsByKey.get("description")?.value).toContain(
      "en: Updated description"
    );
    expect(rowsByKey.get("location")?.value).toBe("47.37690, 8.54170");
    expect(rowsByKey.get("media")?.value).toBe("1 item added");
    expect(rowsByKey.get("type")?.value).toBe("Parkour Park");
    expect(rowsByKey.get("access")?.value).toBe("Membership/Fee");
    expect(rowsByKey.get("streetview")?.value).toBe("Hidden");
    expect(rowsByKey.get("slug")?.value).toBe("updated-spot");
    expect(rowsByKey.get("bounds")?.value).toBe("3 points");
    expect(rowsByKey.get("external_refs")?.value).toBe(
      "Google Maps ID, Website"
    );

    for (const key of [
      "indoor",
      "outdoor",
      "covered",
      "lighting",
      "wc",
      "changing_room",
      "lockers",
      "heated",
      "ac",
      "drinking_water",
      "parking_on_site",
      "power_outlets",
      "maybe_overgrown",
      "water_feature",
      "entry_fee",
    ]) {
      expect(rowsByKey.has(`amenity-${key}`)).toBe(true);
    }

    expect(component.addedMedia().map((item) => item.previewSrc)).toEqual([
      "https://example.test/uploaded.jpg",
    ]);
  });
});
