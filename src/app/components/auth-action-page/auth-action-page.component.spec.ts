import { ComponentFixture, TestBed } from "@angular/core/testing";
import { ActivatedRoute, Router } from "@angular/router";
import { BehaviorSubject, of } from "rxjs";
import { Mock, vi } from "vitest";

vi.mock("firebase/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("firebase/auth")>();
  return {
    ...actual,
    applyActionCode: vi.fn(),
    confirmPasswordReset: vi.fn(),
    reload: vi.fn(),
    verifyPasswordResetCode: vi.fn(),
  };
});

import { applyActionCode, reload } from "firebase/auth";
import { AnalyticsService } from "../../services/analytics.service";
import { AuthenticationService } from "../../services/firebase/authentication.service";
import { AuthActionPageComponent } from "./auth-action-page.component";
import { resolveEmailActionAuth } from "./email-action-auth";

vi.mock("./email-action-auth", () => ({
  resolveEmailActionAuth: vi.fn(),
}));

describe("AuthActionPageComponent", () => {
  let fixture: ComponentFixture<AuthActionPageComponent>;
  let analyticsSpy: { reportError: Mock };
  let authServiceStub: {
    auth: { currentUser: { emailVerified: boolean } | null };
    user: { emailVerified: boolean };
    authState$: BehaviorSubject<{ emailVerified: boolean }>;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    analyticsSpy = { reportError: vi.fn() };
    authServiceStub = {
      auth: { currentUser: null },
      user: { emailVerified: false },
      authState$: new BehaviorSubject({ emailVerified: false }),
    };
    (resolveEmailActionAuth as Mock).mockImplementation((auth) => ({
      auth,
      apiKeySource: "app",
    }));

    TestBed.configureTestingModule({
      imports: [AuthActionPageComponent],
      providers: [
        {
          provide: ActivatedRoute,
          useValue: {
            queryParams: of({
              mode: "verifyEmail",
              oobCode: "sensitive-oob-code",
            }),
          },
        },
        { provide: Router, useValue: { navigate: vi.fn() } },
        { provide: AuthenticationService, useValue: authServiceStub },
        { provide: AnalyticsService, useValue: analyticsSpy },
      ],
    });
  });

  it("applies the code with Auth configured from the email link API key", async () => {
    const linkAuth = { currentUser: null };
    (resolveEmailActionAuth as Mock).mockReturnValueOnce({
      auth: linkAuth,
      apiKeySource: "link",
    });
    (applyActionCode as Mock).mockResolvedValueOnce(undefined);

    TestBed.overrideProvider(ActivatedRoute, {
      useValue: {
        queryParams: of({
          mode: "verifyEmail",
          oobCode: "sensitive-oob-code",
          apiKey: "link-api-key",
        }),
      },
    });
    fixture = TestBed.createComponent(AuthActionPageComponent);
    await vi.waitFor(() => {
      expect(fixture.componentInstance.state().status).toBe("success");
    });

    expect(resolveEmailActionAuth).toHaveBeenCalledWith(
      authServiceStub.auth,
      "link-api-key",
    );
    expect(applyActionCode).toHaveBeenCalledWith(
      linkAuth,
      "sensitive-oob-code",
    );
  });

  it("replaces the spinner with a privacy-safe invalid-code error", async () => {
    (applyActionCode as Mock).mockRejectedValueOnce({
      code: "auth/invalid-action-code",
      message: "Provider detail containing sensitive-oob-code",
    });

    fixture = TestBed.createComponent(AuthActionPageComponent);
    await vi.waitFor(() => {
      expect(fixture.componentInstance.state().status).toBe("error");
    });
    await fixture.whenStable();

    const text = fixture.nativeElement.textContent as string;
    expect(fixture.nativeElement.querySelector("mat-spinner")).toBeNull();
    expect(text).toContain("Verification Failed");
    expect(text).toContain("invalid or has already been used");
    expect(analyticsSpy.reportError).toHaveBeenCalledWith(
      expect.objectContaining({ name: "AuthActionError" }),
      expect.objectContaining({
        action: "verify_email",
        properties: expect.objectContaining({
          auth_action_mode: "verifyEmail",
          error_code: "auth/invalid-action-code",
        }),
      }),
    );
    expect(JSON.stringify(analyticsSpy.reportError.mock.calls)).not.toContain(
      "sensitive-oob-code",
    );
    expect(JSON.stringify(analyticsSpy.reportError.mock.calls)).not.toContain(
      "Provider detail",
    );
  });

  it("shows success when an already-used code belongs to a verified user", async () => {
    const currentUser = { emailVerified: false };
    authServiceStub.auth.currentUser = currentUser;
    (applyActionCode as Mock).mockRejectedValueOnce({
      code: "auth/invalid-action-code",
    });
    (reload as Mock).mockImplementationOnce(async () => {
      currentUser.emailVerified = true;
    });

    fixture = TestBed.createComponent(AuthActionPageComponent);
    await vi.waitFor(() => {
      expect(fixture.componentInstance.state().status).toBe("success");
    });
    await fixture.whenStable();

    const text = fixture.nativeElement.textContent as string;
    expect(fixture.nativeElement.querySelector("mat-spinner")).toBeNull();
    expect(text).toContain("Email Verified!");
    expect(authServiceStub.user.emailVerified).toBe(true);
    expect(analyticsSpy.reportError).not.toHaveBeenCalled();
  });
});
