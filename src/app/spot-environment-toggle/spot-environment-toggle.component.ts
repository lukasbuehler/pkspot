import { Component, output, input } from "@angular/core";
import { MatButtonToggleModule } from "@angular/material/button-toggle";
import { MatIconModule } from "@angular/material/icon";
import { AmenityIcons } from "../../db/schemas/Amenities";

/**
 * Four-option toggle for indoor/outdoor environment selection.
 * Manages the combination of indoor and outdoor boolean values.
 */
@Component({
  selector: "app-spot-environment-toggle",
  imports: [MatButtonToggleModule, MatIconModule],
  templateUrl: "./spot-environment-toggle.component.html",
  styleUrl: "./spot-environment-toggle.component.scss",
})
export class SpotEnvironmentToggleComponent {
  indoor = input<boolean | null | undefined>(null);
  outdoor = input<boolean | null | undefined>(null);

  // Emit changes for both values
  environmentChange = output<{
    indoor: boolean | null;
    outdoor: boolean | null;
  }>();

  AmenityIcons = AmenityIcons;

  /**
   * Get the current selection based on indoor/outdoor values
   */
  getCurrentSelection(): string {
    const ind = this.indoor();
    const out = this.outdoor();

    if (ind === true && out === true) return "both";
    if (ind === true && out !== true) return "indoor";
    if (out === true && ind !== true) return "outdoor";
    return "unknown";
  }

  /**
   * Handle selection change and emit the appropriate indoor/outdoor values
   */
  onSelectionChange(selection: string) {
    switch (selection) {
      case "indoor":
        this.environmentChange.emit({ indoor: true, outdoor: false });
        break;
      case "outdoor":
        this.environmentChange.emit({ indoor: false, outdoor: true });
        break;
      case "both":
        this.environmentChange.emit({ indoor: true, outdoor: true });
        break;
      case "unknown":
      default:
        this.environmentChange.emit({ indoor: null, outdoor: null });
        break;
    }
  }
}
