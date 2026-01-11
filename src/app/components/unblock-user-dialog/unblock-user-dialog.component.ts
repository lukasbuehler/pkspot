import { Component } from "@angular/core";
import { MatButtonModule } from "@angular/material/button";
import {
  MatDialogActions,
  MatDialogContent,
  MatDialogRef,
  MatDialogTitle,
  MatDialogClose,
} from "@angular/material/dialog";

@Component({
  selector: "app-unblock-user-dialog",
  imports: [
    MatButtonModule,
    MatDialogTitle,
    MatDialogContent,
    MatDialogActions,
    MatDialogClose,
  ],
  template: `
    <h2 mat-dialog-title>Unblock User?</h2>
    <mat-dialog-content>
      <p>Are you sure you want to unblock this user?</p>
      <p>
        You will be able to see their profile, posts, and contributions again.
      </p>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Cancel</button>
      <button mat-flat-button color="primary" [mat-dialog-close]="true">
        Unblock
      </button>
    </mat-dialog-actions>
  `,
  standalone: true,
})
export class UnblockUserDialogComponent {
  constructor(public dialogRef: MatDialogRef<UnblockUserDialogComponent>) {}
}
