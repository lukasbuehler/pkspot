import {
  Component,
  OnInit,
  OnDestroy,
  inject,
  ViewChild,
  AfterViewInit,
} from "@angular/core";
import { AuthenticationService } from "../../services/firebase/authentication.service";
import { ResponsiveService } from "../../services/responsive.service";
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
import { MatTooltipModule } from "@angular/material/tooltip";
import { OAuthSignInButtonsComponent } from "../oauth-sign-in-buttons/oauth-sign-in-buttons.component";

@Component({
  selector: "app-sign-in-page",
  templateUrl: "./sign-in-page.component.html",
  styleUrls: ["./sign-in-page.component.scss"],
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
    MatTooltipModule,
    OAuthSignInButtonsComponent,
  ],
})
export class SignInPageComponent implements OnInit, OnDestroy, AfterViewInit {
  readonly responsive = inject(ResponsiveService);

  @ViewChild(OAuthSignInButtonsComponent)
  oauthButtons?: OAuthSignInButtonsComponent;

  signInForm?: UntypedFormGroup;
  signInError: string = "";
  isSubmitting: boolean = false;
  private _returnUrl: string = "/profile";
  private _autoStartProvider: "google" | "apple" | null = null;
  private _authSubscription?: Subscription;

  constructor(
    private _authService: AuthenticationService,
    private _formBuilder: UntypedFormBuilder,
    private _router: Router,
    private _route: ActivatedRoute
  ) {}

  ngOnInit() {
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
        if (this.isSubmitting) {
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
    if (this.isSubmitting) {
      console.warn(
        "Sign-in already in progress, ignoring duplicate submission"
      );
      return;
    }

    let email = signInFormValue.email;
    let password = signInFormValue.password;

    email = String(email).toLowerCase().trim();

    this.isSubmitting = true;
    this.signInError = "";

    this._authService.signInEmailPassword(email, password).then(
      (res) => {
        // login and return the user to where they were
        this._router.navigateByUrl(this._returnUrl);
      },
      (err) => {
        // display the error on the login form
        console.error(err);
        switch (err.code) {
          case "auth/invalid-email":
            this.signInError = $localize`The E-mail address is invalid!`;
            break;
          case "auth/invalid-password":
            this.signInError = $localize`The password is invalid!`;
            break;
          case "auth/user-not-found":
          case "auth/wrong-password":
          case "auth/invalid-credential":
            this.signInError = $localize`Invalid email or password.`;
            break;
          default:
            console.error("Unhandled Sign-In Error Code:", err.code);
            this.signInError = $localize`An unknown error has occured on sign in. Please try again.`;
            break;
        }
        this.isSubmitting = false;
      }
    );
  }

  onOAuthError(event: { provider: "google" | "apple"; message: string }) {
    this.signInError = event.message;
    this.isSubmitting = false;
  }

  onOAuthSuccess() {
    this.isSubmitting = true;
    // Redirect is handled by the authState$ subscription
  }
}
