import { NgClass } from "@angular/common";
import { Component, ElementRef, inject, input, signal } from "@angular/core";
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
  number = input<number | null | undefined>(null);
  clickable = input<boolean>(false);
  isIconic = input<boolean>(false);
  color = input<"primary" | "secondary" | "tertiary" | "gray">("primary");
  size = input<number>(1);

  isExpanded = signal<boolean>(false);

  onClick($event: MouseEvent) {
    if (this.clickable()) {
      if (this.isExpanded()) {
        this.isExpanded.set(false);
      } else {
        this.isExpanded.set(true);
      }
    }
    $event.stopPropagation();
  }

  onBlur() {
    this.isExpanded.set(false);
  }
}
