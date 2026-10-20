import { Injectable, inject, signal } from "@angular/core";
import { MatBottomSheet } from "@angular/material/bottom-sheet";
import { MatSnackBar } from "@angular/material/snack-bar";
import type { SpotId } from "../../db/schemas/SpotSchema";
import {
  CheckInRewardSheetComponent,
  type CheckInRewardSheetData,
} from "../components/check-in-reward-sheet/check-in-reward-sheet.component";
import { CheckInService } from "./check-in.service";

/**
 * The check-in button's flow, shared by the map banner and the global chip:
 * one request at a time, a pending state the buttons can show while location,
 * App Check and the function respond, then the reward sheet or an error.
 */
@Injectable({ providedIn: "root" })
export class CheckInFlowService {
  private readonly _checkIns = inject(CheckInService);
  private readonly _bottomSheet = inject(MatBottomSheet);
  private readonly _snackbar = inject(MatSnackBar);
  private readonly _pending = signal(false);

  readonly pending = this._pending.asReadonly();

  async checkIn(spotId: SpotId, spotName: string | null): Promise<void> {
    if (this._pending()) return;
    this._pending.set(true);
    try {
      const response = await this._checkIns.checkIn(spotId);
      if (response?.duplicate) {
        this._snackbar.open(
          $localize`:@@checkin.alreadyCheckedIn:You're already checked in here.`,
          $localize`:@@common.dismiss:Dismiss`,
          { duration: 4000 },
        );
      } else if (response) {
        this._bottomSheet.open<CheckInRewardSheetComponent, CheckInRewardSheetData>(
          CheckInRewardSheetComponent,
          { data: { spotId, spotName, response } },
        );
      }
    } catch {
      this._snackbar.open(
        $localize`:@@checkin.failed:Could not check in. Please try again.`,
        $localize`:@@common.dismiss:Dismiss`,
        { duration: 6000 },
      );
    } finally {
      this._pending.set(false);
    }
  }
}
