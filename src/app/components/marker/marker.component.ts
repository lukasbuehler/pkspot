import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  input,
  signal,
} from "@angular/core";
import { MatRippleModule } from "@angular/material/core";
import { MatIconModule } from "@angular/material/icon";
import type {
  MapMarkerColor,
  MapMarkerImageFit,
  MapMarkerSchema,
} from "../map/markers/map-marker.model";

export type MarkerSchema = MapMarkerSchema;

@Component({
  selector: "app-marker",
  imports: [MatIconModule, MatRippleModule],
  templateUrl: "./marker.component.html",
  styleUrl: "./marker.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MarkerComponent {
  public elementRef = inject(ElementRef);

  icons = input<string[] | null | undefined>(null);
  /** Image source — when set, renders an inline image badge in the marker. */
  imageSrc = input<string | null | undefined>(null);
  imageFit = input<MapMarkerImageFit>("contain");
  imageBackgroundColor = input<string | null | undefined>(null);
  // Can be number or pre-formatted string (e.g., rating with one decimal)
  number = input<number | string | null | undefined>(null);
  numberVariant = input<"default" | "flag">("default");
  // If true, always show 1 decimal place (for ratings); if false, only show decimals for non-integers (for challenge numbers)
  isRating = input<boolean>(false);

  // Format number with dot decimal (not comma) for consistent display
  formattedNumber = computed(() => {
    const val = this.number();
    if (val === null || val === undefined) return null;
    if (typeof val === "string") return val;

    // If this is a rating, always show 1 decimal place
    if (this.isRating()) {
      return val.toLocaleString("en-US", {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      });
    }

    // For challenge numbers: integers stay as-is, decimals show 1 place
    if (Number.isInteger(val)) {
      return val.toString();
    }
    // Force en-US locale to always get dot decimal separator
    return val.toLocaleString("en-US", {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    });
  });
  clickable = input<boolean>(false);
  isIconic = input<boolean>(false);
  isCheckIn = input<boolean>(false);
  color = input<MapMarkerColor>("primary");
  size = input<number>(1);
  title = input<string | null | undefined>(null);

  isExpanded = signal<boolean>(false);
  readonly isPrimary = computed(
    () => this.color() === "primary" || (!this.isIconic() && !this.isCheckIn())
  );
  readonly isSecondary = computed(
    () => (this.color() === "secondary" && !this.isIconic()) || this.isCheckIn()
  );
  readonly isTertiary = computed(
    () => this.color() === "tertiary" && !this.isIconic() && !this.isCheckIn()
  );
  readonly isGray = computed(
    () => this.color() === "gray" && !this.isIconic() && !this.isCheckIn()
  );

  onClick($event?: MouseEvent) {
    const isInteractive = this.clickable();
    if (isInteractive) {
      if (this.isExpanded()) {
        this.isExpanded.set(false);
      } else {
        this.isExpanded.set(true);
      }
      if ($event) {
        $event.stopPropagation();
      }
    }
  }

  onBlur() {
    this.isExpanded.set(false);
  }
}
