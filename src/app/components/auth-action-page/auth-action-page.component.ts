import { Component, OnInit, inject, PLATFORM_ID } from "@angular/core";
import { CommonModule, isPlatformBrowser } from "@angular/common";
import { ActivatedRoute, Router } from "@angular/router";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { MatProgressSpinnerModule } from "@angular/material/progress-spinner";
import {
  applyActionCode,
  verifyPasswordResetCode,
  confirmPasswordReset,
  reload,
} from "@angular/fire/auth";
import {
  FormBuilder,
  FormGroup,
  Validators,
  ReactiveFormsModule,
} from "@angular/forms";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatInputModule } from "@angular/material/input";
import { AuthenticationService } from "../../services/firebase/authentication.service";

type ActionMode = "verifyEmail" | "resetPassword" | "recoverEmail" | null;

interface ActionState {
  status: "loading" | "success" | "error" | "input_required";
  message: string;
  title: string;
}

@Component({
  selector: "app-auth-action-page",
  templateUrl: "./auth-action-page.component.html",
  styleUrls: ["./auth-action-page.component.scss"],
  imports: [
    CommonModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
  ],
})
export class AuthActionPageComponent implements OnInit {
  private readonly _authService = inject(AuthenticationService);
  private readonly _route = inject(ActivatedRoute);
  private readonly _router = inject(Router);
  private readonly _fb = inject(FormBuilder);
  private readonly _platformId = inject(PLATFORM_ID);

  mode: ActionMode = null;
  oobCode: string = "";
  state: ActionState = {
    status: "loading",
    message: "",
    title: "",
  };

  // Password reset form
  passwordResetForm: FormGroup;
  isResettingPassword = false;
  passwordResetEmail = "";

  constructor() {
    this.passwordResetForm = this._fb.group(
      {
        password: ["", [Validators.required, Validators.minLength(6)]],
        confirmPassword: ["", [Validators.required]],
      },
      { validators: this.passwordMatchValidator }
    );
  }

  ngOnInit(): void {
    // Skip on server side
    if (!isPlatformBrowser(this._platformId)) {
      return;
    }

    this._route.queryParams.subscribe((params) => {
      this.mode = params["mode"] as ActionMode;
      this.oobCode = params["oobCode"] || "";

      if (!this.oobCode) {
        this.state = {
          status: "error",
          title: $localize`Invalid Link`,
          message: $localize`This link is invalid or has expired. Please request a new one.`,
        };
        return;
      }

      this.handleAction();
    });
  }

  private async handleAction(): Promise<void> {
    // Ensure auth is available
    if (!this._authService.auth) {
      this.state = {
        status: "error",
        title: $localize`Authentication Error`,
        message: $localize`Unable to process this request. Please try again later.`,
      };
      return;
    }

    switch (this.mode) {
      case "verifyEmail":
        await this.handleVerifyEmail();
        break;
      case "resetPassword":
        await this.handleResetPassword();
        break;
      case "recoverEmail":
        await this.handleRecoverEmail();
        break;
      default:
        this.state = {
          status: "error",
          title: $localize`Unknown Action`,
          message: $localize`This link is not recognized. Please check your email and try again.`,
        };
    }
  }

  private async handleVerifyEmail(): Promise<void> {
    this.state = {
      status: "loading",
      title: $localize`Verifying Email`,
      message: $localize`Please wait while we verify your email address...`,
    };

    try {
      await applyActionCode(this._authService.auth, this.oobCode);

      // Reload the current user to get updated emailVerified status
      const currentUser = this._authService.auth.currentUser;
      if (currentUser) {
        await reload(currentUser);
        // Update the auth service's user state
        this._authService.user.emailVerified = currentUser.emailVerified;
        // Trigger authState update so subscribers get the new value
        this._authService.authState$.next(this._authService.user);
      }

      this.state = {
        status: "success",
        title: $localize`Email Verified!`,
        message: $localize`Your email address has been successfully verified. You can now access all features of PK Spot.`,
      };
    } catch (error: any) {
      console.error("Email verification error:", error);
      this.state = {
        status: "error",
        title: $localize`Verification Failed`,
        message: this.getErrorMessage(error.code),
      };
    }
  }

  private async handleResetPassword(): Promise<void> {
    this.state = {
      status: "loading",
      title: $localize`Reset Password`,
      message: $localize`Validating your reset link...`,
    };

    try {
      // Verify the code first to get the email
      this.passwordResetEmail = await verifyPasswordResetCode(
        this._authService.auth,
        this.oobCode
      );
      this.state = {
        status: "input_required",
        title: $localize`Reset Password`,
        message: $localize`Enter a new password for ${this.passwordResetEmail}`,
      };
    } catch (error: any) {
      console.error("Password reset code verification error:", error);
      this.state = {
        status: "error",
        title: $localize`Invalid Link`,
        message: this.getErrorMessage(error.code),
      };
    }
  }

  async submitNewPassword(): Promise<void> {
    if (this.passwordResetForm.invalid || this.isResettingPassword) {
      return;
    }

    this.isResettingPassword = true;
    const newPassword = this.passwordResetForm.get("password")?.value;

    try {
      await confirmPasswordReset(
        this._authService.auth,
        this.oobCode,
        newPassword
      );
      this.state = {
        status: "success",
        title: $localize`Password Reset Successful`,
        message: $localize`Your password has been successfully reset. You can now sign in with your new password.`,
      };
    } catch (error: any) {
      console.error("Password reset error:", error);
      this.state = {
        status: "error",
        title: $localize`Password Reset Failed`,
        message: this.getErrorMessage(error.code),
      };
    } finally {
      this.isResettingPassword = false;
    }
  }

  private async handleRecoverEmail(): Promise<void> {
    this.state = {
      status: "loading",
      title: $localize`Recovering Email`,
      message: $localize`Please wait while we recover your email address...`,
    };

    try {
      await applyActionCode(this._authService.auth, this.oobCode);
      this.state = {
        status: "success",
        title: $localize`Email Recovered`,
        message: $localize`Your email address has been successfully recovered. You may want to change your password if you didn't make this change.`,
      };
    } catch (error: any) {
      console.error("Email recovery error:", error);
      this.state = {
        status: "error",
        title: $localize`Recovery Failed`,
        message: this.getErrorMessage(error.code),
      };
    }
  }

  private passwordMatchValidator(
    group: FormGroup
  ): { [key: string]: boolean } | null {
    const password = group.get("password")?.value;
    const confirmPassword = group.get("confirmPassword")?.value;
    return password === confirmPassword ? null : { passwordMismatch: true };
  }

  private getErrorMessage(errorCode: string): string {
    switch (errorCode) {
      case "auth/expired-action-code":
        return $localize`This link has expired. Please request a new one.`;
      case "auth/invalid-action-code":
        return $localize`This link is invalid or has already been used. Please request a new one.`;
      case "auth/user-disabled":
        return $localize`This account has been disabled. Please contact support.`;
      case "auth/user-not-found":
        return $localize`No account found for this email address.`;
      case "auth/weak-password":
        return $localize`The password is too weak. Please use at least 6 characters.`;
      default:
        return $localize`An error occurred. Please try again or request a new link.`;
    }
  }

  get passwordMismatch(): boolean {
    return (
      this.passwordResetForm.hasError("passwordMismatch") &&
      this.passwordResetForm.get("confirmPassword")?.touched === true
    );
  }

  navigateToSignIn(): void {
    this._router.navigate(["/sign-in"]);
  }

  navigateToProfile(): void {
    this._router.navigate(["/profile"]);
  }

  navigateToForgotPassword(): void {
    this._router.navigate(["/forgot-password"]);
  }
}
