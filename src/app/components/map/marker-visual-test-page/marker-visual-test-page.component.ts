import { ChangeDetectionStrategy, Component } from "@angular/core";
import { MarkerComponent } from "../../marker/marker.component";

@Component({
  selector: "app-marker-visual-test-page",
  imports: [MarkerComponent],
  templateUrl: "./marker-visual-test-page.component.html",
  styleUrl: "./marker-visual-test-page.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MarkerVisualTestPageComponent {}
