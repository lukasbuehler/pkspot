import { Component, Inject } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import {
  MAT_DIALOG_DATA,
  MatDialogModule,
  MatDialogRef,
} from "@angular/material/dialog";
import { MatButtonModule } from "@angular/material/button";
import { MatChipsModule } from "@angular/material/chips";
import { MatIconModule } from "@angular/material/icon";
import { MatDividerModule } from "@angular/material/divider";
import { MatButtonToggleModule } from "@angular/material/button-toggle";
import {
  SpotTypes,
  SpotTypesNames,
  SpotTypesIcons,
  SpotAccess,
  SpotAccessNames,
  SpotAccessIcons,
} from "../../../db/schemas/SpotTypeAndAccess";
import {
  AmenitiesMap,
  AmenitiesOrder,
  AmenityIcons,
  AmenityNegativeIcons,
} from "../../../db/schemas/Amenities";

/**
 * Custom filter parameters returned from the dialog.
 */
export interface CustomFilterParams {
  types: SpotTypes[];
  accesses: SpotAccess[];
  amenities_true: (keyof AmenitiesMap)[];
  amenities_false: (keyof AmenitiesMap)[];
}

/**
 * Input data for the dialog.
 */
export interface CustomFilterDialogData {
  currentParams?: CustomFilterParams;
}

/**
 * Localized amenity names.
 */
const AmenityNames: Record<keyof AmenitiesMap, string> = {
  entry_fee: $localize`:@@amenity.entry_fee:Entry Fee`,
  indoor: $localize`:@@amenity.indoor:Indoor`,
  outdoor: $localize`:@@amenity.outdoor:Outdoor`,
  covered: $localize`:@@amenity.covered:Covered`,
  lighting: $localize`:@@amenity.lighting:Lighting`,
  wc: $localize`:@@amenity.wc:Toilets`,
  changing_room: $localize`:@@amenity.changing_room:Changing Room`,
  lockers: $localize`:@@amenity.lockers:Lockers`,
  heated: $localize`:@@amenity.heated:Heated`,
  ac: $localize`:@@amenity.ac:Air Conditioning`,
  drinking_water: $localize`:@@amenity.drinking_water:Drinking Water`,
  parking_on_site: $localize`:@@amenity.parking_on_site:Parking`,
  power_outlets: $localize`:@@amenity.power_outlets:Power Outlets`,
  maybe_overgrown: $localize`:@@amenity.maybe_overgrown:May Be Overgrown`,
  water_feature: $localize`:@@amenity.water_feature:Water Feature`,
};

/**
 * Track state for each amenity: 'any' | 'yes' | 'no'
 */
type AmenityState = "any" | "yes" | "no";

/**
 * Dialog for custom spot filtering by type, access, and amenities.
 */
@Component({
  selector: "app-custom-filter-dialog",
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatDialogModule,
    MatButtonModule,
    MatChipsModule,
    MatIconModule,
    MatDividerModule,
    MatButtonToggleModule,
  ],
  templateUrl: "./custom-filter-dialog.component.html",
  styleUrl: "./custom-filter-dialog.component.scss",
})
export class CustomFilterDialogComponent {
  // All available spot types
  readonly allTypes: SpotTypes[] = Object.values(SpotTypes);
  readonly typeNames = SpotTypesNames;
  readonly typeIcons = SpotTypesIcons;

  // All available access types
  readonly allAccesses: SpotAccess[] = Object.values(SpotAccess);
  readonly accessNames = SpotAccessNames;
  readonly accessIcons = SpotAccessIcons;

  // All amenities in order
  readonly allAmenities: (keyof AmenitiesMap)[] = AmenitiesOrder;
  readonly amenityNames = AmenityNames;
  readonly amenityIcons = AmenityIcons;
  readonly amenityNegativeIcons = AmenityNegativeIcons;

  // Selected values
  selectedTypes: SpotTypes[] = [];
  selectedAccesses: SpotAccess[] = [];
  amenityStates: Record<keyof AmenitiesMap, AmenityState> = {} as any;

  // Localized strings
  readonly dialogTitle = $localize`:@@custom_filter_dialog_title:Custom Filters`;
  readonly typesSectionLabel = $localize`:@@filter_section_types:Spot Type`;
  readonly accessSectionLabel = $localize`:@@filter_section_access:Access`;
  readonly amenitiesSectionLabel = $localize`:@@filter_section_amenities:Amenities`;
  readonly clearLabel = $localize`:@@filter_clear:Clear`;
  readonly applyLabel = $localize`:@@filter_apply:Apply`;
  readonly anyLabel = $localize`:@@filter_any:Any`;
  readonly yesLabel = $localize`:@@filter_yes:Yes`;
  readonly noLabel = $localize`:@@filter_no:No`;

  constructor(
    private dialogRef: MatDialogRef<CustomFilterDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: CustomFilterDialogData | null
  ) {
    // Initialize amenity states to 'any'
    for (const amenity of this.allAmenities) {
      this.amenityStates[amenity] = "any";
    }

    // Restore from current params if provided
    if (data?.currentParams) {
      this.selectedTypes = [...(data.currentParams.types || [])];
      this.selectedAccesses = [...(data.currentParams.accesses || [])];

      for (const amenity of data.currentParams.amenities_true || []) {
        this.amenityStates[amenity] = "yes";
      }
      for (const amenity of data.currentParams.amenities_false || []) {
        this.amenityStates[amenity] = "no";
      }
    }
  }

  toggleType(type: SpotTypes): void {
    const index = this.selectedTypes.indexOf(type);
    if (index >= 0) {
      this.selectedTypes.splice(index, 1);
    } else {
      this.selectedTypes.push(type);
    }
  }

  isTypeSelected(type: SpotTypes): boolean {
    return this.selectedTypes.includes(type);
  }

  toggleAccess(access: SpotAccess): void {
    const index = this.selectedAccesses.indexOf(access);
    if (index >= 0) {
      this.selectedAccesses.splice(index, 1);
    } else {
      this.selectedAccesses.push(access);
    }
  }

  isAccessSelected(access: SpotAccess): boolean {
    return this.selectedAccesses.includes(access);
  }

  getAmenityState(amenity: keyof AmenitiesMap): AmenityState {
    return this.amenityStates[amenity] || "any";
  }

  setAmenityState(amenity: keyof AmenitiesMap, state: AmenityState): void {
    this.amenityStates[amenity] = state;
  }

  clearAll(): void {
    this.selectedTypes = [];
    this.selectedAccesses = [];
    for (const amenity of this.allAmenities) {
      this.amenityStates[amenity] = "any";
    }
  }

  get hasAnySelection(): boolean {
    if (this.selectedTypes.length > 0) return true;
    if (this.selectedAccesses.length > 0) return true;
    for (const amenity of this.allAmenities) {
      if (this.amenityStates[amenity] !== "any") return true;
    }
    return false;
  }

  apply(): void {
    const amenities_true: (keyof AmenitiesMap)[] = [];
    const amenities_false: (keyof AmenitiesMap)[] = [];

    for (const amenity of this.allAmenities) {
      if (this.amenityStates[amenity] === "yes") {
        amenities_true.push(amenity);
      } else if (this.amenityStates[amenity] === "no") {
        amenities_false.push(amenity);
      }
    }

    const result: CustomFilterParams = {
      types: this.selectedTypes,
      accesses: this.selectedAccesses,
      amenities_true,
      amenities_false,
    };

    this.dialogRef.close(result);
  }

  cancel(): void {
    this.dialogRef.close(null);
  }
}
