import { PLATFORM_ID } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { UntypedFormBuilder } from "@angular/forms";
import { ActivatedRoute, Router } from "@angular/router";
import { NEVER, of } from "rxjs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AnalyticsService } from "../../services/analytics.service";
import { ConsentService } from "../../services/consent.service";
import {
  AccountCreationError,
  AuthenticationService,
} from "../../services/firebase/authentication.service";
import { MetaTagService } from "../../services/meta-tag.service";
import { RecaptchaService } from "../../services/recaptcha.service";
import { SignUpPageComponent } from "./sign-up-page.component";

describe("SignUpPageComponent", () => {
  let component: SignUpPageComponent;
  let createAccount: ReturnType<typeof vi.fn>;
  let analytics: { trackEvent: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    createAccount = vi.fn();
    analytics = { trackEvent: vi.fn() };

    TestBed.configureTestingModule({
      providers: [
        { provide: PLATFORM_ID, useValue: "server" },
        {
          provide: MetaTagService,
          useValue: { setStaticPageMetaTags: vi.fn() },
        },
        {
          provide: AnalyticsService,
          useValue: analytics,
        },
      ],
    });

    component = TestBed.runInInjectionContext(
      () =>
        new SignUpPageComponent(
          {
            auth: {},
            authState$: NEVER,
            createAccount,
          } as unknown as AuthenticationService,
          new UntypedFormBuilder(),
          { navigateByUrl: vi.fn() } as unknown as Router,
          { queryParams: of({}) } as unknown as ActivatedRoute,
          { setupInvisibleRecaptcha: vi.fn() } as unknown as RecaptchaService,
          { consentGranted$: NEVER } as unknown as ConsentService,
        ),
    );

    component.ngOnInit();
  });

  it("shows a form-level error for mismatched passwords before account creation", () => {
    const formValue = {
      displayName: "E2E User",
      email: "e2e@example.test",
      password: "correct-horse",
      repeatPassword: "wrong-horse",
      agreeCheck: true,
    };

    component.createAccountForm?.setValue(formValue);
    component.tryCreateAccount(formValue);

    expect(component.signUpError()).toMatch(/password/i);
    expect(createAccount).not.toHaveBeenCalled();
  });

  it("shows a form-level error when terms are not accepted before account creation", () => {
    const formValue = {
      displayName: "E2E User",
      email: "e2e@example.test",
      password: "correct-horse",
      repeatPassword: "correct-horse",
      agreeCheck: false,
    };

    component.createAccountForm?.setValue(formValue);
    component.tryCreateAccount(formValue);

    expect(component.signUpError()).toMatch(/agree|terms/i);
    expect(createAccount).not.toHaveBeenCalled();
  });

  it("submits a valid email/password form without a hidden invite code", async () => {
    createAccount.mockResolvedValue(undefined);
    const formValue = {
      displayName: "E2E User",
      email: "E2E@Example.test ",
      password: "correct-horse",
      repeatPassword: "correct-horse",
      agreeCheck: true,
    };

    component.createAccountForm?.setValue(formValue);
    component.tryCreateAccount(formValue);

    await vi.waitFor(() =>
      expect(createAccount).toHaveBeenCalledWith(
        "e2e@example.test",
        "correct-horse",
        "E2E User",
      ),
    );
    expect(component.signUpError()).toBe("");
    expect(analytics.trackEvent).toHaveBeenCalledWith(
      "auth_sign_up_succeeded",
    );
  });

  it.each([
    [
      "auth/wrong-password",
      "An account already exists for this email. Sign in or reset your password.",
    ],
    ["auth/invalid-credential", "Invalid email or password."],
    [
      "auth/user-disabled",
      "This account has been disabled. Please contact support.",
    ],
  ])("shows a useful recovery message for %s", async (code, message) => {
    createAccount.mockRejectedValue(
      new AccountCreationError("firebase_auth", code),
    );
    const formValue = {
      displayName: "Existing User",
      email: "existing@example.test",
      password: "wrong-password",
      repeatPassword: "wrong-password",
      agreeCheck: true,
    };

    component.createAccountForm?.setValue(formValue);
    component.tryCreateAccount(formValue);

    await vi.waitFor(() => expect(component.signUpError()).toBe(message));
    expect(analytics.trackEvent).toHaveBeenCalledWith("auth_sign_up_failed", {
      error_code: code,
      failure_stage: "firebase_auth",
    });
  });
});
