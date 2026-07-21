import { ComponentFixture, TestBed } from "@angular/core/testing";
import { MAT_DIALOG_DATA, MatDialogRef } from "@angular/material/dialog";
import { provideNoopAnimations } from "@angular/platform-browser/animations";
import { NotificationOptInDialogComponent } from "./notification-opt-in-dialog.component";

describe("NotificationOptInDialogComponent", () => {
  let fixture: ComponentFixture<NotificationOptInDialogComponent>;
  const close = vi.fn();

  beforeEach(async () => {
    close.mockClear();
    await TestBed.configureTestingModule({
      imports: [NotificationOptInDialogComponent],
      providers: [
        provideNoopAnimations(),
        { provide: MAT_DIALOG_DATA, useValue: { context: "event_reminders" } },
        { provide: MatDialogRef, useValue: { close } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(NotificationOptInDialogComponent);
    fixture.detectChanges();
  });

  it("renders contextual, all-notifications, and dismissal actions", () => {
    const text = fixture.nativeElement.textContent;
    expect(text).toContain("Get an event reminder?");
    expect(text).toContain("Remind me");
    expect(text).toContain("Enable all notifications");
    expect(text).toContain("Not now");
  });

  it("keeps enable-all secondary to the contextual action", () => {
    const buttons = Array.from(
      fixture.nativeElement.querySelectorAll<HTMLButtonElement>("button"),
    );
    const enableAll = buttons.find((button) =>
      button.textContent?.includes("Enable all notifications"),
    );
    const contextual = buttons.find((button) =>
      button.textContent?.includes("Remind me"),
    );

    expect(enableAll?.classList.contains("mat-mdc-outlined-button")).toBe(true);
    expect(contextual?.classList.contains("mat-mdc-unelevated-button")).toBe(
      true,
    );
  });

  it("returns the selected action", () => {
    fixture.componentInstance.close("all");
    expect(close).toHaveBeenCalledWith("all");
  });
});
