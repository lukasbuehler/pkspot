import { Injectable } from "@angular/core";
import { UserSchema } from "../../db/schemas/UserSchema";
import {
  Badge,
  BadgeCategory,
  BADGE_CATEGORIES,
  SPECIAL_BADGES,
} from "../shared/badge-definitions";

@Injectable({
  providedIn: "root",
})
export class BadgeService {
  /**
   * Get all badges earned by a user.
   * This includes stat-based badges, early adopter badges, and special badges.
   */
  getAllBadgesForUser(userData: UserSchema | null | undefined): Badge[] {
    if (!userData) return [];

    const earned: Badge[] = [];

    // Early adopter badge (based on signup_number)
    const earlyAdopterBadge = this.getEarlyAdopterBadge(userData.signup_number);
    if (earlyAdopterBadge) earned.push(earlyAdopterBadge);

    // Stat-based badges
    earned.push(...this.getStatBadges(userData));

    // Special badges stored on profile
    if (userData.special_badges) {
      for (const badgeId of userData.special_badges) {
        const special = SPECIAL_BADGES[badgeId];
        if (special) earned.push(special);
      }
    }

    return earned;
  }

  /**
   * Get display badges - filters to best per category and applies pinned order.
   */
  getDisplayBadges(userData: UserSchema | null | undefined): Badge[] {
    const all = this.getAllBadgesForUser(userData);
    const filtered = this.filterBestPerCategory(all);

    // Apply pinned order if set
    if (userData?.pinned_badges && userData.pinned_badges.length > 0) {
      return this.sortByPinnedOrder(filtered, userData.pinned_badges);
    }

    // Default: sort by tier (highest first)
    return filtered.sort((a, b) => b.tier - a.tier);
  }

  /**
   * Get the early adopter badge based on signup number.
   */
  private getEarlyAdopterBadge(signupNumber?: number): Badge | null {
    if (!signupNumber) return null;

    const category = BADGE_CATEGORIES.find((c) => c.id === "early_adopter");
    if (!category) return null;

    // Find the highest tier badge the user qualifies for
    for (const tier of category.tiers) {
      if (tier.maxSignup && signupNumber <= tier.maxSignup) {
        return {
          id: tier.id,
          name: tier.name,
          icon: `assets/badges/${category.iconPrefix}${tier.tier}.png`,
          tier: tier.tier,
          category: category.id,
        };
      }
    }

    return null;
  }

  /**
   * Get all stat-based badges the user has earned.
   */
  private getStatBadges(userData: UserSchema): Badge[] {
    const badges: Badge[] = [];

    for (const category of BADGE_CATEGORIES) {
      if (!category.stat) continue;

      const statValue = (userData[category.stat] as number) || 0;

      // Find the highest tier the user qualifies for
      for (const tier of category.tiers) {
        if (tier.threshold && statValue >= tier.threshold) {
          badges.push({
            id: tier.id,
            name: tier.name,
            icon: `/assets/badges/${category.iconPrefix}${tier.tier}.png`,
            tier: tier.tier,
            category: category.id,
          });
          break; // Only take the highest tier per category
        }
      }
    }

    return badges;
  }

  /**
   * Filter to only the best (highest tier) badge per category.
   */
  private filterBestPerCategory(badges: Badge[]): Badge[] {
    const bestByCategory = new Map<string, Badge>();

    for (const badge of badges) {
      const existing = bestByCategory.get(badge.category);
      if (!existing || badge.tier > existing.tier) {
        bestByCategory.set(badge.category, badge);
      }
    }

    return Array.from(bestByCategory.values());
  }

  /**
   * Sort badges by pinned order, with pinned badges first.
   */
  private sortByPinnedOrder(badges: Badge[], pinnedIds: string[]): Badge[] {
    return badges.sort((a, b) => {
      const aIndex = pinnedIds.indexOf(a.id);
      const bIndex = pinnedIds.indexOf(b.id);

      // Both pinned: sort by pinned order
      if (aIndex >= 0 && bIndex >= 0) return aIndex - bIndex;
      // Only a is pinned: a comes first
      if (aIndex >= 0) return -1;
      // Only b is pinned: b comes first
      if (bIndex >= 0) return 1;
      // Neither pinned: sort by tier
      return b.tier - a.tier;
    });
  }

  /**
   * Get all badge categories (for settings/badge picker UI).
   */
  getCategories(): BadgeCategory[] {
    return BADGE_CATEGORIES;
  }
}
