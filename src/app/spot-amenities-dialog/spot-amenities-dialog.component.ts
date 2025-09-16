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
import { MatButtonToggleModule } from "@angular/material/button-toggle";
import { NgOptimizedImage } from "@angular/common";
import {
  AmenitiesMap,
  GeneralAmenities,
  IndoorAmenities,
  OutdoorAmenities,
} from "../../db/schemas/Amenities";
import { AmenityNames, AmenityNegativeNames } from "../../db/models/Amenities";
import { AmenityIcons, AmenityNegativeIcons } from "../../db/schemas/Amenities";
import { SpotAmenityToggleComponent } from "../spot-amenity-toggle/spot-amenity-toggle.component";

export type EnvironmentSelection = "indoor" | "outdoor" | "both" | "unknown";

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
    MatButtonToggleModule,
    SpotAmenityToggleComponent,
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

  envSelection: WritableSignal<EnvironmentSelection> = signal("unknown");
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

    // initialize env selection from current amenities
    const indoor = initial.indoor ?? null;
    const outdoor = initial.outdoor ?? null;
    if (indoor === true && outdoor === true) {
      this.envSelection.set("both");
    } else if (indoor === true) {
      this.envSelection.set("indoor");
    } else if (outdoor === true) {
      this.envSelection.set("outdoor");
    } else {
      this.envSelection.set("unknown");
    }
  }

  setEnvironment(selection: EnvironmentSelection) {
    this.envSelection.set(selection);
    this.amenities.update((a) => {
      a = { ...(a ?? {}) } as AmenitiesMap;
      if (selection === "indoor") {
        a.indoor = true;
        a.outdoor = false;
      } else if (selection === "outdoor") {
        a.indoor = false;
        a.outdoor = true;
      } else if (selection === "both") {
        a.indoor = true;
        a.outdoor = true;
      } else {
        a.indoor = null;
        a.outdoor = null;
      }
      return a;
    });
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

  cancel() {
    this.dialogRef.close(undefined);
  }

  save() {
    const result = { ...(this.amenities() ?? {}) } as AmenitiesMap;
    this.dialogRef.close(result);
  }
}
