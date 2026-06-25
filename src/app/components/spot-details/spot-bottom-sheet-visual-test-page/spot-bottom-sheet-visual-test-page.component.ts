import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  signal,
  ViewChild,
} from "@angular/core";
import { Timestamp } from "firebase/firestore";
import { BottomSheetComponent } from "../../bottom-sheet/bottom-sheet.component";
import { MapSpotDetailsPanelComponent } from "../../map/map-spot-details-panel/map-spot-details-panel.component";
import { Spot } from "../../../../db/models/Spot";
import { MediaType } from "../../../../db/models/Interfaces";
import { SpotId, SpotSchema } from "../../../../db/schemas/SpotSchema";

const visualSpotData: SpotSchema = {
  name: {
    en: "Riverside Training Walls",
    de: "Riverside Training Walls",
  },
  description: {
    en: "A compact outdoor line with rails, precision walls, wall-run entries, and plenty of landing options. The lower ledges stay beginner-friendly while the upper wall rewards stronger jumps.",
    de: "A compact outdoor line with rails, precision walls, wall-run entries, and plenty of landing options. The lower ledges stay beginner-friendly while the upper wall rewards stronger jumps.",
  },
  location_raw: { lat: 47.3769, lng: 8.5417 },
  media: [
    {
      type: MediaType.Image,
      src: "/assets/swissjam/swissjam1.jpg",
      isInStorage: false,
      origin: "other",
      attribution_text: "Fixture image generated for visual tests.",
    },
    {
      type: MediaType.Image,
      src: "/assets/spot_placeholder.png",
      isInStorage: false,
      origin: "other",
      attribution_text: "Fixture image generated for visual tests.",
    },
  ],
  is_iconic: true,
  rating: 4.6,
  num_reviews: 24,
  rating_histogram: {
    1: 1,
    2: 1,
    3: 3,
    4: 7,
    5: 12,
  },
  address: {
    sublocality: "Kreis 5",
    sublocalityLocal: "Kreis 5",
    locality: "Zurich",
    localityLocal: "Zurich",
    region: { code: "ZH", name: "Zurich" },
    country: { code: "CH", name: "Switzerland" },
    formatted: "Limmatstrasse 271, 8005 Zurich, Switzerland",
    formattedLocal: "Limmatstrasse 271, 8005 Zurich, Switzerland",
  },
  type: "urban landscape",
  access: "public",
  amenities: {
    indoor: false,
    outdoor: true,
    covered: true,
    lighting: true,
    entry_fee: false,
    drinking_water: true,
    wc: true,
    parking_on_site: false,
    power_outlets: false,
    maybe_overgrown: true,
    water_feature: true,
  },
  bounds_raw: [
    { lat: 47.37708, lng: 8.54125 },
    { lat: 47.37712, lng: 8.54218 },
    { lat: 47.37658, lng: 8.54224 },
    { lat: 47.37652, lng: 8.5413 },
  ],
  hide_streetview: true,
  source: "https://example.test/riverside-training-walls",
  slug: "riverside-training-walls",
  stewardship: {
    organization_ids: ["fixture-org"],
    organizations: {
      "fixture-org": {
        status: "active",
        organization_id: "fixture-org",
        organization: {
          id: "fixture-org",
          name: "PK Spot Fixture Crew",
          slug: "fixture-crew",
        },
        stewarded_by_user_id: "fixture-admin",
        stewarded_at: Timestamp.fromDate(new Date("2026-01-15T12:00:00.000Z")),
      },
    },
  },
};

@Component({
  selector: "app-spot-bottom-sheet-visual-test-page",
  imports: [BottomSheetComponent, MapSpotDetailsPanelComponent],
  templateUrl: "./spot-bottom-sheet-visual-test-page.component.html",
  styleUrl: "./spot-bottom-sheet-visual-test-page.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SpotBottomSheetVisualTestPageComponent implements AfterViewInit {
  @ViewChild(BottomSheetComponent)
  private bottomSheet?: BottomSheetComponent;

  readonly openProgress = signal(1);
  readonly spot = new Spot(
    "visual-riverside-training-walls" as SpotId,
    visualSpotData,
    "de",
  );

  ngAfterViewInit(): void {
    if (typeof requestAnimationFrame === "undefined") {
      return;
    }

    requestAnimationFrame(() => this.bottomSheet?.maximize());
  }
}
