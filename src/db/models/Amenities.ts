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

  // Derive a simple environment classification from amenity booleans
  type Env = "indoor" | "outdoor" | "both" | "unknown";
  const env: Env = (() => {
    const ind = amenities.indoor === true;
    const out = amenities.outdoor === true;
    if (ind && out) return "both";
    if (ind) return "indoor";
    if (out) return "outdoor";
    return "unknown";
  })();

  // Handle indoor/outdoor - show what we know
  if (amenities.indoor === true && amenities.outdoor === true) {
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

  // Entry fee
  if (amenities.entry_fee === true) {
    result.push({
      name: AmenityNames.entry_fee,
      icon: AmenityIcons.entry_fee,
      priority: "high",
      isNegative: true,
    });
  } else if (amenities.entry_fee === false) {
    if (env === "indoor" || env === "both") {
      result.push({
        name: AmenityNegativeNames.entry_fee,
        icon: AmenityNegativeIcons.entry_fee,
        priority: "medium",
        isNegative: false,
      });
    }
  }

  // Context-aware amenities
  const contextSensitiveAmenities: (keyof AmenitiesMap)[] = [
    "wc",
    "drinking_water",
    "parking_on_site",
    "lighting",
    "power_outlets",
    "changing_room",
    "lockers",
    "heated",
    "ac",
  ];

  contextSensitiveAmenities.forEach((key) => {
    const value = amenities[key];
    if (value === true) {
      result.push({
        name: AmenityNames[key],
        icon: AmenityIcons[key],
        priority: "medium",
      });
    } else if (value === false) {
      let negativeRelevant = true;

      // Hide negatives not expected in outdoor-only spots
      if (env === "outdoor") {
        if (
          key === "wc" ||
          key === "drinking_water" ||
          key === "power_outlets" ||
          key === "changing_room" ||
          key === "lockers" ||
          key === "heated" ||
          key === "ac"
        ) {
          negativeRelevant = false;
        }
      }

      // For unknown env, treat wc/drinking_water negatives as not very informative
      if (env === "unknown" && (key === "wc" || key === "drinking_water")) {
        negativeRelevant = false;
      }

      // Parking negative is always relevant
      if (key === "parking_on_site") {
        negativeRelevant = true;
      }

      if (negativeRelevant) {
        result.push({
          name: AmenityNegativeNames[key],
          icon: AmenityNegativeIcons[key],
          priority: "low",
          isNegative: true,
        });
      }
    }
  });

  // Add all other positive amenities
  const skip: (keyof AmenitiesMap)[] = [
    "indoor",
    "outdoor",
    "entry_fee",
    "wc",
    "drinking_water",
    "parking_on_site",
    "lighting",
    "power_outlets",
    "changing_room",
    "lockers",
    "heated",
    "ac",
    "maybe_overgrown",
  ];

  AmenitiesOrder.forEach((key) => {
    if ((skip as string[]).includes(key)) return;
    const value = amenities[key as keyof AmenitiesMap];
    if (value === true) {
      result.push({
        name: AmenityNames[key],
        icon: AmenityIcons[key],
        priority: "medium",
      });
    }
  });

  // Negative amenities that are signal-worthy regardless of env
  const negativeAmenitiesKeys: (keyof AmenitiesMap)[] = ["maybe_overgrown"];
  negativeAmenitiesKeys.forEach((key) => {
    if (amenities[key] !== true) return;
    result.push({
      name: AmenityNames[key],
      icon: AmenityIcons[key],
      priority: "low",
      isNegative: true,
    });
  });

  return result.filter((val) => val !== null);
}

// ---- Centralized amenity questions config for edit flow ----
export type QuestionValue = string;
export interface QuestionOption {
  value: QuestionValue;
  label: string; // localized label
  icon?: string; // material icon name
  apply: (amenities: AmenitiesMap) => AmenitiesMap; // returns updated amenities
}

export interface AmenityQuestion {
  id: string;
  text: string; // localized question text
  options: QuestionOption[];
  // Determine if this question should be asked for the current state
  isApplicable: (amenities: AmenitiesMap) => boolean;
  // Determine if this question has already been answered
  isAnswered: (amenities: AmenitiesMap) => boolean;
  // Current selected value resolver for UI binding
  getValue: (amenities: AmenitiesMap) => QuestionValue | null;
}

export const AmenityQuestions: AmenityQuestion[] = [
  {
    id: "environment",
    text: $localize`:@@question.environment:Is this an indoor or outdoor spot?`,
    options: [
      {
        value: "indoor",
        label: $localize`:@@question.environment.indoor:Indoor`,
        icon: AmenityIcons.indoor,
        apply: (a) => ({
          ...(a ?? {}),
          indoor: true,
          outdoor: false,
        }),
      },
      {
        value: "outdoor",
        label: $localize`:@@question.environment.outdoor:Outdoor`,
        icon: AmenityIcons.outdoor,
        apply: (a) => ({
          ...(a ?? {}),
          indoor: false,
          outdoor: true,
        }),
      },
      {
        value: "both",
        label: $localize`:@@question.environment.both:Both`,
        icon: "home_and_garden", // shown with two icons in UI if desired
        apply: (a) => ({
          ...(a ?? {}),
          indoor: true,
          outdoor: true,
        }),
      },
      {
        value: "unknown",
        label: $localize`:@@generic.not_sure:Not sure`,
        apply: (a) => ({
          ...(a ?? {}),
          indoor: null,
          outdoor: null,
        }),
      },
    ],
    isApplicable: () => true,
    // Consider answered once either indoor or outdoor is set at all (undefined -> set). Null counts as answered (user chose Not sure).
    isAnswered: (a) => a?.indoor !== undefined || a?.outdoor !== undefined,
    getValue: (a) => {
      const ind = a?.indoor ?? null;
      const out = a?.outdoor ?? null;
      if (ind === true && out === true) return "both";
      if (ind === true) return "indoor";
      if (out === true) return "outdoor";
      return "unknown";
    },
  },
  {
    id: "covered",
    text: $localize`:@@question.covered:Is the area covered?`,
    options: [
      {
        value: "covered",
        label: $localize`:@@amenities.covered:Covered`,
        icon: AmenityIcons.covered,
        apply: (a) => ({ ...(a ?? {}), covered: true }),
      },
      {
        value: "not_covered",
        label: $localize`:@@amenities.not_covered:Not covered`,
        icon: AmenityNegativeIcons.covered,
        apply: (a) => ({ ...(a ?? {}), covered: false }),
      },
      {
        value: "unknown",
        label: $localize`:@@generic.not_sure:Not sure`,
        apply: (a) => ({ ...(a ?? {}), covered: null }),
      },
    ],
    // Ask only when the environment is outdoor or unknown
    isApplicable: (a) => {
      const indTrue = a?.indoor === true;
      const outTrue = a?.outdoor === true;
      return outTrue || (!indTrue && !outTrue);
    },
    isAnswered: (a) => a?.covered !== null && a?.covered !== undefined,
    getValue: (a) => {
      const c = a?.covered ?? null;
      if (c === true) return "covered";
      if (c === false) return "not_covered";
      return "unknown";
    },
  },
];
