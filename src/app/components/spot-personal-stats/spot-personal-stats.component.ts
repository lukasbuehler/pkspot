import {
  ChangeDetectionStrategy,
  Component,
  LOCALE_ID,
  computed,
  inject,
  input,
  resource,
} from "@angular/core";
import { toSignal } from "@angular/core/rxjs-interop";
import { map } from "rxjs";
import { RouterLink } from "@angular/router";
import { MatButtonModule } from "@angular/material/button";
import { MatCardModule } from "@angular/material/card";
import { MatIconModule } from "@angular/material/icon";
import { localDateKey } from "../../../db/utils/training-summary";
import {
  spotRankDays,
  spotRankDetail,
  spotRankState,
  spotRankTitle,
} from "../../features/spot-rank";
import { formatDuration } from "../../features/training-log-activity";
import { DateTimeFormatService } from "../../services/date-time-format.service";
import { AuthenticationService } from "../../services/firebase/authentication.service";
import { TrainingSummaryService } from "../../services/firebase/firestore/training-summary.service";
import { SpotRankIconComponent } from "../spot-rank-icon/spot-rank-icon.component";
import { LocalLegendService } from "../../services/local-legend.service";

/**
 * The signed-in person's own record at a Spot: visits, logged time, last visit
 * and where they stand for this month's private rank. Visits count right away;
 * ranks are published once a night. Nothing here is visible to anyone else.
 */
@Component({
  selector: "app-spot-personal-stats",
  imports: [RouterLink, MatButtonModule, MatCardModule, MatIconModule, SpotRankIconComponent],
  templateUrl: "./spot-personal-stats.component.html",
  styleUrl: "./spot-personal-stats.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SpotPersonalStatsComponent {
  private readonly auth = inject(AuthenticationService);
  private readonly summaries = inject(TrainingSummaryService);
  private readonly dateTime = inject(DateTimeFormatService);
  private readonly locale = inject(LOCALE_ID);

  readonly spotId = input<string | null>(null);
  private readonly localLegend = inject(LocalLegendService);
  private readonly uid = toSignal(
    this.auth.authState$.pipe(map((user) => user?.uid ?? null)),
    { initialValue: this.auth.user.uid ?? null },
  );

  readonly stats = resource({
    params: () => {
      const spotId = this.spotId();
      const uid = this.uid();
      return spotId && uid ? { spotId, uid, participating: this.localLegend.enabled() } : undefined;
    },
    loader: async ({ params }) => {
      const month = localDateKey(Date.now(), Intl.DateTimeFormat().resolvedOptions().timeZone).slice(0, 7);
      // Rank details refine the card; visits remain useful without them.
      const [spot, summary, ranks] = await Promise.all([
        this.summaries.getMySpot(params.spotId),
        this.summaries.getMyMonth(month).catch(() => null),
        this.summaries.getMyRanks(month).catch(() => null),
      ]);
      const monthSpot = summary?.spots[params.spotId];
      const verifiedDays = params.participating
        ? monthSpot?.local_legend_days ?? monthSpot?.verified_days ?? 0
        : monthSpot?.verified_days ?? 0;
      return { spot, verifiedDays, rank: spotRankState(ranks, params.spotId, verifiedDays) };
    },
  });

  readonly view = computed(() => {
    const value = this.stats.value();
    const spot = value?.spot;
    if (!spot || spot.visits < 1) return null;
    const relative = new Intl.RelativeTimeFormat(this.locale, { numeric: "auto" });
    const days = Math.round((startOfDay(Date.now()) - startOfDay(spot.last_ms)) / 86_400_000);
    return {
      visits: spot.visits,
      time: spot.minutes > 0 ? formatDuration(spot.minutes) : null,
      lastVisit: relative.format(-Math.max(0, days), "day"),
      since: this.dateTime.format(new Date(spot.first_ms), { month: "short", year: "numeric" }),
      rank: value?.rank && this.localLegend.enabled()
        ? {
            ...value.rank,
            title: spotRankTitle(value.rank),
            detail: spotRankDetail(value.rank),
            days: spotRankDays(value.rank),
          }
        : null,
    };
  });
}

function startOfDay(timestamp: number): number {
  const date = new Date(timestamp);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}
