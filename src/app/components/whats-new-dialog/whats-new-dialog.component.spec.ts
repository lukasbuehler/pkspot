import { TestBed } from "@angular/core/testing";
import { provideRouter } from "@angular/router";
import { MAT_DIALOG_DATA, MatDialogRef } from "@angular/material/dialog";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AnalyticsService } from "../../services/analytics.service";
import { ConsentService } from "../../services/consent.service";
import { PlatformService } from "../../services/platform.service";
import { WHATS_NEW_RELEASE, WHATS_NEW_STORAGE_KEY } from "../../services/whats-new";
import { WhatsNewDialogComponent } from "./whats-new-dialog.component";

function render(consentVersion: string | null, platform: "ios" | "android" | "web") {
  const close = vi.fn();
  const grantConsent = vi.fn();
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: MAT_DIALOG_DATA, useValue: { consentVersion } },
      { provide: MatDialogRef, useValue: { close } },
      { provide: ConsentService, useValue: { grantConsent } },
      { provide: AnalyticsService, useValue: { trackEvent: vi.fn() } },
      { provide: PlatformService, useValue: { getPlatform: () => platform } },
    ],
  });
  const fixture = TestBed.createComponent(WhatsNewDialogComponent);
  fixture.detectChanges();
  return { fixture, element: fixture.nativeElement as HTMLElement, close, grantConsent };
}

describe("WhatsNewDialogComponent", () => {
  afterEach(() => localStorage.clear());

  it("asks returning users to agree to the updated terms and records the release", () => {
    const { element, close, grantConsent, fixture } = render("7", "web");
    expect(element.textContent).toContain("PK Spot 1.2 is here");
    expect(element.textContent).toContain("Become the local legend");
    expect(element.textContent).toContain("We updated our Privacy Policy");
    // No store review on the web.
    expect(element.querySelector(".whats-new__review")).toBeNull();

    fixture.componentInstance.continue();
    expect(localStorage.getItem("acceptedVersion")).toBe("7");
    expect(localStorage.getItem(WHATS_NEW_STORAGE_KEY)).toBe(WHATS_NEW_RELEASE);
    expect(grantConsent).toHaveBeenCalled();
    expect(close).toHaveBeenCalledWith(true);
  });

  it("invites a review in the matching store and never treats feedback as agreeing", () => {
    const { element, fixture, grantConsent, close } = render("7", "android");
    expect(element.querySelector<HTMLAnchorElement>(".whats-new__review a")?.href).toContain("play.google.com");
    fixture.componentInstance.sendFeedback();
    expect(grantConsent).not.toHaveBeenCalled();
    expect(close).not.toHaveBeenCalled();
    expect(localStorage.getItem("acceptedVersion")).toBeNull();
  });

  it("shows only the highlights when the terms are current", () => {
    const { element } = render(null, "ios");
    expect(element.textContent).not.toContain("We updated our Privacy Policy");
    expect(element.textContent).toContain("Let's go");
    expect(element.querySelector<HTMLAnchorElement>(".whats-new__review a")?.href).toContain("apps.apple.com");
  });
});
