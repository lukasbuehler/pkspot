/**
 * Badge Definitions
 *
 * Central configuration for all badge categories and tiers.
 * Tier 5 is the rarest/most prestigious, Tier 1 is the most common.
 */

export interface BadgeTier {
  tier: 1 | 2 | 3 | 4 | 5;
  id: string;
  name: string;
  threshold?: number; // For stat-based badges
  maxSignup?: number; // For early adopter badges
}

export interface BadgeCategory {
  id: string;
  name: string;
  /** One line under the name in the badge dialog. */
  description: string;
  iconPrefix: string; // e.g. "early_" -> "early_5.svg" for tier 5
  stat?: keyof import("../../db/schemas/UserSchema").UserSchema; // For stat-based
  tiers: BadgeTier[];
}

/** One level of a category, as shown in the badge dialog. */
export interface BadgeTierProgress {
  tier: BadgeTier["tier"];
  id: string;
  name: string;
  icon: string;
  earned: boolean;
  /** Stat threshold, or the highest signup number for early adopter levels. */
  requirement: number;
}

/** How far a user is through one badge category. */
export interface BadgeCategoryProgress {
  category: BadgeCategory;
  /** The stat value, or the signup number for early adopter badges. */
  value: number | null;
  /** Levels from 1 to 5. */
  tiers: BadgeTierProgress[];
  /** The highest level earned, or 0. */
  earnedTier: number;
  /** The next level to earn. Always null for early adopter badges. */
  next: BadgeTierProgress | null;
  /** Progress towards `next` from 0 to 100; 100 when every level is earned. */
  percent: number;
}

export interface Badge {
  id: string;
  name: string;
  icon: string;
  tier: 1 | 2 | 3 | 4 | 5;
  category: string;
}

/**
 * All badge categories with their tier definitions.
 * Ordered by tier from highest (5) to lowest (1).
 */
export const BADGE_CATEGORIES: BadgeCategory[] = [
  {
    id: "early_adopter",
    name: $localize`:@@badges.category.early_adopter.name:Early Adopter`,
    description: $localize`:@@badges.category.early_adopter.description:One of the first people to join PK Spot.`,
    iconPrefix: "early_",
    tiers: [
      { tier: 5, id: "founder", name: $localize`Founder`, maxSignup: 100 },
      { tier: 4, id: "pioneer", name: $localize`Pioneer`, maxSignup: 250 },
      {
        tier: 3,
        id: "early_adopter",
        name: $localize`Early Adopter`,
        maxSignup: 500,
      },
      {
        tier: 2,
        id: "early_bird",
        name: $localize`Early Bird`,
        maxSignup: 1000,
      },
      { tier: 1, id: "supporter", name: $localize`Supporter`, maxSignup: 2500 },
    ],
  },
  {
    id: "spots_created",
    name: $localize`:@@badges.category.spots_created.name:Spot Creator`,
    description: $localize`:@@badges.category.spots_created.description:Adds new Spots to the map.`,
    iconPrefix: "spot_",
    stat: "spot_creates_count",
    tiers: [
      {
        tier: 5,
        id: "cartographer",
        name: $localize`Cartographer`,
        threshold: 100,
      },
      { tier: 4, id: "explorer", name: $localize`Explorer`, threshold: 50 },
      {
        tier: 3,
        id: "trailblazer",
        name: $localize`Trailblazer`,
        threshold: 20,
      },
      { tier: 2, id: "pathfinder", name: $localize`Pathfinder`, threshold: 5 },
      { tier: 1, id: "pioneer_spot", name: $localize`Pioneer`, threshold: 1 },
    ],
  },
  {
    id: "spots_edited",
    name: $localize`:@@badges.category.spots_edited.name:Spot Editor`,
    description: $localize`:@@badges.category.spots_edited.description:Keeps Spot details up to date.`,
    iconPrefix: "update_",
    stat: "spot_edits_count",
    tiers: [
      { tier: 5, id: "architect", name: $localize`Architect`, threshold: 500 },
      { tier: 4, id: "curator", name: $localize`Curator`, threshold: 100 },
      {
        tier: 3,
        id: "contributor",
        name: $localize`Contributor`,
        threshold: 50,
      },
      { tier: 2, id: "helper", name: $localize`Helper`, threshold: 20 },
      { tier: 1, id: "editor", name: $localize`Editor`, threshold: 5 },
    ],
  },
  {
    id: "media_added",
    name: $localize`:@@badges.category.media_added.name:Media Contributor`,
    description: $localize`:@@badges.category.media_added.description:Adds photos and videos to Spots.`,
    iconPrefix: "media_",
    stat: "media_added_count",
    tiers: [
      { tier: 5, id: "filmmaker", name: $localize`Filmmaker`, threshold: 200 },
      {
        tier: 4,
        id: "photographer",
        name: $localize`Photographer`,
        threshold: 100,
      },
      { tier: 3, id: "documenter", name: $localize`Documenter`, threshold: 50 },
      { tier: 2, id: "snapper", name: $localize`Snapper`, threshold: 10 },
      { tier: 1, id: "shutterbug", name: $localize`Shutterbug`, threshold: 1 },
    ],
  },
];

/**
 * Special badges that are manually granted (not computed from stats).
 * These are stored in user.special_badges array.
 */
export const SPECIAL_BADGES: Record<string, Badge> = {
  // beta_tester: {
  //   id: "beta_tester",
  //   name: "Beta Tester",
  //   icon: "assets/badges/early_3.svg",
  //   tier: 3,
  //   category: "special",
  // },
  // Add event badges here as needed
  // swissjam_25: { ... }
};
