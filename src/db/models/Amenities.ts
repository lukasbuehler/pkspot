import {
  AmenitiesMap,
  AmenitiesOrder,
  AmenityIcons,
  AmenityNegativeIcons,
} from "../schemas/Amenities";

export const AmenityNames: { [key in keyof AmenitiesMap]: string } = {
  covered: $localize`:@@amenities.covered:Covered`,
  outdoor: $localize`:@@amenities.outdoor:Outdoor`,
  indoor: $localize`:@@amenities.indoor:Indoor`,
  lighting: $localize`:@@amenities.lighting:Lighting`,
  wc: $localize`:@@amenities.wc:WC`,
  changing_room: $localize`:@@amenities.changing_room:Changing room`,
  lockers: $localize`:@@amenities.lockers:Lockers`,
  heated: $localize`:@@amenities.heated:Heated`,
  ac: $localize`:@@amenities.ac:AC`,
  entry_fee: $localize`:@@amenities.entry_fee:Entry fee`,
  drinking_water: $localize`:@@amenities.drinking_water:Drinking water`,
  parking_on_site: $localize`:@@amenities.parking_on_site:Parking`,
  power_outlets: $localize`:@@amenities.power_outlets:Power outlets`,
  maybe_overgrown: $localize`:@@amenities.maybe_overgrown:May be overgrown`,
  water_feature: $localize`:@@amenities.water_feature:Water feature`,
};

// Names for negative states
export const AmenityNegativeNames: { [key in keyof AmenitiesMap]: string } = {
  covered: $localize`:@@amenities.not_covered:Not covered`,
  outdoor: $localize`:@@amenities.not_outdoor:Not outdoor`,
  indoor: $localize`:@@amenities.not_indoor:Not indoor`,
  lighting: $localize`:@@amenities.no_lighting:No lighting`,
  wc: $localize`:@@amenities.no_wc:No WC`,
  changing_room: $localize`:@@amenities.no_changing_room:No changing room`,
  lockers: $localize`:@@amenities.no_lockers:No lockers`,
  heated: $localize`:@@amenities.not_heated:Not heated`,
  ac: $localize`:@@amenities.no_ac:No AC`,
  entry_fee: $localize`:@@amenities.free_entry:Free entry`,
  drinking_water: $localize`:@@amenities.no_drinking_water:No drinking water`,
  parking_on_site: $localize`:@@amenities.no_parking:No parking`,
  power_outlets: $localize`:@@amenities.no_power_outlets:No power outlets`,
  maybe_overgrown: $localize`:@@amenities.not_overgrown:Well maintained`,
  water_feature: $localize`:@@amenities.no_water_feature:No water feature`,
};

export function makeAmenitiesArray(
  amenities: AmenitiesMap
): { name?: string; icon?: string }[] {
  if (!amenities) return [];

  return AmenitiesOrder.map((key) => {
    const value = amenities[key as keyof AmenitiesMap];
    if (value !== true) return null; // Only show explicitly true values
    return { name: AmenityNames[key], icon: AmenityIcons[key] };
  }).filter((val) => val !== null);
}

// Smart amenity display logic with nullable booleans
export function makeSmartAmenitiesArray(
  amenities: AmenitiesMap,
  spotType?: string
): {
  name?: string;
  icon?: string;
  priority?: "high" | "medium" | "low";
  isNegative?: boolean;
}[] {
  if (!amenities) return [];

  const result: {
    name?: string;
    icon?: string;
    priority?: "high" | "medium" | "low";
    isNegative?: boolean;
  }[] = [];

  // Handle indoor/outdoor - show what we know
  if (amenities.indoor === true && amenities.outdoor === true) {
    // Mixed indoor/outdoor spot
    result.push(
      {
        name: AmenityNames.indoor,
        icon: AmenityIcons.indoor,
        priority: "high",
      },
      {
        name: AmenityNames.outdoor,
        icon: AmenityIcons.outdoor,
        priority: "high",
      }
    );
  } else if (amenities.indoor === true) {
    result.push({
      name: AmenityNames.indoor,
      icon: AmenityIcons.indoor,
      priority: "high",
    });
  } else if (amenities.outdoor === true) {
    result.push({
      name: AmenityNames.outdoor,
      icon: AmenityIcons.outdoor,
      priority: "high",
    });
  }

  // Handle entry fee with context awareness
  if (amenities.entry_fee === true) {
    result.push({
      name: AmenityNames.entry_fee,
      icon: AmenityIcons.entry_fee,
      priority: "high",
      isNegative: true,
    });
  } else if (amenities.entry_fee === false) {
    // Only show "free entry" for spot types where fees are expected
    // const feeExpectedSpots = ["parkour gym", "gym", "commercial", "private"];
    // if (feeExpectedSpots.includes(spotType || "")) {
    result.push({
      name: AmenityNegativeNames.entry_fee,
      icon: AmenityNegativeIcons.entry_fee,
      priority: "medium",
      isNegative: false,
    });
    // }
  }

  // Handle other key amenities with context
  const contextSensitiveAmenities: (keyof AmenitiesMap)[] = [
    "wc",
    "drinking_water",
    "parking_on_site",
  ];

  contextSensitiveAmenities.forEach((amenityKey) => {
    const value = amenities[amenityKey];
    if (value === true) {
      result.push({
        name: AmenityNames[amenityKey],
        icon: AmenityIcons[amenityKey],
        priority: "medium",
      });
    } else if (value === false) {
      // Only show negative info where it's contextually relevant
      // const amenityExpectedSpots: Record<string, string[]> = {
      //   wc: ["parkour gym", "gym", "park", "playground"],
      //   drinking_water: ["parkour gym", "gym", "park", "playground"],
      //   parking_on_site: ["parkour gym", "gym", "commercial"],
      // };

      // if (amenityExpectedSpots[amenityKey]?.includes(spotType || "")) {
      result.push({
        name: AmenityNegativeNames[amenityKey],
        icon: AmenityNegativeIcons[amenityKey],
        priority: "low",
        isNegative: true,
      });
      // }
    }
  });

  // Add all other positive amenities
  const amenitiesToSkip = [
    "indoor",
    "outdoor",
    "entry_fee",
    "wc",
    "drinking_water",
    "parking_on_site",
    "maybe_overgrown",
  ];

  AmenitiesOrder.forEach((key) => {
    if (amenitiesToSkip.includes(key)) return;
    const value = amenities[key as keyof AmenitiesMap];
    if (value === true) {
      result.push({
        name: AmenityNames[key],
        icon: AmenityIcons[key],
        priority: "medium",
      });
    }
  });

  const negativeAmenitiesKeys: (keyof AmenitiesMap)[] = ["maybe_overgrown"];

  // Add negative amenities
  negativeAmenitiesKeys.forEach((key: keyof AmenitiesMap) => {
    if (amenities[key] !== true) return; // Only show explicitly true values
    result.push({
      name: AmenityNames[key],
      icon: AmenityIcons[key],
      priority: "low",
      isNegative: true,
    });
  });

  return result.filter((val) => val !== null);
}
