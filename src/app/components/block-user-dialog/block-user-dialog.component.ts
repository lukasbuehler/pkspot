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
  selector: "app-block-user-dialog",
  imports: [
    MatButtonModule,
    MatDialogTitle,
    MatDialogContent,
    MatDialogActions,
    MatDialogClose,
  ],
  template: `
    <h2 mat-dialog-title>Block User?</h2>
    <mat-dialog-content>
      <p>Blocking this user has the following effects:</p>
      <ul>
        <li>You will not see their profile.</li>
        <li>You will not see images they added to spots.</li>
        <li>You will not see their name on contributions or leaderboards.</li>
      </ul>
      <p>Are you sure you want to block this user?</p>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Cancel</button>
      <button mat-flat-button color="warn" [mat-dialog-close]="true">
        Block
      </button>
    </mat-dialog-actions>
  `,
  standalone: true,
})
export class BlockUserDialogComponent {
  constructor(public dialogRef: MatDialogRef<BlockUserDialogComponent>) {}
}
