import { TestBed } from "@angular/core/testing";
import { MAT_DIALOG_DATA, MatDialogRef } from "@angular/material/dialog";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RecoveryPausesService } from "../../services/firebase/firestore/recovery-pauses.service";
import {
  RecoveryPauseDialogComponent,
  type RecoveryPauseDialogData,
} from "./recovery-pause-dialog.component";

describe("RecoveryPauseDialogComponent", () => {
  const pauses = {
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  };
  const dialogRef = { close: vi.fn() };

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [RecoveryPauseDialogComponent],
      providers: [
        { provide: MAT_DIALOG_DATA, useValue: {} satisfies RecoveryPauseDialogData },
        { provide: MatDialogRef, useValue: dialogRef },
        { provide: RecoveryPausesService, useValue: pauses },
      ],
    });
    vi.clearAllMocks();
    pauses.create.mockResolvedValue("pause-1");
  });

  it("keeps the form private and saves a compact date range", async () => {
    const fixture = TestBed.createComponent(RecoveryPauseDialogComponent);
    fixture.detectChanges();
    const component = fixture.componentInstance;
    component.form.setValue({
      startedOn: "2026-08-03",
      endedOn: "2026-08-07",
      reason: "injury",
      note: "Private reset.",
    });

    await component.save();

    expect(fixture.nativeElement.textContent).toContain("never shared");
    expect(pauses.create).toHaveBeenCalledWith({
      startedOn: "2026-08-03",
      endedOn: "2026-08-07",
      reason: "injury",
      note: "Private reset.",
    });
    expect(dialogRef.close).toHaveBeenCalledWith({ changed: true });
  });

  it("renders a validation error returned by the private service", async () => {
    pauses.create.mockRejectedValue(new Error("Recovery pauses cannot overlap."));
    const fixture = TestBed.createComponent(RecoveryPauseDialogComponent);
    fixture.detectChanges();
    const component = fixture.componentInstance;
    component.form.patchValue({ startedOn: "2026-08-03", reason: "illness" });

    await component.save();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain("cannot overlap");
    expect(dialogRef.close).not.toHaveBeenCalled();
  });
});
