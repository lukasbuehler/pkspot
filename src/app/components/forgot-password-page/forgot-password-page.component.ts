import { Component, OnInit } from "@angular/core";
import {
  UntypedFormBuilder,
  UntypedFormGroup,
  Validators,
  FormsModule,
  ReactiveFormsModule,
} from "@angular/forms";
import { Router } from "@angular/router";
import { AuthenticationService } from "../../services/firebase/authentication.service";
import { RecaptchaVerifier, sendPasswordResetEmail } from "firebase/auth";
import { MatIcon } from "@angular/material/icon";
import { MatButton } from "@angular/material/button";
import { MatInput } from "@angular/material/input";
import { MatFormField, MatLabel, MatError } from "@angular/material/form-field";
import { RecaptchaService } from "../../services/recaptcha.service";
import { ConsentService } from "../../services/consent.service";

@Component({
  selector: "app-forgot-password-page",
  templateUrl: "./forgot-password-page.component.html",
  styleUrls: ["./forgot-password-page.component.scss"],
  imports: [
    FormsModule,
    ReactiveFormsModule,
    MatFormField,
    MatLabel,
    MatInput,
    MatError,
    MatButton,
    MatIcon,
  ],
})
export class ForgotPasswordPageComponent implements OnInit {
  forgotPasswordForm: UntypedFormGroup;
  forgotPasswordError: string = "";

  private _recaptchaSolved = false;
  private _recaptchaSetupCompleted = false;
  recaptcha: RecaptchaVerifier | null = null;
  sendingSuccessful: boolean = false;

  constructor(
    private _authService: AuthenticationService,
    private _formBuilder: UntypedFormBuilder,
    private _router: Router,
    private _recaptchaService: RecaptchaService,
    private _consentService: ConsentService
  ) {
    this.forgotPasswordForm = this._formBuilder.group({
      email: ["", [Validators.required, Validators.email]],
    });
  }

  ngOnInit(): void {
    // Don't setup reCAPTCHA immediately - wait for explicit user interaction
    // This prevents API calls during page load even if consent was previously granted
    console.log(
      "Forgot password component initialized, waiting for user consent interaction"
    );

    // Listen for consent changes
    this._consentService.consentGranted$.subscribe((hasConsent) => {
      if (hasConsent && !this._recaptchaSetupCompleted) {
        console.log("Consent granted, setting up reCAPTCHA");
        this.setupForgetPasswordReCaptcha();
      }
    });
  }

  get emailFieldHasError(): boolean {
    return (
      this.forgotPasswordForm.controls["email"].invalid &&
      (this.forgotPasswordForm.controls["email"].dirty ||
        this.forgotPasswordForm.controls["email"].touched)
    );
  }

  setupForgetPasswordReCaptcha() {
    if (this._recaptchaSetupCompleted) {
      console.log("reCAPTCHA already setup, skipping");
      return;
    }

    console.log("Setting up reCAPTCHA with consent check");

    // Use the consent-aware reCAPTCHA service
    this._recaptchaService
      .setupInvisibleRecaptcha(
        this._authService.auth,
        "reCaptchaDiv",
        (response: any) => {
          // reCAPTCHA solved, allow sign in
          this._recaptchaSolved = true;
          console.log("recaptcha solved");
          console.log(response);
        },
        () => {
          // Response expired. Ask user to solve reCAPTCHA again.
          console.error("Response expired");
        }
      )
      .then((recaptcha) => {
        this.recaptcha = recaptcha;
        this._recaptchaSetupCompleted = true;
        if (
          this.recaptcha &&
          typeof (this.recaptcha as any).render === "function"
        ) {
          (this.recaptcha as any).render();
        }
        console.log("reCAPTCHA setup completed");
      })
      .catch((error) => {
        console.error("Failed to setup reCAPTCHA:", error);
        // Gracefully handle case where user hasn't granted consent
      });
  }

  resetPassword(forgotPasswordFormValue: { email: string }) {
    console.log("resetting password");

    if (this.sendingSuccessful) {
      console.log("The email was already sent!");
      return;
    }

    let email = forgotPasswordFormValue.email;
    if (this.recaptcha && !this._recaptchaSolved) {
      this.recaptcha.verify().then(
        (str) => {
          console.log(str);
          this.sendingSuccessful = true;
        },
        (err) => {
          console.error(err);
        }
      );
    }
    sendPasswordResetEmail(this._authService.auth, email);
  }
}
