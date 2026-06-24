import { PLATFORM_ID } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { UntypedFormBuilder } from "@angular/forms";
import { ActivatedRoute, Router } from "@angular/router";
import { NEVER, of } from "rxjs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AnalyticsService } from "../../services/analytics.service";
import { ConsentService } from "../../services/consent.service";
import { AuthenticationService } from "../../services/firebase/authentication.service";
import { MetaTagService } from "../../services/meta-tag.service";
import { RecaptchaService } from "../../services/recaptcha.service";
import { SignUpPageComponent } from "./sign-up-page.component";

describe("SignUpPageComponent", () => {
  let component: SignUpPageComponent;
  let createAccount: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    createAccount = vi.fn();

    TestBed.configureTestingModule({
      providers: [
        { provide: PLATFORM_ID, useValue: "server" },
        {
          provide: MetaTagService,
          useValue: { setStaticPageMetaTags: vi.fn() },
        },
        {
          provide: AnalyticsService,
          useValue: { trackEvent: vi.fn() },
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
      inviteCode: "",
    };

    component.createAccountForm?.setValue(formValue);
    component.tryCreateAccount(formValue);

    expect(component.signUpError).toMatch(/password/i);
    expect(createAccount).not.toHaveBeenCalled();
  });

  it("shows a form-level error when terms are not accepted before account creation", () => {
    const formValue = {
      displayName: "E2E User",
      email: "e2e@example.test",
      password: "correct-horse",
      repeatPassword: "correct-horse",
      agreeCheck: false,
      inviteCode: "",
    };

    component.createAccountForm?.setValue(formValue);
    component.tryCreateAccount(formValue);

    expect(component.signUpError).toMatch(/agree|terms/i);
    expect(createAccount).not.toHaveBeenCalled();
  });
});
