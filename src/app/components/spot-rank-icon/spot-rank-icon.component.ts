import { ChangeDetectionStrategy, Component, computed, input } from "@angular/core";
import { MatIconModule } from "@angular/material/icon";

export type SpotRankTier = "gold" | "silver" | "bronze" | "other";

/** Icon for a private monthly Spot rank: trophy, medals, then a leaderboard. */
export function spotRankTier(rank: number): SpotRankTier {
  if (rank === 1) return "gold";
  if (rank === 2) return "silver";
  if (rank === 3) return "bronze";
  return "other";
}

@Component({
  selector: "app-spot-rank-icon",
  imports: [MatIconModule],
  templateUrl: "./spot-rank-icon.component.html",
  styleUrl: "./spot-rank-icon.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SpotRankIconComponent {
  readonly rank = input.required<number>();
  readonly tier = computed(() => spotRankTier(this.rank()));
  readonly icon = computed(() => {
    const tier = this.tier();
    if (tier === "gold") return "trophy";
    return tier === "other" ? "leaderboard" : "military_tech";
  });
}
