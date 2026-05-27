import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
} from "@angular/core";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { MatProgressSpinnerModule } from "@angular/material/progress-spinner";
import { MatTooltipModule } from "@angular/material/tooltip";

@Component({
  selector: "app-map-floating-controls",
  imports: [
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
  ],
  templateUrl: "./map-floating-controls.component.html",
  styleUrl: "./map-floating-controls.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MapFloatingControlsComponent {
  readonly showControls = input(false);
  readonly showCreateSpot = input(false);
  readonly showResetNorth = input(false);
  readonly mapStyle = input<"roadmap" | "satellite" | "hybrid" | "terrain" | null>(
    null,
  );
  readonly geolocationLoading = input(false);
  readonly geolocationIcon = input("my_location");

  readonly resetNorth = output<void>();
  readonly toggleMapStyle = output<void>();
  readonly focusGeolocation = output<void>();
  readonly createSpot = output<void>();
}
