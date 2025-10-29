import { Component, Inject, signal, WritableSignal } from "@angular/core";
import {
  MAT_DIALOG_DATA,
  MatDialogActions,
  MatDialogContent,
  MatDialogTitle,
  MatDialogRef,
} from "@angular/material/dialog";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { NgOptimizedImage } from "@angular/common";
import {
  AmenitiesMap,
  GeneralAmenities,
  IndoorAmenities,
  OutdoorAmenities,
} from "../../../db/schemas/Amenities";
import {
  AmenityNames,
  AmenityNegativeNames,
} from "../../../db/models/Amenities";
import {
  AmenityIcons,
  AmenityNegativeIcons,
} from "../../../db/schemas/Amenities";
import { SpotAmenityToggleComponent } from "../spot-amenity-toggle/spot-amenity-toggle.component";
import { SpotEnvironmentToggleComponent } from "../spot-environment-toggle/spot-environment-toggle.component";

export interface SpotAmenitiesDialogData {
  amenities: AmenitiesMap;
}

@Component({
  selector: "app-spot-amenities-dialog",
  standalone: true,
  imports: [
    MatDialogTitle,
    MatDialogContent,
    MatDialogActions,
    MatButtonModule,
    MatIconModule,
    SpotAmenityToggleComponent,
    SpotEnvironmentToggleComponent,
  ],
  templateUrl: "./spot-amenities-dialog.component.html",
  styleUrl: "./spot-amenities-dialog.component.scss",
})
export class SpotAmenitiesDialogComponent {
  AmenityIcons = AmenityIcons;
  AmenityNegativeIcons = AmenityNegativeIcons;
  AmenityNames = AmenityNames;
  AmenityNegativeNames = AmenityNegativeNames;
  GeneralAmenities = GeneralAmenities;
  IndoorAmenities = IndoorAmenities;
  OutdoorAmenities = OutdoorAmenities;

  amenities: WritableSignal<AmenitiesMap> = signal({});

  constructor(
    public dialogRef: MatDialogRef<
      SpotAmenitiesDialogComponent,
      AmenitiesMap | undefined
    >,
    @Inject(MAT_DIALOG_DATA) public data: SpotAmenitiesDialogData
  ) {
    // start from a shallow copy to avoid mutating parent until save
    const initial = { ...(data?.amenities ?? {}) } as AmenitiesMap;
    this.amenities.set(initial);
  }

  updateAmenityFromToggle(
    amenityKey: keyof AmenitiesMap,
    value: boolean | null | undefined
  ) {
    this.amenities.update((a) => {
      a = { ...(a ?? {}) } as AmenitiesMap;
      (a as any)[amenityKey] = value ?? null;
      return a;
    });
  }

  updateEnvironment(values: {
    indoor: boolean | null;
    outdoor: boolean | null;
  }) {
    this.amenities.update((a) => {
      a = { ...(a ?? {}) } as AmenitiesMap;
      a.indoor = values.indoor;
      a.outdoor = values.outdoor;
      return a;
    });
  }

  cancel() {
    this.dialogRef.close(undefined);
  }

  save() {
    const result = { ...(this.amenities() ?? {}) } as AmenitiesMap;
    this.dialogRef.close(result);
  }
}
