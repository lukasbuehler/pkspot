import { ComponentFixture, TestBed } from "@angular/core/testing";
import { MatDialogRef } from "@angular/material/dialog";
import { provideNoopAnimations } from "@angular/platform-browser/animations";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LocationAccessService } from "../../services/location-access.service";
import { LocationAccessDialogComponent } from "./location-access-dialog.component";

describe("LocationAccessDialogComponent", () => {
  let fixture: ComponentFixture<LocationAccessDialogComponent>;
  const locationAccess = {
    enablePersistent: vi.fn<() => Promise<void>>(),
    enableTemporarily: vi.fn<() => Promise<void>>(),
  };
  const dialogRef = { close: vi.fn() };

  beforeEach(() => {
    locationAccess.enablePersistent.mockReset();
    locationAccess.enableTemporarily.mockReset();
    locationAccess.enablePersistent.mockResolvedValue();
    locationAccess.enableTemporarily.mockResolvedValue();
    dialogRef.close.mockReset();
    TestBed.configureTestingModule({
      imports: [LocationAccessDialogComponent],
      providers: [
        provideNoopAnimations(),
        { provide: LocationAccessService, useValue: locationAccess },
        { provide: MatDialogRef, useValue: dialogRef },
      ],
    });
    fixture = TestBed.createComponent(LocationAccessDialogComponent);
  });

  it("explains the private, explicit check-in flow and enables a five-minute session", async () => {
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain("Your precise location is not stored or shared.");
    expect(fixture.nativeElement.textContent).toContain("Use for 5 minutes");

    await fixture.componentInstance.enable("temporary");

    expect(locationAccess.enableTemporarily).toHaveBeenCalledOnce();
    expect(dialogRef.close).toHaveBeenCalledWith(true);
  });
});
