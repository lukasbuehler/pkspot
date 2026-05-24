import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  OnDestroy,
  inject,
  ViewChild,
  AfterViewInit,
  signal,
} from "@angular/core";
import { AuthenticationService } from "../../services/firebase/authentication.service";
import {
  UntypedFormBuilder,
  UntypedFormGroup,
  Validators,
  FormsModule,
  ReactiveFormsModule,
} from "@angular/forms";
import { Router, RouterLink, ActivatedRoute } from "@angular/router";
import { Subscription, filter } from "rxjs";
import { MatDivider } from "@angular/material/divider";
import { MatButton } from "@angular/material/button";
import { MatInput } from "@angular/material/input";
import { MatFormField, MatLabel, MatError } from "@angular/material/form-field";
import { MatIconModule } from "@angular/material/icon";
import { MatProgressSpinner } from "@angular/material/progress-spinner";
import { MatTooltipModule } from "@angular/material/tooltip";
import { OAuthSignInButtonsComponent } from "../oauth-sign-in-buttons/oauth-sign-in-buttons.component";
import { UiLanguageService } from "../../services/ui-language.service";
import { languageCodes } from "../../../scripts/Languages";
import { MetaTagService } from "../../services/meta-tag.service";
import { AutoScrollOnFocusDirective } from "../../directives/auto-scroll-on-focus.directive";

@Component({
  selector: "app-sign-in-page",
  templateUrl: "./sign-in-page.component.html",
  styleUrls: ["./sign-in-page.component.scss"],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    ReactiveFormsModule,
    MatFormField,
    MatLabel,
    MatInput,
    MatError,
    MatButton,
    RouterLink,
    MatDivider,
    MatIconModule,
    MatProgressSpinner,
    MatTooltipModule,
    OAuthSignInButtonsComponent,
    AutoScrollOnFocusDirective,
  ],
})
export class SignInPageComponent implements OnInit, OnDestroy, AfterViewInit {
  readonly uiLanguage = inject(UiLanguageService);
  private readonly _metaTagService = inject(MetaTagService);

  @ViewChild(OAuthSignInButtonsComponent)
  oauthButtons?: OAuthSignInButtonsComponent;

  readonly languageCodes = languageCodes;
  readonly accountBenefits = [
    {
      icon: "public",
      title: $localize`Create and improve spots`,
      description: $localize`Add new spots, fix details, and help keep local knowledge useful for everyone.`,
    },
    {
      icon: "photo_camera",
      title: $localize`Share media`,
      description: $localize`Upload photos and videos so people can quickly understand a spot before they go.`,
    },
    {
      icon: "groups",
      title: $localize`Join the community`,
      description: $localize`Follow what others discover, contribute updates, and help keep the map alive.`,
    },
    {
      icon: "bookmark",
      title: $localize`Keep your own list`,
      description: $localize`Save favorites and come back to the spots you want to session later.`,
    },
  ];

  signInForm?: UntypedFormGroup;
  readonly signInError = signal("");
  readonly isSubmitting = signal(false);
  private _returnUrl: string = "/profile";
  private _autoStartProvider: "google" | "apple" | null = null;
  private _authSubscription?: Subscription;

  constructor(
    private _authService: AuthenticationService,
    private _formBuilder: UntypedFormBuilder,
    private _router: Router,
    private _route: ActivatedRoute,
  ) {}

  ngOnInit() {
    // SEO: previous pages would leave their title behind on this route. Set
    // a sign-in-specific title + description so the tab and crawlers
    // both see something relevant.
    this._metaTagService.setStaticPageMetaTags(
      $localize`:@@signin.meta.title:Sign in`,
      $localize`:@@signin.meta.description:Sign in to PK Spot or create a free account to find spots, check in, and connect with your local parkour community.`,
      undefined,
      "/sign-in",
    );

    this.signInForm = this._formBuilder.group({
      email: ["", [Validators.required, Validators.email]],
      password: ["", [Validators.required]],
    });

    // Get the return URL and auto-start provider from query params
    this._route.queryParams.subscribe((params) => {
      this._returnUrl = params["returnUrl"] || "/profile";
      this._autoStartProvider = params["startWith"] || null;
    });

    // Listen for successful authentication to redirect
    this._authSubscription = this._authService.authState$
      .pipe(filter((user) => user !== null && !!user.uid))
      .subscribe(() => {
        // User is now authenticated, redirect to return URL
        if (this.isSubmitting()) {
          this._router.navigateByUrl(this._returnUrl);
        }
      });
  }

  ngAfterViewInit() {
    // Auto-start OAuth flow if requested via query param
    if (this._autoStartProvider && this.oauthButtons) {
      setTimeout(() => {
        if (this._autoStartProvider === "google") {
          this.oauthButtons?.trySignInGoogle();
        } else if (this._autoStartProvider === "apple") {
          this.oauthButtons?.trySignInApple();
        }
      }, 100);
    }
  }

  ngOnDestroy() {
    this._authSubscription?.unsubscribe();
  }

  get emailFieldHasError(): boolean {
    return (
      (this.signInForm?.controls["email"].invalid &&
        (this.signInForm?.controls["email"].dirty ||
          this.signInForm?.controls["email"].touched)) ??
      false
    );
  }

  get passwordFieldHasError(): boolean {
    return this.signInForm?.controls["password"].invalid ?? false;
  }

  trySignIn(signInFormValue: { email: string; password: string }) {
    // Guard against double submissions
    if (this.isSubmitting()) {
      console.warn(
        "Sign-in already in progress, ignoring duplicate submission",
      );
      return;
    }

    if (this.signInForm?.invalid) {
      this.signInForm.markAllAsTouched();
      return;
    }

    let email = signInFormValue.email;
    let password = signInFormValue.password;

    email = String(email).toLowerCase().trim();

    this.isSubmitting.set(true);
    this.signInError.set("");

    this._authService.signInEmailPassword(email, password).then(
      () => {
        // login and return the user to where they were
        this._router.navigateByUrl(this._returnUrl);
      },
      (err) => {
        // display the error on the login form
        console.error(err);
        const code = this._getAuthErrorCode(err);
        this.signInError.set(this._getSignInErrorMessage(code));
        this.isSubmitting.set(false);
      },
    );
  }

  onOAuthError(event: { provider: "google" | "apple"; message: string }) {
    this.signInError.set(event.message);
    this.isSubmitting.set(false);
  }

  onOAuthSuccess() {
    this.isSubmitting.set(true);
    // Redirect is handled by the authState$ subscription
  }

  startAuthAttempt() {
    this.signInError.set("");
    this.isSubmitting.set(true);
  }

  private _getAuthErrorCode(err: unknown): string | undefined {
    if (typeof err !== "object" || err === null || !("code" in err)) {
      return undefined;
    }

    const code = (err as { code: unknown }).code;
    return typeof code === "string" ? code : undefined;
  }

  private _getSignInErrorMessage(code: string | undefined): string {
    switch (code) {
      case "auth/invalid-email":
        return $localize`The E-mail address is invalid!`;
      case "auth/invalid-password":
        return $localize`The password is invalid!`;
      case "auth/user-not-found":
      case "auth/wrong-password":
      case "auth/invalid-credential":
        return $localize`Invalid email or password.`;
      default:
        console.error("Unhandled Sign-In Error Code:", code);
        return $localize`An unknown error has occured on sign in. Please try again.`;
    }
  }
}
