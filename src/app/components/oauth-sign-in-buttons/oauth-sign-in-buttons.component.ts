import { Component, inject, Input, Output, EventEmitter } from "@angular/core";
import { CommonModule, NgOptimizedImage } from "@angular/common";
import { MatButton } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { MatProgressSpinner } from "@angular/material/progress-spinner";
import { AuthenticationService } from "../../services/firebase/authentication.service";

@Component({
  selector: "app-oauth-sign-in-buttons",
  templateUrl: "./oauth-sign-in-buttons.component.html",
  styleUrls: ["./oauth-sign-in-buttons.component.scss"],
  imports: [
    CommonModule,
    MatButton,
    MatIconModule,
    NgOptimizedImage,
    MatProgressSpinner,
  ],
})
export class OAuthSignInButtonsComponent {
  private _authService = inject(AuthenticationService);

  @Input() disabled: boolean = false;
  @Input() layout: "row" | "column" = "column";

  @Output() success = new EventEmitter<void>();
  @Output() error = new EventEmitter<{
    provider: "google" | "apple";
    message: string;
  }>();

  isSigningInGoogle = false;
  isSigningInApple = false;

  get isSubmitting(): boolean {
    return this.isSigningInGoogle || this.isSigningInApple;
  }

  trySignInGoogle() {
    if (this.isSubmitting || this.disabled) {
      return;
    }

    this.isSigningInGoogle = true;

    this._authService
      .signInGoogle()
      .then(() => {
        console.log("Successfully signed in with Google");
        this.success.emit();
      })
      .catch((err) => {
        console.error(err);
        this.error.emit({
          provider: "google",
          message: $localize`Could not sign in with Google!`,
        });
      })
      .finally(() => {
        this.isSigningInGoogle = false;
      });
  }

  trySignInApple() {
    if (this.isSubmitting || this.disabled) {
      return;
    }

    this.isSigningInApple = true;

    this._authService
      .signInApple()
      .then(() => {
        console.log("Successfully signed in with Apple");
        this.success.emit();
      })
      .catch((err) => {
        console.error(err);
        this.error.emit({
          provider: "apple",
          message: $localize`Could not sign in with Apple!`,
        });
      })
      .finally(() => {
        this.isSigningInApple = false;
      });
  }
}
