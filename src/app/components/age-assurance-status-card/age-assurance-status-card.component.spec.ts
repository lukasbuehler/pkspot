import { signal, type WritableSignal } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { MatDialog } from "@angular/material/dialog";
import { of } from "rxjs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  AgeAssuranceCheckState,
  AgeAssuranceService,
} from "../../services/age-assurance.service";
import { PlatformService } from "../../services/platform.service";
import { AgeAssuranceStatusCardComponent } from "./age-assurance-status-card.component";

describe("AgeAssuranceStatusCardComponent", () => {
  let fixture: ComponentFixture<AgeAssuranceStatusCardComponent>;
  let checkState: WritableSignal<AgeAssuranceCheckState>;
  let ageAssurance: {
    checkState: typeof checkState;
    hasVerifiedAdultEligibility: ReturnType<typeof vi.fn>;
    adultEvidenceStrength: ReturnType<typeof vi.fn>;
    recheckNativeAgePolicyForCurrentUser: ReturnType<typeof vi.fn>;
    openPlayStoreListing: ReturnType<typeof vi.fn>;
  };
  let platform: "android" | "ios";
  let dialog: { open: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    checkState = signal<AgeAssuranceCheckState>({ status: "idle" });
    platform = "android";
    ageAssurance = {
      checkState,
      hasVerifiedAdultEligibility: vi.fn(() => false),
      adultEvidenceStrength: vi.fn(() => "unknown"),
      recheckNativeAgePolicyForCurrentUser: vi.fn(async () => ({
        status: "not_shared" as const,
      })),
      openPlayStoreListing: vi.fn(async () => undefined),
    };
    dialog = {
      open: vi.fn(() => ({ afterClosed: () => of(true) })),
    };

    await TestBed.configureTestingModule({
      imports: [AgeAssuranceStatusCardComponent],
      providers: [
        { provide: AgeAssuranceService, useValue: ageAssurance },
        {
          provide: PlatformService,
          useValue: {
            isNative: () => true,
            getPlatform: () => platform,
          },
        },
        { provide: MatDialog, useValue: dialog },
      ],
    }).compileComponents();
  });

  async function createComponent(): Promise<void> {
    fixture = TestBed.createComponent(AgeAssuranceStatusCardComponent);
    await fixture.whenStable();
  }

  it("explains how to recover when Google Play is not sharing", async () => {
    await createComponent();
    checkState.set({ status: "not_shared", platform: "android" });
    await fixture.whenStable();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? "";
    expect(text).toContain("Google Play is not sharing an age range");
    expect(text).toContain("three-dot menu");
    expect(text).toContain("Age range sharing");
  });

  it("rechecks without requiring an app restart", async () => {
    await createComponent();
    const button = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll("button"),
    ).find((candidate) => candidate.textContent?.includes("Check again"));

    button?.click();
    await fixture.whenStable();

    expect(ageAssurance.recheckNativeAgePolicyForCurrentUser).toHaveBeenCalledOnce();
  });

  it("opens the PK Spot Google Play listing", async () => {
    await createComponent();
    checkState.set({ status: "not_shared", platform: "android" });
    await fixture.whenStable();
    const button = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll("button"),
    ).find((candidate) => candidate.textContent?.includes("Open Google Play"));

    button?.click();
    await fixture.whenStable();

    expect(ageAssurance.openPlayStoreListing).toHaveBeenCalledOnce();
  });

  it("does not imply that a self-declared age is verified", async () => {
    await createComponent();
    checkState.set({ status: "self_declared", platform: "android" });
    await fixture.whenStable();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? "";
    expect(text).toContain("not independently checked");
    expect(text).toContain("cannot unlock a public profile");
    expect(text).not.toContain("Adult eligibility is active");
  });

  it.each([
    "verified",
    "self_declared",
    "guardian_managed",
    "not_shared",
    "verification_required",
  ] as const)("uses provider-neutral iOS text for %s", async (status) => {
    platform = "ios";
    await createComponent();
    checkState.set({ status, platform: "ios" });
    await fixture.whenStable();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? "";
    expect(text).toContain("mobile platform");
    expect(text).not.toContain("Google Play");
    expect(text).not.toContain("Google Account");
    expect(text).not.toContain("Family Link");
  });

  it("explains the iOS request before invoking the native age-range flow", async () => {
    platform = "ios";
    await createComponent();
    const button = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll("button"),
    ).find((candidate) => candidate.textContent?.includes("Check age range"));

    button?.click();
    await fixture.whenStable();

    expect(dialog.open).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({
        data: { confirmAgeRangeRequest: true },
      }),
    );
    expect(ageAssurance.recheckNativeAgePolicyForCurrentUser).toHaveBeenCalledOnce();
    expect(dialog.open.mock.invocationCallOrder[0]).toBeLessThan(
      ageAssurance.recheckNativeAgePolicyForCurrentUser.mock
        .invocationCallOrder[0],
    );
  });

  it("does not invoke the iOS request when the explanation is dismissed", async () => {
    platform = "ios";
    dialog.open.mockReturnValue({ afterClosed: () => of(false) });
    await createComponent();

    await fixture.componentInstance.recheck();

    expect(ageAssurance.recheckNativeAgePolicyForCurrentUser).not.toHaveBeenCalled();
  });
});
