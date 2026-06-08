import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ViewChild,
} from "@angular/core";
import { BottomSheetComponent } from "../../bottom-sheet/bottom-sheet.component";
import { MapSpotDetailsPanelComponent } from "../../map/map-spot-details-panel/map-spot-details-panel.component";
import { LocalSpot } from "../../../../db/models/Spot";
import { SpotSchema } from "../../../../db/schemas/SpotSchema";

const visualSpotData: SpotSchema = {
  name: {
    en: "Riverside Training Walls",
    de: "Riverside Training Walls",
  },
  description: {
    en: "A compact outdoor line with rails, precision walls, and plenty of landing options.",
    de: "Eine kompakte Outdoor-Line mit Rails, Präzisionsmauern und vielen Landeoptionen.",
  },
  location_raw: { lat: 47.3769, lng: 8.5417 },
  rating: 4.5,
  num_reviews: 18,
  rating_histogram: {
    1: 0,
    2: 1,
    3: 2,
    4: 6,
    5: 9,
  },
  address: {
    locality: "Zurich",
    region: { code: "ZH", name: "Zurich" },
    country: { code: "CH", name: "Switzerland" },
    formatted: "Riverside Training Walls, Zurich, Switzerland",
  },
  type: "urban landscape",
  access: "public",
  amenities: {
    outdoor: true,
    lighting: true,
    drinking_water: true,
    wc: false,
  },
  hide_streetview: true,
  slug: "riverside-training-walls",
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

  readonly spot = new LocalSpot(visualSpotData, "de");

  ngAfterViewInit(): void {
    if (typeof requestAnimationFrame === "undefined") {
      return;
    }

    requestAnimationFrame(() => this.bottomSheet?.maximize());
  }
}
