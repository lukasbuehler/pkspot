import { signal } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { MatDialogRef } from "@angular/material/dialog";
import { describe, expect, it, vi } from "vitest";
import { LocalLegendService } from "../../services/local-legend.service";
import { LocalLegendJoinDialogComponent } from "./local-legend-join-dialog.component";

function render() {
  const close = vi.fn();
  const setEnabled = vi.fn().mockResolvedValue(undefined);
  TestBed.configureTestingModule({
    providers: [
      { provide: MatDialogRef, useValue: { close } },
      { provide: LocalLegendService, useValue: { setEnabled, saving: signal(false) } },
    ],
  });
  const fixture = TestBed.createComponent(LocalLegendJoinDialogComponent);
  fixture.detectChanges();
  return { fixture, element: fixture.nativeElement as HTMLElement, close, setEnabled };
}

describe("LocalLegendJoinDialogComponent", () => {
  it("explains the comparison and that participation is optional", () => {
    const { element } = render();
    expect(element.textContent).toContain("Join Local Legend");
    expect(element.textContent).toContain("compare participating accounts");
    expect(element.textContent).toContain("Ranks count days, not hours");
    expect(element.textContent).toContain("Participation is optional");
    expect(element.textContent).toContain("Local Legend is for people aged 16 and older.");
  });

  it("keeps the dialog open until the server saves the choice and prevents duplicate saves", async () => {
    const {fixture, setEnabled, close} = render();
    let finish!: () => void;
    setEnabled.mockImplementation(() => new Promise<void>(resolve => {finish = resolve;}));
    const choosing = fixture.componentInstance.choose(true);
    expect(close).not.toHaveBeenCalled();
    expect(TestBed.inject(MatDialogRef).disableClose).toBe(true);
    // The Enable button shows Material's in-button progress state, keeping its size.
    await fixture.whenStable();
    const enable = (fixture.nativeElement as HTMLElement).querySelectorAll("button")[1];
    expect(enable.classList).toContain("mat-mdc-button-progress-indicator-shown");
    expect(enable.querySelector(".mat-mdc-button-progress-indicator-container mat-spinner")).not.toBeNull();
    await fixture.componentInstance.choose(false);
    expect(setEnabled).toHaveBeenCalledOnce();
    finish();
    await choosing;
    expect(close).toHaveBeenCalledWith(true);
  });

  it("keeps the choice available when saving fails", async () => {
    const {fixture, setEnabled, close} = render();
    setEnabled.mockRejectedValue(new Error("offline"));
    await fixture.componentInstance.choose(true);
    expect(close).not.toHaveBeenCalled();
    expect(fixture.componentInstance.choosing()).toBe(null);
    expect(TestBed.inject(MatDialogRef).disableClose).toBe(false);
  });

  it("joins only from the explicit button and records Not now as off", async () => {
    const joined = render();
    await joined.fixture.componentInstance.choose(true);
    expect(joined.setEnabled).toHaveBeenCalledWith(true);
    expect(joined.close).toHaveBeenCalledWith(true);

    TestBed.resetTestingModule();
    const declined = render();
    await declined.fixture.componentInstance.choose(false);
    expect(declined.setEnabled).toHaveBeenCalledWith(false);
    expect(declined.close).toHaveBeenCalledWith(false);
  });
});
