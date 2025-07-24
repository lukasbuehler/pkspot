export interface AmenitiesMap {
  // Nullable booleans - true = has it, false = explicitly doesn't have it, null/undefined = unknown
  entry_fee?: boolean | null;
  indoor?: boolean | null;
  outdoor?: boolean | null;
  covered?: boolean | null;
  lighting?: boolean | null;
  wc?: boolean | null;
  changing_room?: boolean | null;
  lockers?: boolean | null;
  heated?: boolean | null;
  ac?: boolean | null;
  drinking_water?: boolean | null;
  parking_on_site?: boolean | null;
  power_outlets?: boolean | null;
  maybe_overgrown?: boolean | null;
  water_feature?: boolean | null;
}

export const AmenitiesOrder = [
  "indoor",
  "outdoor",
  "covered",
  "lighting",
  "wc",
  "changing_room",
  "lockers",
  "heated",
  "ac",
  "drinking_water",
  "parking_on_site",
  "power_outlets",
  "maybe_overgrown",
  "water_feature",
  "entry_fee",
] as (keyof AmenitiesMap)[];

export const IndoorAmenities = [
  "changing_room",
  "lockers",
  "power_outlets",
  "heated",
  "ac",
] as (keyof AmenitiesMap)[];

export const GeneralAmenities = [
  "entry_fee",
  "wc",
  "drinking_water",
  "parking_on_site",
] as (keyof AmenitiesMap)[];

export const OutdoorAmenities = [
  "covered",
  "lighting",
  "maybe_overgrown",
  "water_feature",
] as (keyof AmenitiesMap)[];

export const AmenityIcons: { [key in keyof AmenitiesMap]: string } = {
  covered: "roofing",
  outdoor: "nature_people",
  indoor: "home",
  lighting: "lightbulb",
  wc: "wc",
  changing_room: "checkroom",
  heated: "thermostat",
  ac: "ac_unit",
  lockers: "lock",
  entry_fee: "paid",
  drinking_water: "water_full",
  parking_on_site: "local_parking",
  power_outlets: "power",
  maybe_overgrown: "grass",
  water_feature: "water",
};

// Icons for negative states
export const AmenityNegativeIcons: { [key in keyof AmenitiesMap]: string } = {
  covered: "umbrella",
  outdoor: "macro_off",
  indoor: "no_meeting_room",
  lighting: "flashlight_off",
  wc: "block",
  changing_room: "block",
  heated: "severe_cold",
  ac: "mode_fan_off",
  lockers: "block",
  entry_fee: "money_off",
  drinking_water: "format_color_reset",
  parking_on_site: "car_crash",
  power_outlets: "power_off",
  maybe_overgrown: "yard",
  water_feature: "block",
};
