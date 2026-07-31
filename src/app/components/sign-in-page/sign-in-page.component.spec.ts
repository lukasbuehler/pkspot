import { ChangeDetectionStrategy, Component, signal } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { provideRouter, Router } from "@angular/router";
import { RouterTestingHarness } from "@angular/router/testing";
import { BehaviorSubject } from "rxjs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AnalyticsService } from "../../services/analytics.service";
import { FirebaseAppCheckService } from "../../services/firebase/app-check.service";
import { AuthenticationService } from "../../services/firebase/authentication.service";
import { MetaTagService } from "../../services/meta-tag.service";
import { UiLanguageService } from "../../services/ui-language.service";
import { SignInPageComponent } from "./sign-in-page.component";

@Component({
  template: "",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class ReturnTargetComponent {}

describe("SignInPageComponent", () => {
  const authState = new BehaviorSubject<{ uid: string } | null>(null);
  const firebaseAuth = {
    currentUser: null as { uid: string } | null,
  };

  beforeEach(() => {
    authState.next(null);
    firebaseAuth.currentUser = null;

    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: "account", component: SignInPageComponent },
          { path: "map", component: ReturnTargetComponent },
        ]),
        {
          provide: AuthenticationService,
          useValue: {
            authState$: authState,
            auth: firebaseAuth,
          },
        },
        {
          provide: UiLanguageService,
          useValue: {
            currentUiLocale: "en",
            changeLanguage: vi.fn(),
          },
        },
        {
          provide: MetaTagService,
          useValue: { setStaticPageMetaTags: vi.fn() },
        },
        {
          provide: AnalyticsService,
          useValue: { trackEvent: vi.fn() },
        },
        {
          provide: FirebaseAppCheckService,
          useValue: {
            status: signal({ state: "ready" as const }),
          },
        },
      ],
    }).overrideComponent(SignInPageComponent, {
      set: { template: "" },
    });
  });

  it("returns after OAuth when Firebase authenticated before the success callback", async () => {
    const harness = await RouterTestingHarness.create();
    const component = await harness.navigateByUrl(
      "/account?returnUrl=%2Fmap",
      SignInPageComponent,
    );

    authState.next({ uid: "google-user" });
    firebaseAuth.currentUser = { uid: "google-user" };
    component.startAuthAttempt();
    component.onOAuthSuccess();
    await harness.fixture.whenStable();

    expect(TestBed.inject(Router).url).toBe("/map");
  });
});
