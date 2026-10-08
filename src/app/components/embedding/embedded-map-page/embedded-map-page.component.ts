import { ActivatedRoute } from "@angular/router";
import { toSignal } from "@angular/core/rxjs-interop";
import { Component, ChangeDetectionStrategy, inject, computed } from "@angular/core";
import { SpotMapComponent } from "../../spot-map/spot-map.component";

@Component({
  selector: "app-embedded-map-page",
  imports: [SpotMapComponent],
  templateUrl: "./embedded-map-page.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: "./embedded-map-page.component.scss",
})
export class EmbeddedMapPageComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly params = toSignal(this.route.queryParamMap, { initialValue: this.route.snapshot.queryParamMap });
  readonly showSatelliteToggle = computed(() => this.params().get("showSatelliteToggle") === "true");
  readonly showGeolocation = computed(() => this.params().get("showGeolocation") === "true");
}
