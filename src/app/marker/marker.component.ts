import { NgClass } from "@angular/common";
import {
  Component,
  ElementRef,
  inject,
  input,
  signal,
  computed,
} from "@angular/core";
import { MatRippleModule } from "@angular/material/core";
import { MatIconModule } from "@angular/material/icon";

export interface MarkerSchema {
  name?: string;
  color?: "primary" | "secondary" | "tertiary" | "gray";
  location: google.maps.LatLngLiteral;
  icons?: string[];
  number?: number;
  priority?: "required" | number;
}

@Component({
  selector: "app-marker",
  imports: [MatIconModule, NgClass, MatRippleModule],
  templateUrl: "./marker.component.html",
  styleUrl: "./marker.component.scss",
})
export class MarkerComponent {
  public elementRef = inject(ElementRef);

  icons = input<string[] | null | undefined>(null);
  // Can be number or pre-formatted string (e.g., rating with one decimal)
  number = input<number | string | null | undefined>(null);

  // Format number with dot decimal (not comma) for consistent display
  formattedNumber = computed(() => {
    const val = this.number();
    if (val === null || val === undefined) return null;
    if (typeof val === "string") return val;
    // Force en-US locale to always get dot decimal separator
    return val.toLocaleString("en-US", {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    });
  });
  clickable = input<boolean>(false);
  isIconic = input<boolean>(false);
  color = input<"primary" | "secondary" | "tertiary" | "gray">("primary");
  size = input<number>(1);
  title = input<string | null | undefined>(null);

  isExpanded = signal<boolean>(false);

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
