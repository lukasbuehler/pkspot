import { Component, OnInit } from "@angular/core";
import { AuthenticationService } from "../services/firebase/authentication.service";
import {
  UntypedFormBuilder,
  UntypedFormGroup,
  Validators,
  FormsModule,
  ReactiveFormsModule,
} from "@angular/forms";
import { Router, RouterLink } from "@angular/router";
import { MatDivider } from "@angular/material/divider";
import { MatButton } from "@angular/material/button";
import { NgIf, NgOptimizedImage } from "@angular/common";
import { MatInput } from "@angular/material/input";
import { MatFormField, MatLabel, MatError } from "@angular/material/form-field";
import { MatIconModule } from "@angular/material/icon";
import { MatTooltipModule } from "@angular/material/tooltip";

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
    NgIf,
    MatError,
    MatButton,
    RouterLink,
    MatDivider,
    MatIconModule,
    NgOptimizedImage,
    MatTooltipModule,
  ],
})
export class SignInPageComponent implements OnInit {
  signInForm?: UntypedFormGroup;
  signInError: string = "";

  constructor(
    private _authService: AuthenticationService,
    private _formBuilder: UntypedFormBuilder,
    private _router: Router
  ) {}

  ngOnInit() {
    this.signInForm = this._formBuilder.group({
      email: ["", [Validators.required, Validators.email]],
      password: ["", [Validators.required]],
    });
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
    let email = signInFormValue.email;
    let password = signInFormValue.password;

    email = String(email).toLowerCase().trim();
    this._authService.signInEmailPassword(email, password).then(
      (res) => {
        // login and return the user to where they were or to the home page if
        // no information is available.
        this._router.navigateByUrl("/");
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
            this.signInError = $localize`The E-mail address and password do not match for any existing user.`;
            break;
          default:
            this.signInError = $localize`An unknown error has occured on sign in. Please try again.`;
            break;
        }
      }
    );
  }

  trySignInGoogle() {
    this._authService
      .signInGoogle()
      .then(() => {
        console.log("Successfully signed in with google :)");
      })
      .catch((err) => {
        console.error(err);
      });
  }
}
