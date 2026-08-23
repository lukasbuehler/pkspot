import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  PLATFORM_ID,
  inject,
  signal,
} from "@angular/core";
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
} from "firebase/auth";
import {
  FormBuilder,
  FormGroup,
  Validators,
  ReactiveFormsModule,
} from "@angular/forms";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatInputModule } from "@angular/material/input";
import { AuthenticationService } from "../../services/firebase/authentication.service";
import { AnalyticsService } from "../../services/analytics.service";

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
  changeDetection: ChangeDetectionStrategy.OnPush,
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
  private readonly _analyticsService = inject(AnalyticsService);

  readonly mode = signal<ActionMode>(null);
  private readonly _oobCode = signal("");
  readonly state = signal<ActionState>({
    status: "loading",
    message: "",
    title: "",
  });

  // Password reset form
  passwordResetForm: FormGroup;
  readonly isResettingPassword = signal(false);
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
      this.mode.set(params["mode"] as ActionMode);
      this._oobCode.set(params["oobCode"] || "");

      if (!this._oobCode()) {
        this.state.set({
          status: "error",
          title: $localize`Invalid Link`,
          message: $localize`This link is invalid or has expired. Please request a new one.`,
        });
        return;
      }

      this.handleAction();
    });
  }

  private async handleAction(): Promise<void> {
    // Ensure auth is available
    if (!this._authService.auth) {
      this.state.set({
        status: "error",
        title: $localize`Authentication Error`,
        message: $localize`Unable to process this request. Please try again later.`,
      });
      return;
    }

    switch (this.mode()) {
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
        this.state.set({
          status: "error",
          title: $localize`Unknown Action`,
          message: $localize`This link is not recognized. Please check your email and try again.`,
        });
    }
  }

  private async handleVerifyEmail(): Promise<void> {
    this.state.set({
      status: "loading",
      title: $localize`Verifying Email`,
      message: $localize`Please wait while we verify your email address...`,
    });

    try {
      await applyActionCode(this._authService.auth, this._oobCode());

      try {
        await this.refreshCurrentUser();
      } catch (refreshError) {
        console.warn("Email verified, but the local user refresh failed", {
          code: this.getErrorCode(refreshError),
        });
      }

      this.setEmailVerifiedState();
    } catch (error: unknown) {
      const code = this.getErrorCode(error);
      if (
        (code === "auth/invalid-action-code" ||
          code === "auth/expired-action-code") &&
        (await this.isCurrentUserAlreadyVerified())
      ) {
        this.setEmailVerifiedState();
        return;
      }

      this.reportActionError("verify_email", code);
      console.error("Email verification failed", { code });
      this.state.set({
        status: "error",
        title: $localize`Verification Failed`,
        message: this.getErrorMessage(code),
      });
    }
  }

  private async handleResetPassword(): Promise<void> {
    this.state.set({
      status: "loading",
      title: $localize`Reset Password`,
      message: $localize`Validating your reset link...`,
    });

    try {
      // Verify the code first to get the email
      this.passwordResetEmail = await verifyPasswordResetCode(
        this._authService.auth,
        this._oobCode()
      );
      this.state.set({
        status: "input_required",
        title: $localize`Reset Password`,
        message: $localize`Enter a new password for ${this.passwordResetEmail}`,
      });
    } catch (error: unknown) {
      const code = this.getErrorCode(error);
      this.reportActionError("validate_password_reset", code);
      console.error("Password reset code verification failed", { code });
      this.state.set({
        status: "error",
        title: $localize`Invalid Link`,
        message: this.getErrorMessage(code),
      });
    }
  }

  async submitNewPassword(): Promise<void> {
    if (this.passwordResetForm.invalid || this.isResettingPassword()) {
      return;
    }

    this.isResettingPassword.set(true);
    const newPassword = this.passwordResetForm.get("password")?.value;

    try {
      await confirmPasswordReset(
        this._authService.auth,
        this._oobCode(),
        newPassword
      );
      this.state.set({
        status: "success",
        title: $localize`Password Reset Successful`,
        message: $localize`Your password has been successfully reset. You can now sign in with your new password.`,
      });
    } catch (error: unknown) {
      const code = this.getErrorCode(error);
      this.reportActionError("confirm_password_reset", code);
      console.error("Password reset failed", { code });
      this.state.set({
        status: "error",
        title: $localize`Password Reset Failed`,
        message: this.getErrorMessage(code),
      });
    } finally {
      this.isResettingPassword.set(false);
    }
  }

  private async handleRecoverEmail(): Promise<void> {
    this.state.set({
      status: "loading",
      title: $localize`Recovering Email`,
      message: $localize`Please wait while we recover your email address...`,
    });

    try {
      await applyActionCode(this._authService.auth, this._oobCode());
      this.state.set({
        status: "success",
        title: $localize`Email Recovered`,
        message: $localize`Your email address has been successfully recovered. You may want to change your password if you didn't make this change.`,
      });
    } catch (error: unknown) {
      const code = this.getErrorCode(error);
      this.reportActionError("recover_email", code);
      console.error("Email recovery failed", { code });
      this.state.set({
        status: "error",
        title: $localize`Recovery Failed`,
        message: this.getErrorMessage(code),
      });
    }
  }

  private async refreshCurrentUser(): Promise<boolean> {
    const currentUser = this._authService.auth.currentUser;
    if (!currentUser) return false;

    await reload(currentUser);
    this._authService.user.emailVerified = currentUser.emailVerified;
    this._authService.authState$.next(this._authService.user);
    return currentUser.emailVerified;
  }

  private async isCurrentUserAlreadyVerified(): Promise<boolean> {
    try {
      return await this.refreshCurrentUser();
    } catch {
      return false;
    }
  }

  private setEmailVerifiedState(): void {
    this.state.set({
      status: "success",
      title: $localize`Email Verified!`,
      message: $localize`Your email address has been successfully verified. You can now access all features of PK Spot.`,
    });
  }

  private reportActionError(action: string, code: string | undefined): void {
    const reportedError = new Error(code ?? "unknown");
    reportedError.name = "AuthActionError";
    this._analyticsService.reportError(reportedError, {
      context: "auth_action",
      feature: "authentication",
      action,
      severity: "error",
      handled: true,
      userFacing: true,
      properties: {
        auth_action_mode: this.mode(),
        error_code: code ?? "unknown",
        $exception_fingerprint: `auth_action:${action}:${code ?? "unknown"}`,
      },
    });
  }

  private getErrorCode(error: unknown): string | undefined {
    if (!error || typeof error !== "object" || !("code" in error)) {
      return undefined;
    }

    const code = error.code;
    return typeof code === "string" ? code : undefined;
  }

  private passwordMatchValidator(
    group: FormGroup
  ): Record<string, boolean> | null {
    const password = group.get("password")?.value;
    const confirmPassword = group.get("confirmPassword")?.value;
    return password === confirmPassword ? null : { passwordMismatch: true };
  }

  private getErrorMessage(errorCode: string | undefined): string {
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
    this._router.navigate(["/account"]);
  }

  navigateToProfile(): void {
    this._router.navigate(["/profile"]);
  }

  navigateToForgotPassword(): void {
    this._router.navigate(["/forgot-password"]);
  }
}
