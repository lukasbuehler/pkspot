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
  description: string;
  iconPrefix: string; // e.g., 'early_' -> 'early_5.png' for tier 5
  stat?: keyof import("../../db/schemas/UserSchema").UserSchema; // For stat-based
  tiers: BadgeTier[];
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
    name: "Early Adopter",
    description: "Joined PK Spot early",
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
    name: "Spot Creator",
    description: "Created spots on the map",
    iconPrefix: "spot_", // Reusing early_ icons for now
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
    name: "Spot Editor",
    description: "Made edits to spots",
    iconPrefix: "update_",
    stat: "spot_edits_count",
    tiers: [
      { tier: 5, id: "architect", name: "Architect", threshold: 500 },
      { tier: 4, id: "curator", name: "Curator", threshold: 100 },
      { tier: 3, id: "contributor", name: "Contributor", threshold: 50 },
      { tier: 2, id: "helper", name: "Helper", threshold: 20 },
      { tier: 1, id: "editor", name: "Editor", threshold: 5 },
    ],
  },
  {
    id: "media_added",
    name: "Media Contributor",
    description: "Added photos and videos",
    iconPrefix: "media_",
    stat: "media_added_count",
    tiers: [
      { tier: 5, id: "filmmaker", name: "Filmmaker", threshold: 200 },
      { tier: 4, id: "photographer", name: "Photographer", threshold: 100 },
      { tier: 3, id: "documenter", name: "Documenter", threshold: 50 },
      { tier: 2, id: "snapper", name: "Snapper", threshold: 10 },
      { tier: 1, id: "shutterbug", name: "Shutterbug", threshold: 1 },
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
  //   icon: "assets/badges/early_3.png",
  //   tier: 3,
  //   category: "special",
  // },
  // Add event badges here as needed
  // swissjam_25: { ... }
};
