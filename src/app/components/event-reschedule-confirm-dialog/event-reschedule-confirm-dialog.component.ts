import { DatePipe } from "@angular/common";
import { ChangeDetectionStrategy, Component, inject } from "@angular/core";
import { MatButtonModule } from "@angular/material/button";
import {
  MAT_DIALOG_DATA,
  MatDialogActions,
  MatDialogClose,
  MatDialogContent,
  MatDialogRef,
  MatDialogTitle,
} from "@angular/material/dialog";
import { MatIconModule } from "@angular/material/icon";
import type { EventRescheduleConfirmationData } from "./event-reschedule-confirmation.model";

@Component({
  selector: "app-event-reschedule-confirm-dialog",
  imports: [
    DatePipe,
    MatButtonModule,
    MatDialogActions,
    MatDialogClose,
    MatDialogContent,
    MatDialogTitle,
    MatIconModule,
  ],
  templateUrl: "./event-reschedule-confirm-dialog.component.html",
  styleUrl: "./event-reschedule-confirm-dialog.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EventRescheduleConfirmDialogComponent {
  readonly data = inject<EventRescheduleConfirmationData>(MAT_DIALOG_DATA);
  private readonly dialogRef = inject<
    MatDialogRef<EventRescheduleConfirmDialogComponent, boolean>
  >(MatDialogRef);

  confirm(): void {
    this.dialogRef.close(true);
  }
}
