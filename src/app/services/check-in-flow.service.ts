import { Injectable, inject, signal } from "@angular/core";
import { MatBottomSheet } from "@angular/material/bottom-sheet";
import { MatSnackBar } from "@angular/material/snack-bar";
import type { SpotId } from "../../db/schemas/SpotSchema";
import {
  CheckInRewardSheetComponent,
  type CheckInAttempt,
  type CheckInRewardSheetData,
} from "../components/check-in-reward-sheet/check-in-reward-sheet.component";
import { CheckInService } from "./check-in.service";

/**
 * The check-in button's flow, shared by the map banner and the global chip.
 * The reward sheet opens on the tap and follows the request, which can take a
 * few seconds (location, App Check, a cold function), so the tap never looks
 * ignored. One request runs at a time; the sheet offers a retry on failure.
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
    const attempt = signal<CheckInAttempt>({ status: "pending" });
    let sheetOpen = true;
    const run = async (): Promise<void> => {
      if (this._pending()) return;
      this._pending.set(true);
      attempt.set({ status: "pending" });
      try {
        const response = await this._checkIns.checkIn(spotId);
        if (!response) {
          sheet.dismiss();
          return;
        }
        attempt.set({ status: "done", response, confirmedAt: Date.now() });
      } catch {
        attempt.set({ status: "failed" });
        // Swiped away while waiting: the failure still needs to be seen.
        if (!sheetOpen) {
          this._snackbar.open(
            $localize`:@@checkin.failed:Could not check in. Please try again.`,
            $localize`:@@common.dismiss:Dismiss`,
            { duration: 6000 },
          );
        }
      } finally {
        this._pending.set(false);
      }
    };
    const sheet = this._bottomSheet.open<CheckInRewardSheetComponent, CheckInRewardSheetData>(
      CheckInRewardSheetComponent,
      { data: { spotId, spotName, attempt: attempt.asReadonly(), retry: () => void run() } },
    );
    sheet.afterDismissed().subscribe(() => (sheetOpen = false));
    await run();
  }
}
