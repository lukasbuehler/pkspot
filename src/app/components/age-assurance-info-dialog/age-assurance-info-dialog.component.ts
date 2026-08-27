import { ChangeDetectionStrategy, Component, inject } from "@angular/core";
import { MatButtonModule } from "@angular/material/button";
import {
  MatDialogActions,
  MatDialogClose,
  MatDialogContent,
  MatDialogTitle,
  MAT_DIALOG_DATA,
} from "@angular/material/dialog";
import { MatIcon } from "@angular/material/icon";

export interface AgeAssuranceInfoDialogData {
  confirmAgeRangeRequest?: boolean;
}

@Component({
  selector: "app-age-assurance-info-dialog",
  imports: [
    MatButtonModule,
    MatDialogActions,
    MatDialogClose,
    MatDialogContent,
    MatDialogTitle,
    MatIcon,
  ],
  templateUrl: "./age-assurance-info-dialog.component.html",
  styleUrl: "./age-assurance-info-dialog.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AgeAssuranceInfoDialogComponent {
  private readonly _data = inject<AgeAssuranceInfoDialogData | null>(
    MAT_DIALOG_DATA,
    { optional: true },
  );

  readonly confirmAgeRangeRequest =
    this._data?.confirmAgeRangeRequest === true;
}
