import { SpotTypes, SpotAccess } from "../../../db/schemas/SpotTypeAndAccess";
import { AmenitiesMap } from "../../../db/schemas/Amenities";
import { Spot } from "../../../db/models/Spot";

/**
 * Enum for the different spot filter modes.
 * The values match the URL query parameter values for consistency.
 */
export enum SpotFilterMode {
  None = "none",
  ForParkour = "parkour",
  Dry = "dry",
  Indoor = "indoor",
  Lighting = "lighting",
  Water = "water",
  Custom = "custom",
}

/**
 * Configuration interface for spot filters.
 * Each filter mode has a complete definition of how to search and match spots.
 */
export interface SpotFilterConfig {
  /** The filter mode enum value */
  mode: SpotFilterMode;
  /** The string used in URL query parameters and chip selections */
  urlParam: string;
  /** Spot types to include in the search */
  types?: SpotTypes[];
  /** Spot access types to include in the search */
  accesses?: SpotAccess[];
  /** Amenities that must be true for the spot to match */
  amenities_true?: (keyof AmenitiesMap)[];
  /** Amenities that must be false for the spot to match */
  amenities_false?: (keyof AmenitiesMap)[];
  /** Function to determine if a loaded Spot object matches this filter */
  matchesSpot: (spot: Spot) => boolean;
  /** For custom mode, holds user-selected filter parameters (dynamic) */
  customParams?: {
    types?: SpotTypes[];
    accesses?: SpotAccess[];
    amenities_true?: (keyof AmenitiesMap)[];
    amenities_false?: (keyof AmenitiesMap)[];
  };
}

/**
 * Single source of truth for all spot filter configurations.
 * Add new filters here - they will automatically work in search and local matching.
 */
export const SPOT_FILTER_CONFIGS: Map<SpotFilterMode, SpotFilterConfig> =
  new Map([
    [
      SpotFilterMode.ForParkour,
      {
        mode: SpotFilterMode.ForParkour,
        urlParam: "parkour",
        types: [SpotTypes.ParkourGym, SpotTypes.PkPark],
        matchesSpot: (spot: Spot) => {
          const parkourTypes = [SpotTypes.ParkourGym, SpotTypes.PkPark];
          return parkourTypes.includes(spot.type());
        },
      },
    ],
    [
      SpotFilterMode.Dry,
      {
        mode: SpotFilterMode.Dry,
        urlParam: "dry",
        types: [
          SpotTypes.ParkourGym,
          SpotTypes.Garage,
          SpotTypes.GymnasticsGym,
          SpotTypes.TrampolinePark,
        ],
        amenities_true: ["covered", "indoor"],
        matchesSpot: (spot: Spot) => {
          const amenities = spot.amenities() ?? {};
          return !!(amenities.covered || amenities.indoor);
        },
      },
    ],
    [
      SpotFilterMode.Indoor,
      {
        mode: SpotFilterMode.Indoor,
        urlParam: "indoor",
        types: [
          SpotTypes.ParkourGym,
          SpotTypes.GymnasticsGym,
          SpotTypes.TrampolinePark,
        ],
        amenities_true: ["indoor"],
        matchesSpot: (spot: Spot) => {
          const amenities = spot.amenities() ?? {};
          return !!amenities.indoor;
        },
      },
    ],
    [
      SpotFilterMode.Lighting,
      {
        mode: SpotFilterMode.Lighting,
        urlParam: "lighting",
        types: [],
        amenities_true: ["lighting"],
        matchesSpot: (spot: Spot) => {
          const amenities = spot.amenities() ?? {};
          return !!amenities.lighting;
        },
      },
    ],
    [
      SpotFilterMode.Water,
      {
        mode: SpotFilterMode.Water,
        urlParam: "water",
        types: [SpotTypes.Water],
        amenities_true: ["water_feature"],
        matchesSpot: (spot: Spot) => {
          const amenities = spot.amenities() ?? {};
          return !!amenities.water_feature;
        },
      },
    ],
  ]);

/**
 * Get the filter mode from a URL query parameter value.
 * Returns SpotFilterMode.None if the param doesn't match any filter.
 */
export function getFilterModeFromUrlParam(
  param: string | null | undefined
): SpotFilterMode {
  if (!param) return SpotFilterMode.None;
  for (const [mode, config] of SPOT_FILTER_CONFIGS) {
    if (config.urlParam === param) return mode;
  }
  return SpotFilterMode.None;
}

/**
 * Get the URL query parameter value from a filter mode.
 * Returns empty string for SpotFilterMode.None.
 */
export function getUrlParamFromFilterMode(mode: SpotFilterMode): string {
  if (mode === SpotFilterMode.None) return "";
  return SPOT_FILTER_CONFIGS.get(mode)?.urlParam ?? "";
}

/**
 * Get the filter config for a given mode.
 * Returns undefined for SpotFilterMode.None.
 */
export function getFilterConfig(
  mode: SpotFilterMode
): SpotFilterConfig | undefined {
  return SPOT_FILTER_CONFIGS.get(mode);
}
