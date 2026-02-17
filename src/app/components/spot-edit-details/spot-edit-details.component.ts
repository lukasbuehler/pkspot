import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  LOCALE_ID,
  signal,
} from "@angular/core";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { MatSnackBar } from "@angular/material/snack-bar";
import { ProfileButtonComponent } from "../profile-button/profile-button.component";
import { SpotEdit } from "../../../db/models/SpotEdit";
import { SpotEditSummaryComponent } from "../spot-edit-summary/spot-edit-summary.component";
import { AuthenticationService } from "../../services/firebase/authentication.service";
import { SpotEditsService } from "../../services/firebase/firestore/spot-edits.service";
import { createUserReference } from "../../../scripts/Helpers";
import { SpotEditVoteValue } from "../../../db/schemas/SpotEditVoteSchema";

@Component({
  selector: "app-spot-edit-details",
  imports: [
    MatButtonModule,
    MatIconModule,
    ProfileButtonComponent,
    SpotEditSummaryComponent,
  ],
  templateUrl: "./spot-edit-details.component.html",
  styleUrl: "./spot-edit-details.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SpotEditDetailsComponent {
  spotEdit = input<SpotEdit>();
  spotId = input<string | null>(null);
  locale = inject(LOCALE_ID);
  authenticationService = inject(AuthenticationService);
  private _spotEditsService = inject(SpotEditsService);
  private _snackBar = inject(MatSnackBar);

  isSubmittingVote = signal(false);
  userVoteValue = signal<SpotEditVoteValue | null>(null);

  yesVotes = computed(() => this.spotEdit()?.vote_summary?.yes_count ?? 0);
  noVotes = computed(() => this.spotEdit()?.vote_summary?.no_count ?? 0);
  totalVotes = computed(() => this.spotEdit()?.vote_summary?.total_count ?? 0);

  statusText = computed(() => {
    const edit = this.spotEdit();
    if (!edit) return "";
    if (edit.approved === true) {
      return $localize`Approved`;
    }
    const status = edit.processing_status;
    if (status === "BLOCKED_ICONIC_SPOT") {
      return $localize`Pending community vote (iconic spot)`;
    }
    if (status === "BLOCKED_VERIFIED_SPOT") {
      return $localize`Pending community vote (verified spot)`;
    }
    if (status === "VOTING_FORCED_TEST") {
      return $localize`Voting test mode`;
    }
    if (status === "VOTING_OPEN") {
      return $localize`Voting open`;
    }
    return $localize`Pending`;
  });

  canVote(): boolean {
    const edit = this.spotEdit();
    return (
      !!edit &&
      edit.type === "UPDATE" &&
      edit.approved !== true &&
      this.authenticationService.isSignedIn
    );
  }

  constructor() {
    effect((onCleanup) => {
      const edit = this.spotEdit();
      const spotId = this.spotId();
      const uid = this.authenticationService.user.uid;

      this.userVoteValue.set(null);

      if (!edit || !spotId || !uid) {
        return;
      }

      const sub = this._spotEditsService
        .getSpotEditVoteByUserId$(spotId, edit.id, uid)
        .subscribe((vote) => {
          if (!vote) {
            this.userVoteValue.set(null);
            return;
          }
          this.userVoteValue.set(vote.value);
        });

      onCleanup(() => {
        sub.unsubscribe();
      });
    });
  }

  async voteYes() {
    await this._submitVote(1);
  }

  async voteNo() {
    await this._submitVote(-1);
  }

  private async _submitVote(voteValue: SpotEditVoteValue): Promise<void> {
    const edit = this.spotEdit();
    const spotId = this.spotId();
    const authUser = this.authenticationService.user;

    if (!edit || !spotId || !authUser.uid || !authUser.data) {
      return;
    }
    if (this.isSubmittingVote()) {
      return;
    }

    this.isSubmittingVote.set(true);
    try {
      const userReference = createUserReference(authUser.data);
      await this._spotEditsService.setSpotEditVote(
        spotId,
        edit.id,
        voteValue,
        userReference
      );
    } catch (error) {
      console.error("Failed to submit spot edit vote", error);
      this._snackBar.open(
        $localize`Failed to submit vote`,
        $localize`Dismiss`,
        {
          duration: 2500,
        }
      );
    } finally {
      this.isSubmittingVote.set(false);
    }
  }
}
