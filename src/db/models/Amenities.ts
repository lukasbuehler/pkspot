import { AmenitiesMap } from "../schemas/Amenities";

export const AmenityNames: { [key in keyof AmenitiesMap]: string } = {
  covered: $localize`:@@amenities.covered:Covered area`,
  outdoor: $localize`:@@amenities.outdoor:Outdoor area`,
  indoor: $localize`:@@amenities.indoor:Indoor area`,
  lighting: $localize`:@@amenities.lighting:Lighting`,
  wc: $localize`:@@amenities.wc:WC`, // WC on site
  changing_room: $localize`:@@amenities.changing_room:Changing room`,
  lockers: $localize`:@@amenities.lockers:Lockers`,
  heated: $localize`:@@amenities.heated:Heated`,
  ac: $localize`:@@amenities.ac:Air conditioning`,
  entry_fee: $localize`:@@amenities.entry_fee:Entry fee`,
  drinking_water: $localize`:@@amenities.drinking_water:Drinking water`,
  parking_on_site: $localize`:@@amenities.parking_on_site:Parking on site`,
  power_outlets: $localize`:@@amenities.power_outlets:Power outlets`,
  maybe_overgrown: $localize`:@@amenities.maybe_overgrown:Possibly overgrown`,
  water_feature: $localize`:@@amenities.water_feature:Water feature`,
};
