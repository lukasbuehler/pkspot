import { ChangeDetectionStrategy, Component, signal } from "@angular/core";
import { FilterChipsBarComponent } from "../../filter-chips-bar/filter-chips-bar.component";
import { SearchFieldComponent } from "../../search-field/search-field.component";

import { MapFloatingControlsComponent } from "../map-floating-controls/map-floating-controls.component";

@Component({
  selector: "app-map-overlay-visual-test-page",
  imports: [FilterChipsBarComponent, SearchFieldComponent, MapFloatingControlsComponent],
  templateUrl: "./map-overlay-visual-test-page.component.html",
  styleUrl: "./map-overlay-visual-test-page.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MapOverlayVisualTestPageComponent {
  readonly sheetOpen = signal(false);
}
