import { ChangeDetectionStrategy, Component } from "@angular/core";
import { MatButtonModule } from "@angular/material/button";
import {
  MatDialogActions,
  MatDialogClose,
  MatDialogContent,
  MatDialogTitle,
} from "@angular/material/dialog";
import { MatIcon } from "@angular/material/icon";

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
export class AgeAssuranceInfoDialogComponent {}
