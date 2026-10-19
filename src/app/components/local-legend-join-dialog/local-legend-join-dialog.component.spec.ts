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
