import e from "express";

export enum SpotTypes {
  Gym = "parkour gym",
  PkPark = "parkour park",
  Playground = `playground`,
  School = "school",
  Park = "park",
  UrbanLandscape = "urban landscape",
  NaturalLandscape = "natural landscape",
  UniversityCampus = "university campus",
  Art = "art",
  Rooftop = "rooftop",
  RoofGap = "roof gap",
  Descent = "descent",
  Other = "other",
}

export const SpotTypesNames: Record<SpotTypes, string> = {
  [SpotTypes.Gym]: $localize`:@@spot-type.parkour-gym:Parkour Gym`,
  [SpotTypes.PkPark]: $localize`:@@spot-type.parkour-park:Parkour Park`,
  [SpotTypes.Playground]: $localize`:@@spot-type.playground:Playground`,
  [SpotTypes.School]: $localize`:@@spot-type.school:School`,
  [SpotTypes.Park]: $localize`:@@spot-type.park:Park`,
  [SpotTypes.UrbanLandscape]: $localize`:@@spot-type.urban-landscape:Urban Landscape`,
  [SpotTypes.NaturalLandscape]: $localize`:@@spot-type.natural-landscape:Natural Landscape`,
  [SpotTypes.UniversityCampus]: $localize`:@@spot-type.university-campus:University Campus`,
  [SpotTypes.Art]: $localize`:@@spot-type.art:Art`,
  [SpotTypes.Rooftop]: $localize`:@@spot-type.rooftop:Rooftop`,
  [SpotTypes.RoofGap]: $localize`:@@spot-type.roof-gap:Roof Gap`,
  [SpotTypes.Descent]: $localize`:@@spot-type.descent:Descent`,
  [SpotTypes.Other]: $localize`:@@spot-type.other:Other`,
};

export const SpotTypesIcons: Record<SpotTypes, string> = {
  [SpotTypes.Gym]: "fitness_center",
  [SpotTypes.PkPark]: "castle",
  [SpotTypes.Playground]: "child_care",
  [SpotTypes.School]: "school",
  [SpotTypes.Park]: "park",
  [SpotTypes.UrbanLandscape]: "location_city",
  [SpotTypes.NaturalLandscape]: "nature",
  [SpotTypes.UniversityCampus]: "school",
  [SpotTypes.Art]: "palette",
  [SpotTypes.Rooftop]: "roofing",
  [SpotTypes.RoofGap]: "space_bar",
  [SpotTypes.Descent]: "arrow_downward",
  [SpotTypes.Other]: "help_outline",
};

export const SpotTypesDescriptions: Record<SpotTypes, string> = {
  [SpotTypes.Gym]: $localize`:@@spot-type-description.parkour-gym:This is an indoor training facility with dedicated equipment and obstacles for Parkour practice.`,
  [SpotTypes.PkPark]: $localize`:@@spot-type-description.parkour-park:This is a purpose-built outdoor space with designed obstacles and structures for Parkour training.`,
  [SpotTypes.Playground]: $localize`:@@spot-type-description.playground:This is a playground area with swings, slides, and climbing structures suitable for Parkour training.`,
  [SpotTypes.School]: $localize`:@@spot-type-description.school:This is a school facility with walls, benches, and architectural features for practice.`,
  [SpotTypes.Park]: $localize`:@@spot-type-description.park:This is a public park with paths, benches, and landscaping features.`,
  [SpotTypes.UrbanLandscape]: $localize`:@@spot-type-description.urban-landscape:This is an urban area with walls, railings, stairs, and architectural elements.`,
  [SpotTypes.NaturalLandscape]: $localize`:@@spot-type-description.natural-landscape:This is a natural area with trees, rocks, logs, and terrain features.`,
  [SpotTypes.UniversityCampus]: $localize`:@@spot-type-description.university-campus:This is a university campus with varied buildings, courtyards, and outdoor structures.`,
  [SpotTypes.Art]: $localize`:@@spot-type-description.art:This is an art installation or sculpture that can be used for Parkour practice. Please respect the artwork and surrounding area.`,
  [SpotTypes.Rooftop]: $localize`:@@spot-type-description.rooftop:This is a rooftop area with ledges, walls, and elevated structures.`,
  [SpotTypes.RoofGap]: $localize`:@@spot-type-description.roof-gap:This is a roof gap requiring precision jumping between buildings.`,
  [SpotTypes.Descent]: $localize`:@@spot-type-description.descent:This is a spot primarily used for descending techniques.`,
  [SpotTypes.Other]: $localize`:@@spot-type-description.other:This is a location that doesn't fit standard categories but offers training opportunities.`,
};

export enum SpotAccess {
  Public = "public",
  Commercial = "commercial",
  Residential = "residential",
  Private = "private",
  OffLimits = "off-limits",
  Other = "other",
}

export const SpotAccessNames: Record<SpotAccess, string> = {
  [SpotAccess.Public]: $localize`:@@spot-access.public:Public`,
  [SpotAccess.Commercial]: $localize`:@@spot-access.commercial:Business`,
  [SpotAccess.Residential]: $localize`:@@spot-access.residential:Residential`,
  [SpotAccess.Private]: $localize`:@@spot-access.private:Private`,
  [SpotAccess.OffLimits]: $localize`:@@spot-access.off-limits:Off-Limits`,
  [SpotAccess.Other]: $localize`:@@spot-access.other:Other`,
};

export const SpotAccessIcons: Record<SpotAccess, string> = {
  [SpotAccess.Public]: "public",
  [SpotAccess.Commercial]: "paid",
  [SpotAccess.Residential]: "home",
  [SpotAccess.Private]: "lock",
  [SpotAccess.OffLimits]: "do_not_disturb",
  [SpotAccess.Other]: "help_outline",
};

export const SpotAccessDescriptions: Record<SpotAccess, string> = {
  [SpotAccess.Public]: $localize`:@@spot-access-description.public:This is a public spot, which is open to everyone and can be accessed freely without restrictions.`,
  [SpotAccess.Commercial]: $localize`:@@spot-access-description.commercial:This is a commercial property, such as a gym or business, where access may require a fee or membership. Please respect the rules and hours of operation.`,
  [SpotAccess.Residential]: $localize`:@@spot-access-description.residential:This is a residential area and private property. Access is generally limited to residents or their guests. Please be especially mindful of noise and privacy. Training here may lead to being asked to leave.`,
  [SpotAccess.Private]: $localize`:@@spot-access-description.private:This is private property. While some respectful practice may be tolerated, permission is always recommended to avoid issues.`,
  [SpotAccess.OffLimits]: $localize`:@@spot-access-description.off-limits:This is private property and strictly off-limits without explicit, prior permission from the owner. Unauthorized access may result in legal action or injury.`,
  [SpotAccess.Other]: $localize`:@@spot-access-description.other:The access type of this spot is not specified. Please check local regulations and guidelines before visiting.`,
};
