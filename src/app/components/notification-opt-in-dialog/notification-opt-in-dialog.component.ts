import { ChangeDetectionStrategy, Component, inject } from "@angular/core";
import { MatButtonModule } from "@angular/material/button";
import {
  MAT_DIALOG_DATA,
  MatDialogActions,
  MatDialogContent,
  MatDialogRef,
  MatDialogTitle,
} from "@angular/material/dialog";
import { MatIcon } from "@angular/material/icon";
import type { NotificationPromptContext } from "../../../db/schemas/NotificationSchema";

export type NotificationOptInDialogResult =
  | "context"
  | "all"
  | "dismissed";

export interface NotificationOptInDialogData {
  context: NotificationPromptContext;
}

@Component({
  selector: "app-notification-opt-in-dialog",
  imports: [
    MatButtonModule,
    MatDialogTitle,
    MatDialogContent,
    MatDialogActions,
    MatIcon,
  ],
  templateUrl: "./notification-opt-in-dialog.component.html",
  styleUrl: "./notification-opt-in-dialog.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotificationOptInDialogComponent {
  readonly data = inject<NotificationOptInDialogData>(MAT_DIALOG_DATA);
  private readonly dialogRef = inject<
    MatDialogRef<NotificationOptInDialogComponent, NotificationOptInDialogResult>
  >(MatDialogRef);

  close(result: NotificationOptInDialogResult): void {
    this.dialogRef.close(result);
  }
}
