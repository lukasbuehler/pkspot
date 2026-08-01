import { signal, type WritableSignal } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { MatDialog } from "@angular/material/dialog";
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

  beforeEach(async () => {
    checkState = signal<AgeAssuranceCheckState>({ status: "idle" });
    ageAssurance = {
      checkState,
      hasVerifiedAdultEligibility: vi.fn(() => false),
      adultEvidenceStrength: vi.fn(() => "unknown"),
      recheckNativeAgePolicyForCurrentUser: vi.fn(async () => ({
        status: "not_shared" as const,
      })),
      openPlayStoreListing: vi.fn(async () => undefined),
    };

    await TestBed.configureTestingModule({
      imports: [AgeAssuranceStatusCardComponent],
      providers: [
        { provide: AgeAssuranceService, useValue: ageAssurance },
        {
          provide: PlatformService,
          useValue: {
            isNative: () => true,
            getPlatform: () => "android",
          },
        },
        { provide: MatDialog, useValue: { open: vi.fn() } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AgeAssuranceStatusCardComponent);
    await fixture.whenStable();
  });

  it("explains how to recover when Google Play is not sharing", async () => {
    checkState.set({ status: "not_shared", platform: "android" });
    await fixture.whenStable();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? "";
    expect(text).toContain("Google Play is not sharing an age range");
    expect(text).toContain("three-dot menu");
    expect(text).toContain("Age range sharing");
  });

  it("rechecks without requiring an app restart", async () => {
    const button = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll("button"),
    ).find((candidate) => candidate.textContent?.includes("Check again"));

    button?.click();
    await fixture.whenStable();

    expect(ageAssurance.recheckNativeAgePolicyForCurrentUser).toHaveBeenCalledOnce();
  });

  it("opens the PK Spot Google Play listing", async () => {
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
    checkState.set({ status: "self_declared", platform: "android" });
    await fixture.whenStable();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? "";
    expect(text).toContain("not independently checked");
    expect(text).toContain("cannot unlock a public profile");
    expect(text).not.toContain("Adult eligibility is active");
  });
});
