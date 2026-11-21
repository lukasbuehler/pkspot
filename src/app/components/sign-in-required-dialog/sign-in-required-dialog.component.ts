import { ChangeDetectionStrategy, Component, inject } from "@angular/core";
import { MatButtonModule } from "@angular/material/button";
import {
  MAT_DIALOG_DATA,
  MatDialogModule,
} from "@angular/material/dialog";
import { MatIconModule } from "@angular/material/icon";
import { RouterLink } from "@angular/router";

export interface SignInRequiredDialogData {
  /** Short question or statement, e.g. "Sign in to mark Going". */
  title: string;
  /** Why an account is needed for this action. */
  message: string;
  /** Where sign-in or sign-up brings the person back to. */
  returnUrl: string;
}

/**
 * Explains why an action needs an account before sending someone to sign in
 * or sign up, and brings them back to the page they came from afterwards.
 */
@Component({
  selector: "app-sign-in-required-dialog",
  imports: [MatDialogModule, MatButtonModule, MatIconModule, RouterLink],
  templateUrl: "./sign-in-required-dialog.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SignInRequiredDialogComponent {
  readonly data = inject<SignInRequiredDialogData>(MAT_DIALOG_DATA);
}
