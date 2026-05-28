import { ChangeDetectionStrategy, Component } from "@angular/core";
import { FilterChipsBarComponent } from "../../filter-chips-bar/filter-chips-bar.component";
import { SearchFieldComponent } from "../../search-field/search-field.component";

@Component({
  selector: "app-map-overlay-visual-test-page",
  imports: [FilterChipsBarComponent, SearchFieldComponent],
  templateUrl: "./map-overlay-visual-test-page.component.html",
  styleUrl: "./map-overlay-visual-test-page.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MapOverlayVisualTestPageComponent {}
