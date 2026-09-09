import {ComponentFixture, TestBed} from "@angular/core/testing";
import {MatDialogRef} from "@angular/material/dialog";
import {beforeEach, describe, expect, it, vi} from "vitest";
import {AgeAssuranceService} from "../../services/age-assurance.service";
import {PlatformService} from "../../services/platform.service";
import {AdultVerificationDialogComponent} from "./adult-verification-dialog.component";

const native = vi.hoisted(() => ({isNative: false}));
vi.mock("@capacitor/core", () => ({
  Capacitor: {isNativePlatform: () => native.isNative},
  registerPlugin: () => ({}),
}));
vi.mock("@capacitor/browser", () => ({Browser: {open: vi.fn()}}));

describe("AdultVerificationDialogComponent", () => {
  let fixture: ComponentFixture<AdultVerificationDialogComponent>;
  const ageAssurance = {
    externalVerificationAvailability: vi.fn(),
    beginOneIdAgeVerification: vi.fn(),
    recheckNativeAgePolicyForCurrentUser: vi.fn(),
  };
  const platform = {isNative: vi.fn(), getPlatform: vi.fn()};
  const dialogRef = {close: vi.fn()};

  beforeEach(async () => {
    vi.clearAllMocks();
    native.isNative = false;
    platform.isNative.mockReturnValue(false);
    platform.getPlatform.mockReturnValue("web");
    ageAssurance.externalVerificationAvailability.mockResolvedValue({providers: [{provider: "oneid", available: false, method: "age_check"}]});
    await TestBed.configureTestingModule({
      imports: [AdultVerificationDialogComponent],
      providers: [
        {provide: AgeAssuranceService, useValue: ageAssurance},
        {provide: PlatformService, useValue: platform},
        {provide: MatDialogRef, useValue: dialogRef},
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(AdultVerificationDialogComponent);
    await fixture.whenStable();
  });

  it("keeps verification optional and presents providers in the required order", () => {
    const text = (fixture.nativeElement as HTMLElement).textContent ?? "";
    expect(text).toContain("This is optional");
    expect(text).toContain("private check-ins stay available");
    const titles = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll("h3")).map((element) => element.textContent?.trim());
    expect(titles).toEqual(["Google Play (recommended)", "Apple age range (recommended)", "OneID"]);
  });

  it("delegates Android verification to the existing native recheck", async () => {
    native.isNative = true;
    platform.isNative.mockReturnValue(true);
    platform.getPlatform.mockReturnValue("android");
    await fixture.componentInstance.start("google_play");
    expect(ageAssurance.recheckNativeAgePolicyForCurrentUser).toHaveBeenCalledOnce();
    expect(dialogRef.close).toHaveBeenCalledOnce();
  });

  it("does not start unavailable OneID verification", async () => {
    await fixture.componentInstance.start("oneid");
    expect(ageAssurance.beginOneIdAgeVerification).not.toHaveBeenCalled();
  });
});
