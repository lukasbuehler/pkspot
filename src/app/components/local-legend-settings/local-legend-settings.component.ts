import { ChangeDetectionStrategy, Component, computed, inject, resource, signal } from "@angular/core";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { MatListModule } from "@angular/material/list";
import { MatSlideToggleModule } from "@angular/material/slide-toggle";
import { MatSnackBar } from "@angular/material/snack-bar";
import { localDateKey, openRankMonths } from "../../../db/utils/training-summary";
import { DateTimeFormatService } from "../../services/date-time-format.service";
import { TrainingSummaryService } from "../../services/firebase/firestore/training-summary.service";
import { LocalLegendService } from "../../services/local-legend.service";
import { spotRankLabel } from "../../features/spot-rank";
import { SpotRankIconComponent } from "../spot-rank-icon/spot-rank-icon.component";

interface RankHistoryEntry {
  key: string;
  month: string;
  monthLabel: string;
  spotId: string;
  spotName: string;
  rank: number;
  label: string;
}

/**
 * Local Legend participation and the person's own rank history. Turning it
 * off stops comparisons and hides ranks; past ranks stay private and return
 * when it is turned on again. Finished months can be removed one by one.
 */
@Component({
  selector: "app-local-legend-settings",
  imports: [MatButtonModule, MatIconModule, MatListModule, MatSlideToggleModule, SpotRankIconComponent],
  templateUrl: "./local-legend-settings.component.html",
  styleUrl: "./local-legend-settings.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LocalLegendSettingsComponent {
  readonly localLegend = inject(LocalLegendService);
  private readonly summaries = inject(TrainingSummaryService);
  private readonly dateTime = inject(DateTimeFormatService);
  private readonly snackbar = inject(MatSnackBar);

  /** The entry waiting for confirmation before it is removed. */
  readonly confirming = signal<string | null>(null);
  readonly removing = signal<string | null>(null);

  private readonly history = resource({
    params: () => this.localLegend.enabled() ? { on: true } : undefined,
    loader: async () => {
      const [ranks, months] = await Promise.all([this.summaries.listMyRanks(), this.summaries.listMyMonths()]);
      return { ranks, months };
    },
  });

  /** Finished months only; the open month still changes every night. */
  readonly entries = computed<RankHistoryEntry[]>(() => {
    const value = this.history.value();
    if (!value) return [];
    const open = new Set(openRankMonths(localDateKey(Date.now(), "Europe/Zurich")));
    const names = new Map(value.months.flatMap((month) =>
      Object.entries(month.spots).map(([spotId, spot]) => [`${month.month}/${spotId}`, spot.name])));
    return value.ranks
      .filter((month) => !open.has(month.month))
      .flatMap((month) => Object.entries(month.spots).flatMap(([spotId, spot]) => {
        if (spot.status !== "ranked" || !spot.rank) return [];
        const [year, monthNumber] = month.month.split("-").map(Number);
        return [{
          key: `${month.month}/${spotId}`,
          month: month.month,
          monthLabel: this.dateTime.format(new Date(year, monthNumber - 1, 15), { month: "long", year: "numeric" }),
          spotId,
          spotName: names.get(`${month.month}/${spotId}`) ?? $localize`:@@trainingStats.unnamedSpot:Spot`,
          rank: spot.rank,
          label: spotRankLabel({ kind: "ranked", rank: spot.rank, tiedWith: spot.tied_with ?? 0, legend: spot.legend === true, verifiedDays: spot.verified_days }),
        }];
      }));
  });

  async toggle(enabled: boolean): Promise<void> {
    try {
      await this.localLegend.setEnabled(enabled);
    } catch {
      this.snackbar.open($localize`:@@localLegend.saveFailed:Couldn't save your choice. Please try again.`, undefined, { duration: 5_000 });
    }
  }

  async remove(entry: RankHistoryEntry): Promise<void> {
    this.removing.set(entry.key);
    try {
      await this.summaries.deleteMyRank({ month: entry.month, spotId: entry.spotId });
      this.history.reload();
      this.snackbar.open($localize`:@@localLegend.history.removed:Rank removed`, undefined, { duration: 3_000 });
    } catch {
      this.snackbar.open($localize`:@@localLegend.history.removeFailed:Couldn't remove this rank. Please try again.`, undefined, { duration: 5_000 });
    } finally {
      this.removing.set(null);
      this.confirming.set(null);
    }
  }
}
