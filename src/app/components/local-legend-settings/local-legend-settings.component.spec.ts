import { signal } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { MatDialog } from "@angular/material/dialog";
import { describe, expect, it, vi } from "vitest";
import { LocalLegendService } from "../../services/local-legend.service";
import { LocalLegendSettingsComponent } from "./local-legend-settings.component";
import { LocalLegendDataDialogComponent } from "../local-legend-data-dialog/local-legend-data-dialog.component";

describe("LocalLegendSettingsComponent", () => {
  it("keeps data management available while participation is off", () => {
    const dialog = {open: vi.fn()};
    TestBed.configureTestingModule({providers: [
      {provide: MatDialog, useValue: dialog},
      {provide: LocalLegendService, useValue: {state: signal("off"), enabled: signal(false), saving: signal(false)}},
    ]});
    const fixture = TestBed.createComponent(LocalLegendSettingsComponent);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain("Local Legend is for people aged 16 and older.");
    const button = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll("button"))
      .find((item) => item.textContent?.includes("Manage Local Legend data"))!;
    expect(button.disabled).toBe(false);
    button.click();
    expect(dialog.open).toHaveBeenCalledWith(LocalLegendDataDialogComponent, expect.objectContaining({data: {withdraw: false}}));
  });
});
