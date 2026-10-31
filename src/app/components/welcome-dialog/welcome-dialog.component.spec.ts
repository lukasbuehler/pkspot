import { TestBed } from "@angular/core/testing";
import { MatDialogRef, MAT_DIALOG_DATA } from "@angular/material/dialog";
import { Router } from "@angular/router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AnalyticsService } from "../../services/analytics.service";
import { ConsentService } from "../../services/consent.service";
import { WHATS_NEW_RELEASE, WHATS_NEW_STORAGE_KEY } from "../../services/whats-new";
import { WelcomeDialogComponent } from "./welcome-dialog.component";

describe("WelcomeDialogComponent", () => {
  const close = vi.fn(), grantConsent = vi.fn(), trackEvent = vi.fn(), navigateByUrl = vi.fn();
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.removeItem("acceptedVersion");
    localStorage.removeItem(WHATS_NEW_STORAGE_KEY);
    TestBed.configureTestingModule({ providers: [
      WelcomeDialogComponent,
      { provide: MatDialogRef, useValue: { close } },
      { provide: MAT_DIALOG_DATA, useValue: { version: "7" } },
      { provide: ConsentService, useValue: { grantConsent } },
      { provide: AnalyticsService, useValue: { trackEvent } },
      { provide: Router, useValue: { navigateByUrl } },
    ] });
  });
  afterEach(() => {
    localStorage.removeItem("acceptedVersion");
    localStorage.removeItem(WHATS_NEW_STORAGE_KEY);
  });

  it("preserves agreement, consent and analytics exactly once", () => {
    const component = TestBed.inject(WelcomeDialogComponent);
    component.agreeAndContinue(); component.agreeAndContinue();
    expect(localStorage.getItem("acceptedVersion")).toBe("7");
    expect(localStorage.getItem(WHATS_NEW_STORAGE_KEY)).toBe(WHATS_NEW_RELEASE);
    expect(grantConsent).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledExactlyOnceWith(true);
    expect(trackEvent).toHaveBeenCalledExactlyOnceWith("Visitor Agreed to Terms", { version: "7", method: "welcome_dialog" });
  });

  it("keeps normal in-app links while retaining modified-click browser behavior", () => {
    const component = TestBed.inject(WelcomeDialogComponent);
    const click = new MouseEvent("click", { button: 0, cancelable: true });
    component.navigate({ event: click, path: "/about" });
    expect(click.defaultPrevented).toBe(true);
    expect(navigateByUrl).toHaveBeenCalledExactlyOnceWith("/about");
    navigateByUrl.mockClear();
    const modified = new MouseEvent("click", { button: 0, ctrlKey: true, cancelable: true });
    component.navigate({ event: modified, path: "/about" });
    expect(modified.defaultPrevented).toBe(false);
    expect(navigateByUrl).not.toHaveBeenCalled();
  });
});
