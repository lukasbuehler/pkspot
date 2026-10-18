import { ChangeDetectionStrategy, Component, computed, inject } from "@angular/core";
import { toSignal } from "@angular/core/rxjs-interop";
import { RouterLink } from "@angular/router";
import { MatButtonModule } from "@angular/material/button";
import {
  MAT_BOTTOM_SHEET_DATA,
  MatBottomSheetRef,
} from "@angular/material/bottom-sheet";
import { MatIconModule } from "@angular/material/icon";
import { catchError, from, of } from "rxjs";
import type { ConfirmCheckInResponse } from "../../../db/schemas/CheckInActivitySchema";
import { localDateKey } from "../../../db/utils/training-summary";
import { spotRankDays, spotRankState, spotRankTitle } from "../../features/spot-rank";
import { TrainingSummaryService } from "../../services/firebase/firestore/training-summary.service";
import { SpotRankIconComponent } from "../spot-rank-icon/spot-rank-icon.component";

export interface CheckInRewardSheetData {
  spotId: string;
  spotName: string | null;
  response: ConfirmCheckInResponse;
}

/** A summary written this long before the sheet opened predates the check-in. */
const FRESH_SUMMARY_MS = 15_000;

/**
 * Immediate feedback after a confirmed check-in: which visit this is and how
 * it moves the person toward their private monthly Spot rank. It never
 * mentions other people. Logging waits until after training.
 */
@Component({
  selector: "app-check-in-reward-sheet",
  imports: [RouterLink, MatButtonModule, MatIconModule, SpotRankIconComponent],
  templateUrl: "./check-in-reward-sheet.component.html",
  styleUrl: "./check-in-reward-sheet.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CheckInRewardSheetComponent {
  readonly data = inject<CheckInRewardSheetData>(MAT_BOTTOM_SHEET_DATA);
  private readonly sheet = inject(MatBottomSheetRef<CheckInRewardSheetComponent>);
  private readonly summaries = inject(TrainingSummaryService);

  private readonly openedAt = Date.now();
  private readonly month = localDateKey(
    this.openedAt,
    Intl.DateTimeFormat().resolvedOptions().timeZone,
  ).slice(0, 7);
  private readonly summary = toSignal(
    this.summaries.watchMyMonth(this.month).pipe(catchError(() => of(null))),
    { initialValue: null },
  );
  private readonly ranks = toSignal(
    from(this.summaries.getMyRanks(this.month)).pipe(catchError(() => of(null))),
    { initialValue: null },
  );

  readonly title = this.data.spotName
    ? $localize`:@@checkInReward.titleAt:Checked in at ${this.data.spotName}:spot:`
    : $localize`:@@checkInReward.title:Checked in`;
  readonly visitLabel = computed(() => {
    const count = this.data.response.spotVisitCount;
    if (count === undefined) return null;
    return count === 1
      ? $localize`:@@checkInReward.firstVisit:Your first visit here`
      : $localize`:@@checkInReward.visitCount:Visit ${count}:count: here`;
  });
  readonly unverified = this.data.response.verified === false;

  /** Shown once the server has counted this check-in in the month summary. */
  readonly rank = computed(() => {
    const summary = this.summary();
    if (this.unverified || !summary || summary.updated_at_raw_ms < this.openedAt - FRESH_SUMMARY_MS) {
      return null;
    }
    const state = spotRankState(
      this.ranks(),
      this.data.spotId,
      summary.spots[this.data.spotId]?.verified_days ?? 0,
    );
    return state
      ? {
          rank: state.kind === "ranked" ? state.rank : null,
          title: spotRankTitle(state),
          days: spotRankDays(state),
        }
      : null;
  });

  close(): void {
    this.sheet.dismiss();
  }
}
