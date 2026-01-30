import { Component, input, output } from "@angular/core";
import { CommonModule } from "@angular/common";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { PoiData } from "../../../db/models/PoiData";

@Component({
  selector: "app-poi-detail",
  standalone: true,
  imports: [CommonModule, MatButtonModule, MatIconModule],
  template: `
    <div class="p-3 d-flex flex-column gap-3">
      <div class="d-flex flex-row justify-content-between align-items-start">
        <h2 class="mat-title-large m-0">{{ poi().name }}</h2>
        <button mat-icon-button (click)="dismiss.emit()">
          <mat-icon>close</mat-icon>
        </button>
      </div>

      <div class="d-flex flex-column gap-2">
        <div class="d-flex align-items-center gap-2 text-secondary">
          <mat-icon>{{ getIcon() }}</mat-icon>
          <span>{{ getTypeLabel() }}</span>
        </div>

        @if(poi().googlePlace?.rating) {
        <div class="d-flex align-items-center gap-1">
          <span class="fw-bold">{{ poi().googlePlace?.rating }}</span>
          <mat-icon class="icon-sm text-warning">star</mat-icon>
          <span class="text-secondary"
            >({{ poi().googlePlace?.userRatingCount }})</span
          >
        </div>
        }
      </div>

      <div class="d-flex gap-2 mt-2">
        <button
          mat-flat-button
          color="primary"
          class="flex-grow-1"
          (click)="navigateTo()"
        >
          <mat-icon>directions</mat-icon>
          Navigate
        </button>
      </div>
    </div>
  `,
  styles: [
    `
      .icon-sm {
        font-size: 16px;
        width: 16px;
        height: 16px;
      }
    `,
  ],
})
export class PoiDetailComponent {
  poi = input.required<PoiData>();
  dismiss = output<void>();

  getIcon(): string {
    if (this.poi().icon) return this.poi().icon!;
    if (this.poi().type === "amenity") return "location_on"; // Default for amenity
    return "place"; // Default for Google POI
  }

  getTypeLabel(): string {
    if (this.poi().type === "amenity") {
      const icons = this.poi().marker?.icons;
      if (icons?.includes("water_full") || icons?.includes("water_drop"))
        return "Drinking Water";
      if (icons?.includes("wc")) return "Toilet";
      return "Amenity";
    }
    // Google POI types are arrays, just take the first one and format it?
    // Or just say "Point of Interest"
    return "Point of Interest";
  }

  navigateTo() {
    const location = this.poi().location;
    const url = `https://www.google.com/maps/dir/?api=1&destination=${location.lat},${location.lng}`;
    window.open(url, "_blank");
  }
}
