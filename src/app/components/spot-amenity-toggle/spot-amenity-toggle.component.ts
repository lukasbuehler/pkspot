import { Component, input, model, ChangeDetectionStrategy } from "@angular/core";
import { MatButtonToggleModule } from "@angular/material/button-toggle";
import { MatIconModule } from "@angular/material/icon";

@Component({
  selector: "app-spot-amenity-toggle",
  imports: [MatButtonToggleModule, MatIconModule],
  templateUrl: "./spot-amenity-toggle.component.html",
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: "./spot-amenity-toggle.component.scss",
})
export class SpotAmenityToggleComponent {
  value = model<boolean | null | undefined>(null);
  positiveIcon = input<string | null | undefined>(null);
  negativeIcon = input<string | null | undefined>(null);
  positiveLabel = input<string | null | undefined>(null);
  negativeLabel = input<string | null | undefined>(null);
}
