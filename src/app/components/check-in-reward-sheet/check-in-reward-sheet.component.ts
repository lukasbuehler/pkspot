import { ChangeDetectionStrategy, Component, computed, inject, type Signal } from "@angular/core";
import { toSignal } from "@angular/core/rxjs-interop";
import { RouterLink } from "@angular/router";
import { MatButtonModule } from "@angular/material/button";
import {
  MAT_BOTTOM_SHEET_DATA,
  MatBottomSheetRef,
} from "@angular/material/bottom-sheet";
import { MatIconModule } from "@angular/material/icon";
import { MatProgressBarModule } from "@angular/material/progress-bar";
import { catchError, from, of } from "rxjs";
import type { ConfirmCheckInResponse } from "../../../db/schemas/CheckInActivitySchema";
import { localDateKey } from "../../../db/utils/training-summary";
import { spotRankDays, spotRankState, spotRankTitle } from "../../features/spot-rank";
import { TrainingSummaryService } from "../../services/firebase/firestore/training-summary.service";
import { SpotRankIconComponent } from "../spot-rank-icon/spot-rank-icon.component";
import { MatDialog } from "@angular/material/dialog";
import { LocalLegendService } from "../../services/local-legend.service";
import { LocalLegendJoinDialogComponent } from "../local-legend-join-dialog/local-legend-join-dialog.component";

/** The check-in request behind the sheet, which opens before it is confirmed. */
export type CheckInAttempt =
  | { status: "pending" }
  | { status: "done"; response: ConfirmCheckInResponse; confirmedAt: number }
  | { status: "failed" };

export interface CheckInRewardSheetData {
  spotId: string;
  spotName: string | null;
  attempt: Signal<CheckInAttempt>;
  retry?: () => void;
}

/** A summary written this long before confirmation predates the check-in. */
const FRESH_SUMMARY_MS = 15_000;

/**
 * Opens the moment someone taps Check In, so the tap feels instant: it shows
 * progress while location, App Check and the server respond, then which visit
 * this is and how it moves the person toward their private monthly Spot rank,
 * or the error with a retry. It never mentions other people, and nothing says
 * "checked in" before the server confirms. Logging waits until after training.
 */
@Component({
  selector: "app-check-in-reward-sheet",
  imports: [RouterLink, MatButtonModule, MatIconModule, MatProgressBarModule, SpotRankIconComponent],
  templateUrl: "./check-in-reward-sheet.component.html",
  styleUrl: "./check-in-reward-sheet.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CheckInRewardSheetComponent {
  readonly data = inject<CheckInRewardSheetData>(MAT_BOTTOM_SHEET_DATA);
  private readonly sheet = inject(MatBottomSheetRef<CheckInRewardSheetComponent>);
  private readonly summaries = inject(TrainingSummaryService);
  private readonly localLegend = inject(LocalLegendService);
  private readonly dialog = inject(MatDialog);

  private readonly month = localDateKey(
    Date.now(),
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

  readonly status = computed(() => this.data.attempt().status);
  private readonly confirmed = computed(() => {
    const attempt = this.data.attempt();
    return attempt.status === "done" ? attempt : null;
  });
  readonly duplicate = computed(() => !!this.confirmed()?.response.duplicate);

  readonly title = computed(() => {
    const name = this.data.spotName;
    switch (this.status()) {
      case "pending":
        return name
          ? $localize`:@@checkInReward.pendingAt:Checking in at ${name}:spot:…`
          : $localize`:@@checkInReward.pending:Checking in…`;
      case "failed":
        return $localize`:@@checkInReward.failed:Couldn't check in`;
      default:
        return name
          ? $localize`:@@checkInReward.titleAt:Checked in at ${name}:spot:`
          : $localize`:@@checkInReward.title:Checked in`;
    }
  });
  readonly visitLabel = computed(() => {
    const response = this.confirmed()?.response;
    if (!response) return null;
    if (response.duplicate) return $localize`:@@checkin.alreadyCheckedIn:You're already checked in here.`;
    const count = response.spotVisitCount;
    if (count === undefined) return null;
    return count === 1
      ? $localize`:@@checkInReward.firstVisit:Your first visit here`
      : $localize`:@@checkInReward.visitCount:Visit ${count}:count: here`;
  });
  readonly unverified = computed(() => this.confirmed()?.response.verified === false);

  /**
   * Shown once the server has counted this check-in in the month summary.
   * Local Legend participants see their rank progress; everyone else sees
   * their verified days, with an invitation if they have not chosen yet.
   */
  readonly rank = computed(() => {
    const confirmed = this.confirmed();
    const summary = this.summary();
    if (!confirmed || confirmed.response.duplicate || this.unverified() || !summary ||
      summary.updated_at_raw_ms < confirmed.confirmedAt - FRESH_SUMMARY_MS) {
      return null;
    }
    const verifiedDays = summary.spots[this.data.spotId]?.verified_days ?? 0;
    const state = spotRankState(this.localLegend.enabled() ? this.ranks() : null, this.data.spotId, verifiedDays);
    if (!state) return null;
    if (!this.localLegend.enabled()) {
      return { rank: null, title: spotRankDays(state), days: null, invite: this.localLegend.state() === "undecided" };
    }
    return {
      rank: state.kind === "ranked" ? state.rank : null,
      title: spotRankTitle(state),
      days: spotRankDays(state),
      invite: false,
    };
  });

  openLocalLegend(): void {
    LocalLegendJoinDialogComponent.open(this.dialog);
  }

  retry(): void {
    this.data.retry?.();
  }

  close(): void {
    this.sheet.dismiss();
  }
}
