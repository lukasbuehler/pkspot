import { ChangeDetectionStrategy, Component, input, output } from "@angular/core";
import { NgOptimizedImage } from "@angular/common";
import { MatButtonModule } from "@angular/material/button";
import { MatDividerModule } from "@angular/material/divider";
import { MatIconModule } from "@angular/material/icon";
import { SpotPreviewData } from "../../../../db/schemas/SpotPreviewData";
import { SpotId } from "../../../../db/schemas/SpotSchema";

@Component({
  selector: "app-map-check-in-banner",
  imports: [NgOptimizedImage, MatButtonModule, MatDividerModule, MatIconModule],
  templateUrl: "./map-check-in-banner.component.html",
  styleUrl: "./map-check-in-banner.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MapCheckInBannerComponent {
  spot = input<SpotPreviewData | null>(null);

  spotSelect = output<SpotPreviewData>();
  checkIn = output<SpotId>();
  dismiss = output<SpotId>();
}
