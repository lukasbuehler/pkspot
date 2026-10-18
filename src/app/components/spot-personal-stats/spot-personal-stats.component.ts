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
import { formatDuration } from "../../features/training-log-activity";
import { DateTimeFormatService } from "../../services/date-time-format.service";
import { AuthenticationService } from "../../services/firebase/authentication.service";
import { TrainingSummaryService } from "../../services/firebase/firestore/training-summary.service";
import { SpotRankIconComponent } from "../spot-rank-icon/spot-rank-icon.component";

/**
 * The signed-in person's own record at a Spot: visits, logged time, last visit
 * and this month's private rank. Nothing here is visible to anyone else.
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

  private readonly uid = toSignal(
    this.auth.authState$.pipe(map((user) => user?.uid ?? null)),
    { initialValue: this.auth.user.uid ?? null },
  );

  readonly stats = resource({
    params: () => {
      const spotId = this.spotId();
      const uid = this.uid();
      return spotId && uid ? { spotId, uid } : undefined;
    },
    loader: async ({ params }) => {
      const [spot, ranks] = await Promise.all([
        this.summaries.getMySpot(params.spotId),
        this.summaries.getMySpotRanks({ spotIds: [params.spotId] }).catch(() => null),
      ]);
      return { spot, rank: ranks?.ranks.find((rank) => rank.spotId === params.spotId) ?? null };
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
      rank: value?.rank ?? null,
    };
  });
}

function startOfDay(timestamp: number): number {
  const date = new Date(timestamp);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}
