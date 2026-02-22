export enum SpotTypes {
  ParkourGym = "parkour gym",
  TrampolinePark = "trampoline park",
  GymnasticsGym = "gymnastics gym",
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
  Monument = "monument",
  Water = "water",
  Garage = "garage",
  SkatePark = "skate park",
  Calisthenics = "calisthenics",
  Other = "other",
}

export const SpotTypesNames: Record<SpotTypes, string> = {
  [SpotTypes.ParkourGym]: $localize`:@@spot-type.parkour-gym:Parkour Gym`,
  [SpotTypes.TrampolinePark]: $localize`:@@spot-type.trampoline-park:Trampoline Park`,
  [SpotTypes.GymnasticsGym]: $localize`:@@spot-type.gymnastics-gym:Gymnastics Gym`,
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
  [SpotTypes.Monument]: $localize`:@@spot-type.monument:Monument`,
  [SpotTypes.Water]: $localize`:@@spot-type.water:Water Spot`,
  [SpotTypes.Garage]: $localize`:@@spot-type.garage:Garage`,
  [SpotTypes.SkatePark]: $localize`:@@spot-type.skate-park:Skate Park`,
  [SpotTypes.Calisthenics]: $localize`:@@spot-type.calisthenics:Calisthenics Park`,
  [SpotTypes.Other]: $localize`:@@spot-type.other:Other`,
};

export const SpotTypesIcons: Record<SpotTypes, string> = {
  [SpotTypes.ParkourGym]: "fitness_center",
  [SpotTypes.TrampolinePark]: "falling",
  [SpotTypes.GymnasticsGym]: "sports_gymnastics",
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
  [SpotTypes.Monument]: "museum",
  [SpotTypes.Water]: "water",
  [SpotTypes.Garage]: "garage_door",
  [SpotTypes.SkatePark]: "skateboarding",
  [SpotTypes.Calisthenics]: "tools_ladder",
  [SpotTypes.Other]: "help",
};

export const SpotTypesDescriptions: Record<SpotTypes, string> = {
  [SpotTypes.ParkourGym]: $localize`:@@spot-type-description.parkour-gym:This spot is a dedicated indoor Parkour training facility with focused equipment and obstacles. Venue rules, hours, and required permission should be checked before training.`,
  [SpotTypes.TrampolinePark]: $localize`:@@spot-type-description.trampoline-park:This spot is a commercial trampoline-focused venue with aerial training areas. On-site safety rules, booking terms, and staff instructions apply.`,
  [SpotTypes.GymnasticsGym]: $localize`:@@spot-type-description.gymnastics-gym:This spot is a gymnastics-oriented facility where access and use may depend on supervision, classes, or permission.`,
  [SpotTypes.PkPark]: $localize`:@@spot-type-description.parkour-park:This spot is a purpose-built outdoor Parkour area designed for training. Posted rules and shared community use apply.`,
  [SpotTypes.Playground]: $localize`:@@spot-type-description.playground:This spot is a playground space that can support movement training. Child safety, shared use, and local guidance are especially important.`,
  [SpotTypes.School]: $localize`:@@spot-type-description.school:This spot is on school grounds or at an education facility where access can change by schedule and institutional rules.`,
  [SpotTypes.Park]: $localize`:@@spot-type-description.park:This spot is in a general park environment with mixed public use where local park regulations apply.`,
  [SpotTypes.UrbanLandscape]: $localize`:@@spot-type-description.urban-landscape:This spot is in a built city environment where pedestrian flow, nearby property boundaries, and local restrictions must be considered.`,
  [SpotTypes.NaturalLandscape]: $localize`:@@spot-type-description.natural-landscape:This spot is in a nature-based area where environmental impact should be minimized and seasonal or conservation restrictions may apply.`,
  [SpotTypes.UniversityCampus]: $localize`:@@spot-type-description.university-campus:This spot is on university or college grounds where some areas may be open while others require permission.`,
  [SpotTypes.Art]: $localize`:@@spot-type-description.art:This spot is an art or cultural structure where training may be possible. Respect, preservation, and site-specific rules are essential.`,
  [SpotTypes.Rooftop]: $localize`:@@spot-type-description.rooftop:This spot is in an elevated roof area with high access, safety, and legal risk where permission should be verified first.`,
  [SpotTypes.RoofGap]: $localize`:@@spot-type-description.roof-gap:This spot involves movement between separate elevated structures where access, safety, and legality must be clearly confirmed before training.`,
  [SpotTypes.Descent]: $localize`:@@spot-type-description.descent:This spot is mainly defined by descending movement where landings, exits, and public impact should be assessed beforehand.`,
  [SpotTypes.Monument]: $localize`:@@spot-type-description.monument:This spot is at a monument or heritage location where respectful behavior and cultural, legal, and preservation rules are essential.`,
  [SpotTypes.Water]: $localize`:@@spot-type-description.water:This spot is centered around water where conditions can change quickly and safety plus local restrictions must be verified on arrival.`,
  [SpotTypes.Garage]: $localize`:@@spot-type-description.garage:This spot is in a parking structure where vehicles, security policies, and time-based access limits need to be considered.`,
  [SpotTypes.SkatePark]: $localize`:@@spot-type-description.skate-park:This spot is a skate-focused shared facility where local etiquette and posted rules should be followed and right of way respected.`,
  [SpotTypes.Calisthenics]: $localize`:@@spot-type-description.calisthenics:This spot is a fitness-equipment area with shared-use expectations where equipment should be used respectfully and according to guidance.`,
  [SpotTypes.Other]: $localize`:@@spot-type-description.other:This spot does not fit listed categories. Specifics can be captured through amenities and the main spot description.`,
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
  [SpotAccess.Commercial]: $localize`:@@spot-access.commercial:Membership/Fee`,
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
  [SpotAccess.Public]: $localize`:@@spot-access-description.public:People usually can access this spot. Check signs, hours, and local rules when you arrive.`,
  [SpotAccess.Commercial]: $localize`:@@spot-access-description.commercial:You usually need to pay, book, or have a membership to use this spot. Follow staff and venue rules.`,
  [SpotAccess.Residential]: $localize`:@@spot-access-description.residential:This spot is in a residential area. Access may be limited if you are not a resident or guest.`,
  [SpotAccess.Private]: $localize`:@@spot-access-description.private:This spot is on private property. Ask for permission before training here.`,
  [SpotAccess.OffLimits]: $localize`:@@spot-access-description.off-limits:This spot should not be used unless you have clear permission from the owner or manager.`,
  [SpotAccess.Other]: $localize`:@@spot-access-description.other:Access is unclear for this spot. Check locally before training.`,
};

// Helper: parse arbitrary string to SpotTypes with fallback to Other
export function parseSpotType(raw?: string | null): SpotTypes {
  if (!raw) return SpotTypes.Other;
  const value = String(raw).trim().toLowerCase();
  // Build lookup of normalized enum values
  const typeMap: Record<string, SpotTypes> = Object.values(SpotTypes).reduce(
    (acc, v) => {
      acc[String(v).toLowerCase()] = v as SpotTypes;
      return acc;
    },
    {} as Record<string, SpotTypes>
  );
  // Backward-compatibility aliases (extend as needed)
  if (value === "memorial") return SpotTypes.Monument;
  return typeMap[value] ?? SpotTypes.Other;
}

// Helper: parse arbitrary string to SpotAccess with fallback to Other
export function parseSpotAccess(raw?: string | null): SpotAccess {
  if (!raw) return SpotAccess.Other;
  const value = String(raw).trim().toLowerCase();
  const accessMap: Record<string, SpotAccess> = Object.values(
    SpotAccess
  ).reduce((acc, v) => {
    acc[String(v).toLowerCase()] = v as SpotAccess;
    return acc;
  }, {} as Record<string, SpotAccess>);
  return accessMap[value] ?? SpotAccess.Other;
}
