import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  OnInit,
  PLATFORM_ID,
  inject,
  signal,
} from "@angular/core";
import { isPlatformBrowser } from "@angular/common";
import { MetaTagService } from "../../services/meta-tag.service";
import { RecaptchaUnavailableInSsrError } from "../../services/recaptcha.service";
import {
  AbstractControl,
  UntypedFormBuilder,
  UntypedFormGroup,
  Validators,
  FormsModule,
  ReactiveFormsModule,
} from "@angular/forms";
import { Router, RouterLink, ActivatedRoute } from "@angular/router";
import {
  AccountCreationError,
  AuthenticationService,
} from "../../services/firebase/authentication.service";
import { Auth, RecaptchaVerifier } from "firebase/auth";
import { NgOptimizedImage } from "@angular/common";
import { MatCheckbox } from "@angular/material/checkbox";
import { MatInput } from "@angular/material/input";
import { MatFormField, MatLabel, MatHint } from "@angular/material/form-field";
import { MatButton } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { MatDividerModule } from "@angular/material/divider";
import { RecaptchaService } from "../../services/recaptcha.service";
import { ConsentService } from "../../services/consent.service";
import { Subscription } from "rxjs";
import { AutoScrollOnFocusDirective } from "../../directives/auto-scroll-on-focus.directive";
import { AnalyticsService } from "../../services/analytics.service";

@Component({
  selector: "app-sign-up-page",
  templateUrl: "./sign-up-page.component.html",
  styleUrls: ["./sign-up-page.component.scss"],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MatButton,
    RouterLink,
    FormsModule,
    ReactiveFormsModule,
    MatFormField,
    MatLabel,
    MatInput,
    MatHint,
    MatCheckbox,
    MatIconModule,
    NgOptimizedImage,
    MatDividerModule,
    AutoScrollOnFocusDirective,
  ],
})
export class SignUpPageComponent implements OnInit, OnDestroy {
  createAccountForm: UntypedFormGroup | undefined;
  readonly signUpError = signal("");
  readonly isSubmitting = signal(false);
  private _returnUrl: string = "/profile";
  private readonly _subscriptions = new Subscription();

  constructor(
    private _authService: AuthenticationService,
    private _formBuilder: UntypedFormBuilder,
    private _router: Router,
    private _route: ActivatedRoute,
    private _recaptchaService: RecaptchaService,
    private _consentService: ConsentService,
  ) {}

  private _recaptchaSolved = false;
  private _recaptchaSetupCompleted = false;
  private readonly _metaTagService = inject(MetaTagService);
  private readonly _platformId = inject(PLATFORM_ID);
  private readonly _analytics = inject(AnalyticsService);

  ngOnInit(): void {
    this._metaTagService.setStaticPageMetaTags(
      $localize`:@@signup.meta.title:Create account`,
      $localize`:@@signup.meta.description:Create a free PK Spot account to find spots, check in, and connect with your local parkour community.`,
      undefined,
      "/sign-up",
    );

    this.createAccountForm = this._formBuilder.group(
      {
        displayName: ["", [Validators.required]],
        email: ["", [Validators.required, Validators.email]],
        password: ["", [Validators.required, Validators.minLength(6)]],
        repeatPassword: ["", [Validators.required]],
        agreeCheck: [false, [Validators.requiredTrue]],
      },
      {
        validators: [
          (c: AbstractControl) => {
            const password = c.get("password")?.value;
            const repeatedPassword = c.get("repeatPassword")?.value;

            if (password && repeatedPassword && password === repeatedPassword) {
              return null; // all good
            } else {
              // repeated password does not match password
              return { repeatedPasswordDoesNotMatchPassword: true };
            }
          },
        ],
      },
    );

    // Don't setup reCAPTCHA immediately - wait for explicit user interaction
    // This prevents API calls during page load even if consent was previously granted
    console.log(
      "Sign-up component initialized, waiting for user consent interaction",
    );

    // Listen for consent changes — but only when we're actually in a
    // browser. ConsentService grants consent during pre-render, which
    // used to trigger reCAPTCHA setup on the server and crash SSR with
    // `auth/operation-not-supported-in-this-environment`.
    if (isPlatformBrowser(this._platformId)) {
      this._subscriptions.add(
        this._consentService.consentGranted$.subscribe((hasConsent) => {
          if (hasConsent && !this._recaptchaSetupCompleted) {
            console.log("Consent granted, setting up reCAPTCHA");
            this.setupSignUpReCaptcha();
          }
        }),
      );
    }

    // Get the return URL from query params, default to profile page
    this._subscriptions.add(
      this._route.queryParams.subscribe((params) => {
        this._returnUrl = params["returnUrl"] || "/profile";
      }),
    );
  }

  ngOnDestroy() {
    this._subscriptions.unsubscribe();
  }

  setupSignUpReCaptcha() {
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
          console.log("recaptcha solved", response);
        },
        () => {
          // Response expired. Ask user to solve reCAPTCHA again.
          console.error("Response expired");
        },
      )
      .then((recaptcha) => {
        this._recaptchaSetupCompleted = true;
        // Guard against null and SSR; render may be undefined in some contexts
        if (recaptcha && typeof (recaptcha as any).render === "function") {
          (recaptcha as any).render();
        }
        console.log("reCAPTCHA setup completed");
      })
      .catch((error) => {
        if (error instanceof RecaptchaUnavailableInSsrError) {
          // Expected on SSR; nothing to do.
          return;
        }
        console.error("Failed to setup reCAPTCHA:", error);
        // Gracefully handle case where user hasn't granted consent
      });
  }

  tryCreateAccount(createAccountFormValue: {
    displayName: string;
    email: string;
    password: string;
    repeatPassword: string;
    agreeCheck: boolean;
  }) {
    // Guard against double submissions
    if (this.isSubmitting()) {
      console.warn(
        "Account creation already in progress, ignoring duplicate submission",
      );
      return;
    }

    this._analytics.trackEvent("auth_sign_up_attempted", {
      agreed_terms: !!createAccountFormValue.agreeCheck,
    });

    const email = String(createAccountFormValue.email).toLowerCase().trim();
    if (this.createAccountForm?.controls["email"].value !== email) {
      this.createAccountForm?.controls["email"].setValue(email, {
        emitEvent: false,
      });
    }

    if (this.createAccountForm?.invalid) {
      this.createAccountForm.markAllAsTouched();
      this.signUpError.set(this._getCreateAccountValidationError());
      this._analytics.trackEvent("auth_sign_up_invalid", {
        display_name_invalid:
          this.createAccountForm.controls["displayName"].invalid,
        email_invalid: this.createAccountForm.controls["email"].invalid,
        password_invalid: this.createAccountForm.controls["password"].invalid,
        repeat_password_invalid:
          this.createAccountForm.controls["repeatPassword"].invalid,
        terms_invalid: this.createAccountForm.controls["agreeCheck"].invalid,
      });
      return;
    }

    const displayName = createAccountFormValue.displayName;
    const password = createAccountFormValue.password;
    const repeatedPassword = createAccountFormValue.repeatPassword;
    const agreeCheck = !!createAccountFormValue.agreeCheck;

    // check that the repeated password matches the password
    if (!password || !repeatedPassword || password !== repeatedPassword) {
      console.error("Password and repeated password don't match");
      this.signUpError.set($localize`Password and repeated password don't match`);
      this._analytics.trackEvent("auth_sign_up_invalid", {
        reason: "password_mismatch",
      });
      return;
    }

    // check if the terms of service and legal shebang was accepted
    if (!agreeCheck) {
      console.error("User did not agree!");
      this.signUpError.set($localize`You need to agree to the terms and conditions!`);
      this._analytics.trackEvent("auth_sign_up_invalid", {
        reason: "terms_not_accepted",
      });
      return;
    }

    // only then create a new account
    this._createAccount(email, password, displayName);
  }

  private _createAccount(email: string, password: string, displayName: string) {
    this.isSubmitting.set(true);
    this.signUpError.set("");

    this._authService
      .createAccount(email, password, displayName)
      .then(() => {
        console.log("Created account!");
        this._analytics.trackEvent("auth_sign_up_succeeded");
        this._router.navigateByUrl(this._returnUrl);
      })
      .catch((err) => {
        const errorCode = this._getAuthErrorCode(err);
        const failureStage =
          err instanceof AccountCreationError ? err.stage : "unknown";
        console.error("Account creation request failed", {
          error_code: errorCode,
          failure_stage: failureStage,
        });
        this.signUpError.set(this._getAccountCreationErrorMessage(errorCode));
        this._analytics.trackEvent("auth_sign_up_failed", {
          error_code: errorCode,
          failure_stage: failureStage,
        });
        this.isSubmitting.set(false);
      });
  }

  private _getCreateAccountValidationError(): string {
    const form = this.createAccountForm;
    if (!form) {
      return $localize`Could not create account!`;
    }

    if (form.hasError("repeatedPasswordDoesNotMatchPassword")) {
      return $localize`Password and repeated password don't match`;
    }

    if (form.controls["agreeCheck"].invalid) {
      return $localize`You need to agree to the terms and conditions!`;
    }

    return $localize`Could not create account!`;
  }

  private _getAuthErrorCode(error: unknown): string | null {
    if (typeof error === "object" && error !== null && "code" in error) {
      const code = (error as { code: unknown }).code;
      return typeof code === "string" ? code : null;
    }

    return null;
  }

  private _getAccountCreationErrorMessage(code: string | null): string {
    switch (code) {
      case "auth/wrong-password":
        return $localize`An account already exists for this email. Sign in or reset your password.`;
      case "auth/invalid-credential":
        return $localize`Invalid email or password.`;
      case "auth/user-disabled":
        return $localize`This account has been disabled. Please contact support.`;
      default:
        return $localize`Could not create account!`;
    }
  }
}
