import { signal } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { ActivatedRoute, convertToParamMap, Router } from "@angular/router";
import { MatDialog } from "@angular/material/dialog";
import { BehaviorSubject } from "rxjs";
import { vi } from "vitest";

import { AuthenticationService } from "../../services/firebase/authentication.service";
import { ConsentService } from "../../services/consent.service";
import { MetaTagService } from "../../services/meta-tag.service";
import { AgeAssuranceService } from "../../services/age-assurance.service";
import { FirebaseAppCheckService } from "../../services/firebase/app-check.service";
import { FeatureTelemetryService } from "../../services/feature-telemetry.service";
import { MapPerformanceProfilerService } from "../../services/map-performance-profiler.service";
import { ExternalMediaPreferencesService } from "../../services/external-media-preferences.service";
import { AppSettingsService } from "../../services/app-settings.service";
import { AccountPreferencesService } from "../../services/account-preferences.service";
import { UiLanguageService } from "../../services/ui-language.service";
import { AnalyticsService } from "../../services/analytics.service";
import { UsersService } from "../../services/firebase/firestore/users.service";
import { LocationAccessService } from "../../services/location-access.service";
import { SettingsPageComponent } from "./settings-page.component";

type StubUser = {
  uid?: string;
  email?: string;
  data?: { data: Record<string, unknown> };
};

describe("SettingsPageComponent", () => {
  let user: StubUser;
  let authState$: BehaviorSubject<StubUser | null>;

  beforeEach(() => {
    // The real service mutates and re-emits one user object, as it does when
    // Firestore returns the profile after the auth session is restored.
    user = { uid: "user-1", email: "rider@example.com" };
    authState$ = new BehaviorSubject<StubUser | null>(user);

    TestBed.configureTestingModule({
      imports: [SettingsPageComponent],
      providers: [
        {
          provide: AuthenticationService,
          useValue: {
            user,
            authState$,
            initialAuthStateResolved: signal(true),
            preparePopupSignIn: vi.fn(),
          },
        },
        { provide: ConsentService, useValue: { hasConsent: signal(true) } },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              paramMap: convertToParamMap({}),
              queryParamMap: convertToParamMap({}),
            },
          },
        },
        { provide: Router, useValue: { navigate: vi.fn() } },
        { provide: MetaTagService, useValue: { setStaticPageMetaTags: vi.fn() } },
        {
          provide: AgeAssuranceService,
          useValue: { hasVerifiedAdultEligibility: () => true },
        },
        {
          provide: FirebaseAppCheckService,
          useValue: { status: signal({ state: "idle" }) },
        },
        { provide: MatDialog, useValue: { open: vi.fn() } },
        { provide: FeatureTelemetryService, useValue: {} },
        { provide: MapPerformanceProfilerService, useValue: {} },
        { provide: ExternalMediaPreferencesService, useValue: {} },
        { provide: AppSettingsService, useValue: {} },
        { provide: AccountPreferencesService, useValue: {} },
        { provide: UiLanguageService, useValue: {} },
        { provide: AnalyticsService, useValue: {} },
        { provide: UsersService, useValue: {} },
        { provide: LocationAccessService, useValue: {} },
      ],
    });
    // Render only the profile access state so the tests isolate change detection.
    TestBed.overrideComponent(SettingsPageComponent, {
      set: { template: "{{ profilePrivacy }}", imports: [] },
    });
  });

  it("shows the stored profile access once the profile loads after the first render", async () => {
    const fixture = TestBed.createComponent(SettingsPageComponent);
    await fixture.whenStable();
    expect(fixture.nativeElement.textContent.trim()).toBe("private");

    user.data = {
      data: {
        account_privacy: "public",
        profile_visibility: "public",
        public_profile_enabled: true,
      },
    };
    authState$.next(user);
    await fixture.whenStable();

    expect(fixture.nativeElement.textContent.trim()).toBe("public");
  });

  it("stops following auth updates once settings is destroyed", async () => {
    const fixture = TestBed.createComponent(SettingsPageComponent);
    await fixture.whenStable();
    expect(authState$.observed).toBe(true);

    fixture.destroy();

    expect(authState$.observed).toBe(false);
  });
});
