import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  OnInit,
  inject,
  signal,
} from "@angular/core";
import { MetaTagService } from "../../services/meta-tag.service";
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
import { NgOptimizedImage } from "@angular/common";
import { MatCheckbox } from "@angular/material/checkbox";
import { MatInput } from "@angular/material/input";
import { MatFormField, MatLabel, MatHint } from "@angular/material/form-field";
import { MatButton } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { MatDividerModule } from "@angular/material/divider";
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
  ) {}

  private readonly _metaTagService = inject(MetaTagService);
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
