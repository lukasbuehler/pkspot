import { ChangeDetectionStrategy, Component, computed, inject } from "@angular/core";
import { RouterLink } from "@angular/router";
import { MatButtonModule } from "@angular/material/button";
import {
  MAT_BOTTOM_SHEET_DATA,
  MatBottomSheetRef,
} from "@angular/material/bottom-sheet";
import { MatIconModule } from "@angular/material/icon";
import type { ConfirmCheckInResponse } from "../../../db/schemas/CheckInActivitySchema";

export interface CheckInRewardSheetData {
  spotId: string;
  spotName: string | null;
  response: ConfirmCheckInResponse;
}

/**
 * Immediate feedback after a confirmed check-in: which visit this is and a
 * one-tap path to log the session. It never mentions other people.
 */
@Component({
  selector: "app-check-in-reward-sheet",
  imports: [RouterLink, MatButtonModule, MatIconModule],
  templateUrl: "./check-in-reward-sheet.component.html",
  styleUrl: "./check-in-reward-sheet.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CheckInRewardSheetComponent {
  readonly data = inject<CheckInRewardSheetData>(MAT_BOTTOM_SHEET_DATA);
  private readonly sheet = inject(MatBottomSheetRef<CheckInRewardSheetComponent>);

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
  readonly logQuery = { sessionRecord: this.data.response.sessionRecordId };

  close(): void {
    this.sheet.dismiss();
  }
}
